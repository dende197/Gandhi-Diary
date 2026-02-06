-- ===================================================
-- 🛡️ MERGE PROFILES: Transizione al formato professionale 'p:'
-- Da usare DOPO aver eseguito il report dei conflitti.
-- Questo script unisce i dati dei duplicati e normalizza gli ID.
-- ===================================================

BEGIN;

-- 1. Crea tabella temporanea per i metadati più recenti per ogni ID normalizzato
CREATE TEMPORARY TABLE best_profiles AS
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

-- 2. Identifica i partecipanti/messaggi che puntano a vecchi ID e aggiornali
-- Nota: assumiamo che i riferimenti siano via stringa (text) nelle FK o query
-- UPDATE public.messages SET sender_id = ... (Opzionale, dipende dallo schema)

-- 3. Svuota e ripopola con gli ID puliti (ATTENZIONE: Procedura distruttiva controllata)
-- Se p: non è nel norm_id lo aggiungiamo ora
UPDATE best_profiles SET norm_id = 'p:' || norm_id WHERE norm_id NOT LIKE 'p:%';

-- Cancelliamo i vecchi per inserire i nuovi (Mergiando i dati)
DELETE FROM public.profiles;

INSERT INTO public.profiles (id, name, class, avatar, specialization, last_active)
SELECT norm_id, name, class, avatar, specialization, last_active FROM best_profiles;

COMMIT;

-- 4. Verifica finale
SELECT id, name, class FROM public.profiles LIMIT 10;
