-- Argo token cache: persist access/auth tokens to avoid rawLogin on every cold start
ALTER TABLE google_tokens
  ADD COLUMN IF NOT EXISTS argo_access_token   TEXT,
  ADD COLUMN IF NOT EXISTS argo_auth_token     TEXT,
  ADD COLUMN IF NOT EXISTS argo_tokens_expiry  TIMESTAMPTZ;
