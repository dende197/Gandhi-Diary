-- Apply before deploying the matching backend. No legacy grants are trusted.
BEGIN;
CREATE TABLE IF NOT EXISTS public.profiles (id text PRIMARY KEY, name text, class text, specialization text, avatar text, last_active timestamptz);
CREATE TABLE IF NOT EXISTS public.google_tokens (user_id text PRIMARY KEY, access_token text, refresh_token text, expiry_date bigint, calendar_id text);
ALTER TABLE public.google_tokens
 ADD COLUMN IF NOT EXISTS argo_school_code text, ADD COLUMN IF NOT EXISTS argo_username text,
 ADD COLUMN IF NOT EXISTS argo_password text, ADD COLUMN IF NOT EXISTS profile_index integer DEFAULT 0,
 ADD COLUMN IF NOT EXISTS argo_access_token text, ADD COLUMN IF NOT EXISTS argo_auth_token text,
 ADD COLUMN IF NOT EXISTS argo_id_soggetto text, ADD COLUMN IF NOT EXISTS argo_tokens_expiry timestamptz,
 ADD COLUMN IF NOT EXISTS class_schedule jsonb, ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
 ADD COLUMN IF NOT EXISTS last_argo_sync timestamptz, ADD COLUMN IF NOT EXISTS last_google_sync timestamptz,
 ADD COLUMN IF NOT EXISTS last_cron_attempt timestamptz;
