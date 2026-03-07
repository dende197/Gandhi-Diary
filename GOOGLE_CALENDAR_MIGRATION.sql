-- ============================================================
-- G-Connect: Google Calendar Integration — Migration SQL
-- ============================================================
-- Esegui questo script nel SQL Editor di Supabase.
-- Crea le tabelle necessarie per la sincronizzazione con Google Calendar.
-- ============================================================

-- Tabella 1: calendar_tokens
-- Salva i token OAuth2 Google per ogni profilo utente.
CREATE TABLE IF NOT EXISTS calendar_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id      TEXT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
    access_token    TEXT NOT NULL,
    refresh_token   TEXT,
    expiry_date     BIGINT,
    calendar_id     TEXT NOT NULL DEFAULT 'primary',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indice per ricerche veloci per profile_id
CREATE INDEX IF NOT EXISTS idx_calendar_tokens_profile_id ON calendar_tokens(profile_id);

-- RLS: solo il service role può leggere/scrivere (nessun accesso client diretto)
ALTER TABLE calendar_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON calendar_tokens
    USING (auth.role() = 'service_role');

-- Tabella 2: calendar_sync_jobs
-- Salva le credenziali Argo cifrate per la sincronizzazione automatica in background.
-- Le credenziali sono cifrate con AES-256-CBC (CALENDAR_ENCRYPTION_KEY).
CREATE TABLE IF NOT EXISTS calendar_sync_jobs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id          TEXT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
    argo_school_code    TEXT NOT NULL,
    argo_credentials    TEXT NOT NULL,   -- Encrypted: "iv_hex:ciphertext_hex"
    argo_profile_index  INTEGER NOT NULL DEFAULT 0,
    last_sync           TIMESTAMPTZ,
    last_sync_created   INTEGER DEFAULT 0,
    last_sync_skipped   INTEGER DEFAULT 0,
    last_sync_errors    INTEGER DEFAULT 0,
    sync_errors_count   INTEGER NOT NULL DEFAULT 0,
    active              BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_sync_jobs_profile_id ON calendar_sync_jobs(profile_id);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_jobs_active ON calendar_sync_jobs(active) WHERE active = TRUE;

-- RLS: solo il service role
ALTER TABLE calendar_sync_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON calendar_sync_jobs
    USING (auth.role() = 'service_role');

-- Trigger per aggiornare updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calendar_tokens_updated_at
    BEFORE UPDATE ON calendar_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_calendar_sync_jobs_updated_at
    BEFORE UPDATE ON calendar_sync_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
