-- ===================================================
-- 🛡️ HARDEN_IDENTITY_SCHEMA: Soluzione Senior Eradication Duplicati
-- ===================================================

-- 1. Abilitiamo l'estensione citext (Case-Insensitive Text)
CREATE EXTENSION IF NOT EXISTS citext;

BEGIN;

-- 2. Creazione tabella temporanea di consolidamento
-- Selezioniamo il record "migliore" per ogni ID (preferendo quelli con specializzazione o avatar)
CREATE TEMPORARY TABLE consolidation AS
SELECT DISTINCT ON (LOWER(REPLACE(id, ' ', '')))
    LOWER(REPLACE(id, ' ', ''))::citext as norm_id,
    name,
    class,
    avatar,
    specialization,
    last_active
FROM public.profiles
ORDER BY 
    LOWER(REPLACE(id, ' ', '')), 
    (specialization IS NOT NULL) DESC, -- Preferiamo chi ha l'indirizzo
    (avatar IS NOT NULL) DESC,         -- Preferiamo chi ha l'avatar
    last_active DESC;                  -- Preferiamo il più recente

-- 3. Pulizia totale
DELETE FROM public.profiles;

-- 4. Modifica schema: Convertiamo la colonna ID in citext per renderla case-insensitive PER SEMPRE
-- Nota: se 'id' è Primary Key, Postgres permette la conversione se i dati sono univoci (e lo sono grazie allo step 2)
ALTER TABLE public.profiles ALTER COLUMN id TYPE citext;

-- 5. Ripopolamento
INSERT INTO public.profiles (id, name, class, avatar, specialization, last_active)
SELECT norm_id, name, class, avatar, specialization, last_active
FROM consolidation;

COMMIT;

-- VERIFICA FINALE: Questa query non deve più restituire nulla!
SELECT LOWER(id), COUNT(*) FROM public.profiles GROUP BY LOWER(id) HAVING COUNT(*) > 1;
