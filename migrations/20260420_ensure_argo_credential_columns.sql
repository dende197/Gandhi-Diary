-- Ensure all Argo credential columns exist in google_tokens.
-- These columns are REQUIRED for the cron background sync to work:
-- the cron reads argo_school_code, argo_username, argo_password to log in on behalf of the user.
ALTER TABLE google_tokens
  ADD COLUMN IF NOT EXISTS argo_school_code  TEXT,
  ADD COLUMN IF NOT EXISTS argo_username     TEXT,
  ADD COLUMN IF NOT EXISTS argo_password     TEXT,
  ADD COLUMN IF NOT EXISTS class_schedule    JSONB,
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT now();
