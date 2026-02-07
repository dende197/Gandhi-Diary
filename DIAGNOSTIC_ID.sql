-- ===================================================
-- 🔍 DIAGNOSTIC_ID: Trova i "cloni" di casing
-- ===================================================

-- 1. Cerca utenti che hanno lo stesso ID normalizzato (minuscolo e senza spazi)
-- ma che esistono come righe separate nel DB.
SELECT 
    id as raw_id,
    length(id) as id_len,
    name,
    specialization,
    last_active,
    encode(id::bytea, 'hex') as id_hex -- Vedi se ci sono caratteri invisibili
FROM public.profiles
WHERE LOWER(REPLACE(id, ' ', '')) IN (
    SELECT LOWER(REPLACE(id, ' ', ''))
    FROM public.profiles
    GROUP BY LOWER(REPLACE(id, ' ', ''))
    HAVING COUNT(*) > 1
)
ORDER BY LOWER(REPLACE(id, ' ', ''));
