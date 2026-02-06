-- ===================================================
-- 🛡️ COLLAPSE DUPLICATES: Definitiva pulizia identità
-- Questo script unisce i profili duplicati (es. "p:S1" e "p:s1")
-- e normalizza tutto nel formato lowercase + no-spaces.
-- ===================================================

BEGIN;

-- 1. Tabella temporanea con i dati migliori per ogni ID normalizzato
CREATE TEMPORARY TABLE master_profiles AS
SELECT DISTINCT ON (LOWER(REPLACE(id, ' ', '')))
    LOWER(REPLACE(id, ' ', '')) as norm_id,
    id as original_id,
    name,
    class,
    avatar,
    specialization,
    last_active
FROM public.profiles
ORDER BY LOWER(REPLACE(id, ' ', '')), last_active DESC;

-- 2. Pulizia: Rimuoviamo tutti i profili esistenti
DELETE FROM public.profiles;

-- 3. Inserimento: Ripopoliamo con i dati normalizzati e univoci
INSERT INTO public.profiles (id, name, class, avatar, specialization, last_active)
SELECT norm_id, name, class, avatar, specialization, last_active
FROM master_profiles;

COMMIT;

-- Verifica
SELECT id, name, specialization, last_active FROM public.profiles ORDER BY last_active DESC LIMIT 20;
