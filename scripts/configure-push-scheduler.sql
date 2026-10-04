-- Run once on the hosted Supabase project, after configuring PUSH_CRON_SECRET
-- on Vercel and the same value in Vault under web_push_cron_token.
-- No secret belongs in this file or cron.job.command.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE SCHEMA IF NOT EXISTS push_scheduler;
REVOKE ALL ON SCHEMA push_scheduler FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS push_scheduler.requests (
 request_id bigint PRIMARY KEY,
 requested_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON push_scheduler.requests FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION push_scheduler.dispatch()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE token text; request bigint; hour_in_rome integer;
BEGIN
 DELETE FROM push_scheduler.requests WHERE requested_at<now()-interval '2 days';
 hour_in_rome := extract(hour FROM now() AT TIME ZONE 'Europe/Rome');
 IF hour_in_rome<7 OR hour_in_rome>=22 OR NOT EXISTS(SELECT 1 FROM public.web_push_devices) THEN
  RETURN NULL;
 END IF;
 SELECT decrypted_secret INTO token FROM vault.decrypted_secrets WHERE name='web_push_cron_token';
 IF token IS NULL OR length(token)<32 THEN
  RAISE EXCEPTION 'Configure web_push_cron_token in Vault before enabling the notification scheduler';
 END IF;
 SELECT net.http_get(
  url := 'https://g-connect-backend-r5j1.vercel.app/api/push?op=cron',
  headers := jsonb_build_object('Authorization','Bearer '||token),
  timeout_milliseconds := 110000
 ) INTO request;
 INSERT INTO push_scheduler.requests(request_id) VALUES(request);
 RETURN request;
END $$;
REVOKE ALL ON FUNCTION push_scheduler.dispatch() FROM PUBLIC,anon,authenticated;
-- Only the postgres-owned scheduler can dispatch; no browser-accessible RPC.
SELECT cron.schedule('gandhi-web-push','*/15 * * * *','SELECT push_scheduler.dispatch()');
COMMIT;
