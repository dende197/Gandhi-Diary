-- ===================================================
-- 🔧 FIX RLS: Ricerca Utenti Globale (Skip Normalize)
-- Esegui questo script nel SQL Editor di Supabase
-- ===================================================

-- STEP 1: Disabilita RLS per pulizia
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- STEP 2: Rimuovi policy esistenti
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'profiles'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
        RAISE NOTICE 'Dropped policy: %', pol.policyname;
    END LOOP;
END $$;

-- STEP 3: Ri-abilita RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- STEP 4: Policy SELECT per tutti (anon incluse)
CREATE POLICY "profiles_public_read" 
ON public.profiles 
FOR SELECT 
TO public
USING (true);

-- STEP 5: Policy scrittura per utenti autenticati
CREATE POLICY "profiles_owner_write" 
ON public.profiles 
FOR ALL 
TO authenticated
USING (true)
WITH CHECK (true);

-- STEP 6: Verifica
SELECT 
    'Profiles count:' as check_type, 
    COUNT(*)::text as result 
FROM public.profiles
UNION ALL
SELECT 
    'Policies count:' as check_type, 
    COUNT(*)::text as result 
FROM pg_policies WHERE tablename = 'profiles';

-- STEP 7: Test query live
SELECT id, name, class FROM public.profiles 
WHERE name ILIKE '%a%' OR class ILIKE '%a%'
LIMIT 5;
