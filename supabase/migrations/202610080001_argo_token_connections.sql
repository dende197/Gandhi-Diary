-- Optional token renewal storage. Enable ARGO_TOKEN_REFRESH_ENABLED only after
-- applying this migration and validating the provider flow in a test environment.
BEGIN;
CREATE TABLE IF NOT EXISTS public.argo_token_connections (
 user_id text PRIMARY KEY REFERENCES public.google_tokens(user_id) ON DELETE CASCADE,
 version uuid NOT NULL,
 source text NOT NULL CHECK (source IN ('credentials','interactive')),
 client_id text NOT NULL,
 school_code text NOT NULL,
 profile_id text NOT NULL CHECK (length(profile_id) > 0),
 access_token_encrypted text NOT NULL,
 auth_token_encrypted text,
 refresh_token_encrypted text,
 expires_at timestamptz NOT NULL,
 state text NOT NULL CHECK (state IN ('active','refreshing','reauth_required')),
 last_error text CHECK (last_error IN ('ARGO_REAUTH_REQUIRED','ARGO_REFRESH_FAILED','ARGO_REFRESH_INTERRUPTED')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.argo_token_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.argo_token_connections FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.argo_token_connections TO service_role;
COMMIT;
