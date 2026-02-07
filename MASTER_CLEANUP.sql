-- ===================================================
-- 🚀 MASTER_CLEANUP: Normalizzazione Identità & Ripristino Dati
-- ===================================================
-- Questo script normalizza tutti gli ID nel formato 'p:scuola:utente:indice'
-- e aggiorna tutti i riferimenti nelle tabelle correlate.

BEGIN;

-- 1. Tabella di mappatura per la migrazione degli ID
-- Mappa ogni ID esistente al suo formato normalizzato 'p:...'
CREATE TEMPORARY TABLE id_migration_map AS
SELECT 
    id as old_id,
    CASE 
        WHEN id LIKE 'p:%' THEN LOWER(REPLACE(id, ' ', ''))
        ELSE LOWER(REPLACE('p:' || id, ' ', ''))
    END as new_id
FROM public.profiles;

-- 2. Aggiornamento referenze nelle tabelle correlate (IMPORTANTE per non perdere dati)
-- Nota: Usiamo UPDATE con JOIN sulla mappa per spostare i dati sui nuovi ID normalizzati.

-- A) Messaggi
UPDATE public.messages m
SET sender_id = map.new_id
FROM id_migration_map map
WHERE m.sender_id = map.old_id;

UPDATE public.messages m
SET receiver_id = map.new_id
FROM id_migration_map map
WHERE m.receiver_id = map.old_id;

-- B) Partecipanti Conversazione
UPDATE public.conversation_participants p
SET user_id = map.new_id
FROM id_migration_map map
WHERE p.user_id = map.old_id
ON CONFLICT (conversation_id, user_id) DO NOTHING; -- Evita duplicati se l'utente era già presente con entrambi gli ID

-- C) Post del Feed
UPDATE public.posts p
SET "authorId" = map.new_id
FROM id_migration_map map
WHERE p."authorId" = map.old_id;

-- D) Articoli del Mercatino
UPDATE public.market_items i
SET "sellerId" = map.new_id
FROM id_migration_map map
WHERE i."sellerId" = map.old_id;


-- 3. Consolidamento Profili
-- Creiamo una tabella temporanea con i dati migliori per ogni ID normalizzato
CREATE TEMPORARY TABLE consolidated_profiles AS
SELECT DISTINCT ON (map.new_id)
    map.new_id as id,
    p.name,
    p.class,
    p.avatar,
    p.specialization,
    p.last_active
FROM public.profiles p
JOIN id_migration_map map ON p.id = map.old_id
ORDER BY 
    map.new_id, 
    (p.specialization IS NOT NULL) DESC, 
    (p.avatar IS NOT NULL) DESC, 
    p.last_active DESC;

-- 4. Pulizia e Ripopolamento della tabella Profiles
-- Disabilitiamo temporaneamente i trigger se necessario (opzionale)
DELETE FROM public.profiles;

INSERT INTO public.profiles (id, name, class, avatar, specialization, last_active)
SELECT id, name, class, avatar, specialization, last_active
FROM consolidated_profiles;

-- 5. Pulizia partecipanti orfani (residui di vecchi test o bug)
DELETE FROM public.conversation_participants 
WHERE user_id NOT IN (SELECT id FROM public.profiles);

COMMIT;

-- Verifica finale
SELECT count(*) as total_profiles FROM public.profiles;
SELECT id FROM public.profiles LIMIT 5;