CREATE TABLE IF NOT EXISTS public.planners (user_id text PRIMARY KEY, planned_tasks jsonb DEFAULT '{}', stress_levels jsonb DEFAULT '{}', planned_details jsonb DEFAULT '{}', tasks jsonb DEFAULT '[]', prep_levels jsonb DEFAULT '{}', updated_at timestamptz DEFAULT now());
ALTER TABLE public.planners ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS public.manual_verifiche (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL, subject text NOT NULL, date date NOT NULL, type text NOT NULL, args text, done boolean DEFAULT false);
CREATE INDEX IF NOT EXISTS manual_verifiche_user_date ON public.manual_verifiche(user_id,date);
CREATE TABLE IF NOT EXISTS public.app_sessions (token_hash text PRIMARY KEY, user_id text NOT NULL, expires_at timestamptz NOT NULL, refresh_expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz DEFAULT now());
CREATE INDEX IF NOT EXISTS app_sessions_user ON public.app_sessions(user_id);
CREATE TABLE IF NOT EXISTS public.verified_memberships (user_id text PRIMARY KEY, class_key text NOT NULL, class_name text NOT NULL, school_code text NOT NULL, subject_id text NOT NULL, verified_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS public.class_rep_grants (user_id text NOT NULL, class_key text NOT NULL, granted_at timestamptz DEFAULT now(), PRIMARY KEY(user_id,class_key));
CREATE TABLE IF NOT EXISTS public.backend_leases (key text PRIMARY KEY, owner uuid NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS public.backend_quotas (key text PRIMARY KEY, hits integer NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS public.argo_snapshots (user_id text PRIMARY KEY, payload jsonb NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS public.summary_cache (key text PRIMARY KEY, summary text NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS public.oauth_states (nonce text PRIMARY KEY, user_id text NOT NULL, expires_at timestamptz NOT NULL);
-- Class keys now include school and year; retain old data but never expose it as a fallback.
ALTER TABLE public.class_representatives ALTER COLUMN class TYPE text;
ALTER TABLE public.proposals ALTER COLUMN class_id TYPE text;
CREATE INDEX IF NOT EXISTS google_tokens_cron_queue ON public.google_tokens(last_cron_attempt,user_id) WHERE refresh_token IS NOT NULL;

-- Remove *all* previous policies, including custom permissive policies, and deny
-- direct client access. API service_role performs ownership checks on every route.
DO $$ DECLARE t text; p record; BEGIN
 FOREACH t IN ARRAY ARRAY['profiles','google_tokens','planners','manual_verifiche','proposals','proposal_votes','class_representatives','app_sessions','verified_memberships','class_rep_grants','backend_leases','backend_quotas','argo_snapshots','summary_cache','oauth_states'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
   EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t);
  END LOOP;
  EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.acquire_backend_lease(p_key text,p_owner uuid,p_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE acquired text;
BEGIN
 INSERT INTO backend_leases(key,owner,expires_at) VALUES(p_key,p_owner,now()+make_interval(secs=>least(greatest(p_seconds,1),300)))
 ON CONFLICT(key) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE backend_leases.expires_at < now()
 RETURNING key INTO acquired;
 RETURN acquired IS NOT NULL;
END $$;
CREATE OR REPLACE FUNCTION public.release_backend_lease(p_key text,p_owner uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ DELETE FROM backend_leases WHERE key=p_key AND owner=p_owner; $$;
CREATE OR REPLACE FUNCTION public.take_backend_quota(p_key text,p_limit integer,p_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 INSERT INTO backend_quotas(key,hits,expires_at) VALUES(p_key,1,now()+make_interval(secs=>p_seconds))
 ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN backend_quotas.expires_at<=now() THEN 1 ELSE backend_quotas.hits+1 END,
 expires_at=CASE WHEN backend_quotas.expires_at<=now() THEN excluded.expires_at ELSE backend_quotas.expires_at END
 RETURNING hits INTO n;
 RETURN n <= p_limit;
END $$;
CREATE OR REPLACE FUNCTION public.save_planner(p_user text,p_version bigint,p_payload jsonb)
RETURNS SETOF public.planners LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('planner:'||p_user,0));
 INSERT INTO planners(user_id) VALUES(p_user) ON CONFLICT DO NOTHING;
 RETURN QUERY UPDATE planners SET
 planned_tasks=coalesce(p_payload->'planned_tasks',planned_tasks),
 planned_details=coalesce(p_payload->'planned_details',planned_details),
 tasks=coalesce(p_payload->'tasks',tasks), stress_levels=coalesce(p_payload->'stress_levels',stress_levels),
 prep_levels=coalesce(p_payload->'prep_levels',prep_levels), version=version+1, updated_at=now()
 WHERE user_id=p_user AND version=p_version RETURNING *;
END $$;
CREATE OR REPLACE FUNCTION public.set_class_representative(p_user text,p_class text,p_name text,p_enable boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('class:'||p_class,0));
 IF NOT EXISTS(SELECT 1 FROM verified_memberships WHERE user_id=p_user AND class_key=p_class) THEN RETURN false; END IF;
 IF NOT p_enable THEN DELETE FROM class_representatives WHERE user_id=p_user AND class=p_class; RETURN true; END IF;
 IF NOT EXISTS(SELECT 1 FROM class_rep_grants WHERE user_id=p_user AND class_key=p_class) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM class_representatives WHERE user_id=p_user AND class=p_class) THEN RETURN true; END IF;
 IF (SELECT count(*) FROM class_representatives WHERE class=p_class)>=2 THEN RETURN false; END IF;
 INSERT INTO class_representatives(user_id,class,name) VALUES(p_user,p_class,p_name)
 ON CONFLICT(user_id) DO UPDATE SET class=excluded.class,name=excluded.name,updated_at=now();
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.vote_class_proposal(p_user text,p_proposal uuid,p_vote text,p_date timestamptz,p_note text,p_name text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target public.proposals;
BEGIN
 SELECT * INTO target FROM proposals WHERE id=p_proposal FOR UPDATE;
 IF NOT FOUND OR target.status<>'PENDING' OR NOT EXISTS(SELECT 1 FROM verified_memberships WHERE user_id=p_user AND class_key=target.class_id) THEN RETURN false; END IF;
 INSERT INTO proposal_votes(proposal_id,user_id,user_name,vote,counter_proposed_date,note) VALUES(p_proposal,p_user,p_name,p_vote,p_date,p_note)
 ON CONFLICT(proposal_id,user_id) DO UPDATE SET vote=excluded.vote,counter_proposed_date=excluded.counter_proposed_date,note=excluded.note,updated_at=now();
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.create_class_proposal(p_user text,p_class text,p_name text,p_type text,p_target timestamptz,p_original timestamptz,p_subject text,p_duration text,p_reason text)
RETURNS SETOF public.proposals LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE created public.proposals;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM verified_memberships WHERE user_id=p_user AND class_key=p_class) THEN RETURN; END IF;
 INSERT INTO proposals(class_id,creator_user_id,creator_name,type,target_date,original_date,subject,duration,reason,status)
 VALUES(p_class,p_user,p_name,p_type,p_target,p_original,p_subject,p_duration,p_reason,'PENDING') RETURNING * INTO created;
 INSERT INTO proposal_votes(proposal_id,user_id,user_name,vote) VALUES(created.id,p_user,p_name,'ACCEPT');
 RETURN NEXT created;
END $$;
-- Bounded-lived operational state; invoked by the authorized daily/hourly cron.
CREATE INDEX IF NOT EXISTS app_sessions_expiry ON public.app_sessions(refresh_expires_at);
CREATE INDEX IF NOT EXISTS backend_quotas_expiry ON public.backend_quotas(expires_at);
CREATE INDEX IF NOT EXISTS oauth_states_expiry ON public.oauth_states(expires_at);
CREATE OR REPLACE FUNCTION public.prune_backend_state()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 DELETE FROM app_sessions WHERE refresh_expires_at < now() - interval '1 day';
 DELETE FROM backend_quotas WHERE expires_at < now() - interval '1 day';
 DELETE FROM oauth_states WHERE expires_at < now();
 DELETE FROM backend_leases WHERE expires_at < now() - interval '1 day';
 DELETE FROM argo_snapshots WHERE expires_at < now() - interval '1 day';
 DELETE FROM summary_cache WHERE expires_at < now() - interval '1 day';
END $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('acquire_backend_lease','release_backend_lease','take_backend_quota','save_planner','set_class_representative','vote_class_proposal','create_class_proposal','prune_backend_state') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
COMMIT;
