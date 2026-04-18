-- Add argo_id_soggetto to persist the Argo profile subject ID alongside tokens.
-- This avoids returning idSoggetto: null in the cached refresh-session path.
ALTER TABLE google_tokens
  ADD COLUMN IF NOT EXISTS argo_id_soggetto TEXT;
