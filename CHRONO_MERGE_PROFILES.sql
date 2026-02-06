-- ===================================================
-- 🛡️ CHRONO_MERGE_PROFILES: "Most Recent Wins" Strategy
-- Questo script elimina ogni profilo duplicato (per nome)
-- tenendo solo quello aggiornato più recentemente.
-- ===================================================

BEGIN;

-- 1. Identifichiamo il "Master ID" più recente per ogni nome
-- Usiamo LOWER(TRIM(name)) per catturare variazioni di spazi o maiuscole
CREATE TEMPORARY TABLE latest_masters AS
SELECT DISTINCT ON (LOWER(TRIM(name)))
    id,
    LOWER(TRIM(name)) as norm_name,
    last_active
FROM public.profiles
WHERE name IS NOT NULL AND name != 'Utente'
ORDER BY LOWER(TRIM(name)), last_active DESC;

-- 2. Eliminiamo i profili che NON sono i "Master" più recenti
-- Ma solo se hanno un nome duplicato nel sistema
DELETE FROM public.profiles
WHERE id NOT IN (SELECT id FROM latest_masters)
AND LOWER(TRIM(name)) IN (SELECT norm_name FROM latest_masters);

COMMIT;

-- VERIFICA: Quanti record sono rimasti?
SELECT id, name, specialization, last_active FROM public.profiles ORDER BY last_active DESC LIMIT 20;
