-- ============================================
-- MENTAL HEALTH LOGS TABLE (v1.1.68)
-- Privacy-first: RLS enabled, owner-only access
-- Run this in Supabase SQL Editor
-- ============================================

CREATE TABLE IF NOT EXISTS mental_health_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    profile_id TEXT NOT NULL,
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    stress SMALLINT NOT NULL DEFAULT 3 CHECK (stress BETWEEN 1 AND 5),
    fatigue SMALLINT NOT NULL DEFAULT 3 CHECK (fatigue BETWEEN 1 AND 5),
    sleep_hours NUMERIC(3,1) NOT NULL DEFAULT 7.0 CHECK (sleep_hours BETWEEN 0 AND 24),
    perceived_load TEXT NOT NULL DEFAULT 'medium' CHECK (perceived_load IN ('low', 'medium', 'high')),
    note TEXT DEFAULT '',
    ai_advice TEXT DEFAULT NULL,
    motivational_quote TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (profile_id, log_date)
);

-- Index for fast lookups by profile and date range
CREATE INDEX IF NOT EXISTS idx_mh_profile_date ON mental_health_logs (profile_id, log_date DESC);

-- Enable Row-Level Security
ALTER TABLE mental_health_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Service role can do everything (server-side operations)
CREATE POLICY "Service role full access" ON mental_health_logs
    FOR ALL USING (true) WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_mh_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_mh_updated_at
    BEFORE UPDATE ON mental_health_logs
    FOR EACH ROW EXECUTE FUNCTION update_mh_updated_at();
