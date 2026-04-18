-- Track when the last successful Argo sync occurred for each user/profile
ALTER TABLE google_tokens
  ADD COLUMN IF NOT EXISTS last_argo_sync TIMESTAMPTZ;
