-- 🔎 REPORT CONFLITTI ID PROFILI
-- Questo script identifica i profili che collasserebbero sullo stesso ID se normalizzati
WITH normalized_profiles AS (
    SELECT 
        id as original_id,
        LOWER(REPLACE(id, ' ', '')) as normalized_id,
        name,
        class,
        last_active
    FROM public.profiles
)
SELECT 
    normalized_id,
    COUNT(*) as conflict_count,
    string_agg(original_id, ' | ') as original_ids,
    string_agg(name, ' | ') as names
FROM normalized_profiles
GROUP BY normalized_id
HAVING COUNT(*) > 1;
