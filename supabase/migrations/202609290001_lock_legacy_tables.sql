-- Historical tables found during the read-only production preflight.
-- The current application has no callers for these tables. Preserve their data
-- and administrative access, but close public access before any future reuse.
BEGIN;
DO $$ DECLARE t text; p record; BEGIN
 FOREACH t IN ARRAY ARRAY['conversations','conversation_participants','mental_health_logs','push_subscriptions'] LOOP
  IF to_regclass(format('public.%I',t)) IS NULL THEN CONTINUE; END IF;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
   EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t);
  END LOOP;
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
END $$;
COMMIT;
