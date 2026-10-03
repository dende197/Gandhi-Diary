BEGIN;
-- Select after observation transactions commit, using the same clock as the
-- outbox defaults. No caller-supplied timestamp can defer newly queued messages.
CREATE FUNCTION public.pending_web_push_jobs()
RETURNS SETOF public.web_push_outbox
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT * FROM web_push_outbox
 WHERE sent_at IS NULL AND next_attempt<=now() AND expires_at>now()
 ORDER BY id LIMIT 60;
$$;
REVOKE ALL ON FUNCTION public.pending_web_push_jobs() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pending_web_push_jobs() TO service_role;
COMMIT;
