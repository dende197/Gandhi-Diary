-- 🧹 PULIZIA NOMI UTENTE DAI PROFILI
-- Rimuove i nomi che sono in realtà username o non validi

BEGIN;

-- 1. Imposta a NULL i nomi che non contengono spazi (probabili username o placeholder)
-- Escludi i docenti (es. "Docente") se vuoi, ma in genere i nomi reali hanno almeno un Cognome e Nome.
UPDATE public.profiles
SET name = NULL
WHERE name IS NOT NULL 
  AND name NOT LIKE '% %';

-- 2. Imposta a NULL i nomi che corrispondono alla parte 'username' dell'ID
-- ID format: school:username:idx o p:school:username:idx
UPDATE public.profiles
SET name = NULL
WHERE name IS NOT NULL
  AND (
    LOWER(name) = LOWER(split_part(id, ':', 2)) OR -- per school:username:idx
    LOWER(name) = LOWER(split_part(id, ':', 3))    -- per p:school:username:idx
  );

-- 3. Imposta a NULL i nomi che contengono numeri (nomi reali raramente li hanno)
UPDATE public.profiles
SET name = NULL
WHERE name IS NOT NULL
  AND name ~ '[0-9]';

COMMIT;

-- Verifica residua
SELECT id, name FROM public.profiles WHERE name IS NOT NULL LIMIT 10;
