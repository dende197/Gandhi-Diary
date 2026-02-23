-- Script SQL per le Tabelle Notifiche Web Push (G-Diary v2.4.0)
-- Esegui questo script nell'SQL Editor del tuo pannello Supabase

-- 1. Tabella delle iscrizioni (Sottoscrizioni Push)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    profile_id TEXT NOT NULL UNIQUE,
    subscription JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS (Row Level Security) - opzionale ma consigliato
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON public.push_subscriptions FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON public.push_subscriptions FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON public.push_subscriptions FOR UPDATE USING (true);
CREATE POLICY "Enable delete for all users" ON public.push_subscriptions FOR DELETE USING (true);


-- 2. Tabella Impostazioni Notifiche (Personalizzazione orari)
CREATE TABLE IF NOT EXISTS public.notification_settings (
    profile_id TEXT PRIMARY KEY,
    stress_enabled BOOLEAN DEFAULT true NOT NULL,
    stress_time TEXT DEFAULT '14:00' NOT NULL,
    study_enabled BOOLEAN DEFAULT true NOT NULL,
    study_time TEXT DEFAULT '15:00' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Note: TEXT was used for time because JS 'HH:mm' strings are easier to format and compare.

-- RLS
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON public.notification_settings FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON public.notification_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON public.notification_settings FOR UPDATE USING (true);
