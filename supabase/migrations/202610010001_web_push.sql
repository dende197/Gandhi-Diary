BEGIN;
-- Separate from the unused historical push_subscriptions table; no legacy data is changed.
CREATE TABLE public.web_push_devices (
 id text PRIMARY KEY, user_id text NOT NULL, session_hash text NOT NULL,
 subscription jsonb NOT NULL, preferences jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX web_push_devices_user ON public.web_push_devices(user_id);
CREATE TABLE public.web_push_poll (
 user_id text PRIMARY KEY, last_attempt timestamptz, last_success timestamptz, last_error text
);
CREATE TABLE public.web_push_cursors (
 user_id text NOT NULL, category text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,category)
);
CREATE TABLE public.web_push_seen (
 user_id text NOT NULL, category text NOT NULL, event_key text NOT NULL,
 first_seen timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,category,event_key)
);
CREATE TABLE public.web_push_outbox (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 device_id text NOT NULL REFERENCES public.web_push_devices(id) ON DELETE CASCADE,
 event_key text NOT NULL, category text NOT NULL, payload jsonb NOT NULL,
 attempts integer NOT NULL DEFAULT 0, next_attempt timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours', sent_at timestamptz,
 UNIQUE(device_id,category,event_key)
);
CREATE INDEX web_push_outbox_pending ON public.web_push_outbox(next_attempt) WHERE sent_at IS NULL;

CREATE FUNCTION public.register_web_push(p_id text,p_user text,p_session text,p_subscription jsonb,p_preferences jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id,0));
 -- Reassigning this browser to a different profile also cancels its old pending messages.
 DELETE FROM web_push_devices WHERE id=p_id AND user_id<>p_user;
 IF NOT EXISTS(SELECT 1 FROM web_push_devices WHERE id=p_id) AND (SELECT count(*) FROM web_push_devices WHERE user_id=p_user)>=10 THEN
  RAISE EXCEPTION 'Troppi dispositivi registrati' USING ERRCODE='P0001';
 END IF;
 INSERT INTO web_push_devices(id,user_id,session_hash,subscription,preferences)
 VALUES(p_id,p_user,p_session,p_subscription,p_preferences)
 ON CONFLICT(id) DO UPDATE SET session_hash=excluded.session_hash,subscription=excluded.subscription,
 preferences=excluded.preferences,updated_at=now();
 INSERT INTO web_push_poll(user_id) VALUES(p_user) ON CONFLICT DO NOTHING;
END $$;

-- Observation and enqueue are one transaction. Empty/truncated responses cannot erase seen IDs.
CREATE FUNCTION public.observe_web_push(p_user text,p_category text,p_items jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous timestamptz; item jsonb; added integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user||':'||p_category,0));
 SELECT updated_at INTO previous FROM web_push_cursors WHERE user_id=p_user AND category=p_category;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  INSERT INTO web_push_seen(user_id,category,event_key) VALUES(p_user,p_category,item->>'key') ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS added=ROW_COUNT;
  IF added>0 AND previous IS NOT NULL THEN
   INSERT INTO web_push_outbox(device_id,category,event_key,payload)
   SELECT id,p_category,item->>'key',item->'payload' FROM web_push_devices
   WHERE user_id=p_user AND created_at<=previous AND preferences->>p_category='true'
   ON CONFLICT DO NOTHING;
  END IF;
 END LOOP;
 INSERT INTO web_push_cursors(user_id,category) VALUES(p_user,p_category)
 ON CONFLICT(user_id,category) DO UPDATE SET updated_at=now();
END $$;

CREATE FUNCTION public.next_web_push_users()
RETURNS SETOF public.web_push_poll LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT p.* FROM web_push_poll p WHERE EXISTS(SELECT 1 FROM web_push_devices d WHERE d.user_id=p.user_id)
 AND (p.last_attempt IS NULL OR p.last_attempt<now()-interval '10 minutes')
 ORDER BY p.last_attempt NULLS FIRST,p.user_id LIMIT 100;
$$;

CREATE FUNCTION public.prune_web_push()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 -- Retain delivery receipts beyond midnight so an expired reminder cannot be queued twice that day.
 DELETE FROM web_push_outbox WHERE expires_at<now()-interval '2 days';
 -- Keep deduplication for the entire active school year. Old backfill is filtered by the worker.
 DELETE FROM web_push_seen WHERE first_seen<now()-interval '400 days';
 DELETE FROM web_push_poll p WHERE NOT EXISTS(SELECT 1 FROM web_push_devices d WHERE d.user_id=p.user_id);
 DELETE FROM web_push_cursors c WHERE NOT EXISTS(SELECT 1 FROM web_push_devices d WHERE d.user_id=c.user_id);
 DELETE FROM web_push_seen s WHERE NOT EXISTS(SELECT 1 FROM web_push_devices d WHERE d.user_id=s.user_id);
END $$;
DO $$ DECLARE t text; f record; BEGIN
 FOREACH t IN ARRAY ARRAY['web_push_devices','web_push_poll','web_push_cursors','web_push_seen','web_push_outbox'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
 GRANT USAGE,SELECT ON SEQUENCE public.web_push_outbox_id_seq TO service_role;
 FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace
 AND proname IN ('register_web_push','observe_web_push','next_web_push_users','prune_web_push') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
COMMIT;
