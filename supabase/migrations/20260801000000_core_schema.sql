-- Base schema, before feature migrations.
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
