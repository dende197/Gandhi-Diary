-- ==============================================================================
-- Migration: 20260901_lock_rls_policies.sql
-- Hardening Supabase Row Level Security (RLS) policies.
-- Removes permissive 'USING (true) WITH CHECK (true)' policies.
-- Ensures that direct access with the public anon key cannot read or tamper with
-- proposals, votes, class representatives, Google tokens, or user profiles.
-- The backend uses the service_role key which bypasses RLS safely.
-- ==============================================================================

-- 1. Enable RLS on all sensitive tables
ALTER TABLE IF EXISTS public.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.proposal_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.class_representatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.google_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing permissive policies
DROP POLICY IF EXISTS "Allow all on proposals" ON public.proposals;
DROP POLICY IF EXISTS "Allow all on proposal_votes" ON public.proposal_votes;
DROP POLICY IF EXISTS "Allow all on class_representatives" ON public.class_representatives;
DROP POLICY IF EXISTS "Allow all on google_tokens" ON public.google_tokens;
DROP POLICY IF EXISTS "Allow all on profiles" ON public.profiles;

DROP POLICY IF EXISTS "Public read proposals" ON public.proposals;
DROP POLICY IF EXISTS "Public read proposal_votes" ON public.proposal_votes;
DROP POLICY IF EXISTS "Public read class_representatives" ON public.class_representatives;

-- 3. Lock down tables against direct anon manipulation
-- google_tokens: STRICTEST LOCKDOWN (No direct anon access ever)
CREATE POLICY "Deny anon access to google_tokens"
ON public.google_tokens
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

-- proposals: Deny anon writes (all mutations go via backend with session verification)
CREATE POLICY "Deny anon write proposals"
ON public.proposals
FOR INSERT
TO anon, authenticated
WITH CHECK (false);

CREATE POLICY "Deny anon update proposals"
ON public.proposals
FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "Deny anon delete proposals"
ON public.proposals
FOR DELETE
TO anon, authenticated
USING (false);

-- proposal_votes: Deny anon writes
CREATE POLICY "Deny anon write proposal_votes"
ON public.proposal_votes
FOR INSERT
TO anon, authenticated
WITH CHECK (false);

CREATE POLICY "Deny anon update proposal_votes"
ON public.proposal_votes
FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "Deny anon delete proposal_votes"
ON public.proposal_votes
FOR DELETE
TO anon, authenticated
USING (false);

-- class_representatives: Deny anon writes
CREATE POLICY "Deny anon write class_representatives"
ON public.class_representatives
FOR INSERT
TO anon, authenticated
WITH CHECK (false);

CREATE POLICY "Deny anon update class_representatives"
ON public.class_representatives
FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "Deny anon delete class_representatives"
ON public.class_representatives
FOR DELETE
TO anon, authenticated
USING (false);

-- profiles: Deny anon direct writes
CREATE POLICY "Deny anon write profiles"
ON public.profiles
FOR INSERT
TO anon, authenticated
WITH CHECK (false);

CREATE POLICY "Deny anon update profiles"
ON public.profiles
FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "Deny anon delete profiles"
ON public.profiles
FOR DELETE
TO anon, authenticated
USING (false);

-- Read policies for Realtime subscriptions (client listening for updates in class)
-- Note: Sensitive data like tokens and passwords are in google_tokens (which is 100% blocked).
CREATE POLICY "Allow anon read proposals"
ON public.proposals
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow anon read proposal_votes"
ON public.proposal_votes
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow anon read class_representatives"
ON public.class_representatives
FOR SELECT
TO anon, authenticated
USING (true);
