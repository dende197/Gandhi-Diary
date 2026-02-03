-- Migration: map existing messages.thread_id -> conversations.id (conversation_id)
-- Non distruttivo: lascia thread_id intatto (opzionale: drop successivamente)
-- Requisiti: eseguire un backup prima di procedere.

-- 0) (Opzionale) Visualizza info prima di partire
-- SELECT count(*) AS total_messages FROM public.messages;
-- SELECT count(distinct thread_id) AS distinct_threads FROM public.messages;

-- 1) Abilita estensioni usate (uuid generators)
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- 2) Crea tabella conversations se non esiste
create table if not exists public.conversations (
    id uuid not null default gen_random_uuid() primary key,
    created_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default timezone('utc'::text, now()),
    last_message_at timestamptz not null default timezone('utc'::text, now()),
    type text default 'private' check (type in ('private','group'))
);

-- 3) Crea tabella conversation_participants se non esiste
create table if not exists public.conversation_participants (
    id uuid not null default gen_random_uuid() primary key,
    conversation_id uuid references public.conversations(id) on delete cascade not null,
    user_id text not null,
    joined_at timestamptz not null default timezone('utc'::text, now()),
    last_read_at timestamptz,
    constraint conversation_participants_unique unique (conversation_id, user_id)
);

-- 4) Crea tabella temporanea con mappatura thread_id -> conversation_id
--    Nota: lavoriamo solo su messaggi con thread_id non null
drop table if exists tmp_thread_map;
create temporary table tmp_thread_map as
select
  thread_id,
  gen_random_uuid() as conversation_id,
  min(coalesce(created_at, now())) as first_message_at,
  max(coalesce(created_at, now())) as last_message_at,
  count(*) as messages_count
from public.messages
where thread_id is not null
group by thread_id;

-- 5) Inserisci conversations dalla mappa (non distruttivo)
insert into public.conversations (id, created_at, updated_at, last_message_at, type)
select conversation_id, first_message_at, last_message_at, last_message_at, 'private'
from tmp_thread_map
on conflict (id) do nothing;

-- 6) Aggiungi la colonna conversation_id a public.messages se non esiste
--    (nullable per ora; popoliamo subito)
alter table public.messages add column if not exists conversation_id uuid;

-- 7) Popola conversation_id in messages usando la mappa (aggiorna solo NULL)
--    Nota: questo può essere pesante su tabelle grandi; esegui in orario di manutenzione se necessario.
update public.messages m
set conversation_id = t.conversation_id
from tmp_thread_map t
where m.thread_id = t.thread_id
  and (m.conversation_id is null);

-- 8) Crea indici utili (controlla esistenza)
create index if not exists idx_messages_conversation on public.messages(conversation_id);
create index if not exists idx_messages_created_at on public.messages(created_at desc);
create index if not exists idx_conversations_last_message on public.conversations(last_message_at desc);
create index if not exists idx_participants_user on public.conversation_participants(user_id);
create index if not exists idx_participants_conversation on public.conversation_participants(conversation_id);

-- 9) Popola conversation_participants a partire dai messaggi storici
--    Inserisce sender_id e receiver_id (se presenti) per ogni conversation_id.
--    Usa min(created_at) come joined_at e max(created_at) come last_read_at indicativo.
insert into public.conversation_participants (id, conversation_id, user_id, joined_at, last_read_at)
select gen_random_uuid(), conversation_id, sender_id, min(created_at), max(created_at)
from public.messages
where conversation_id is not null and sender_id is not null
group by conversation_id, sender_id
on conflict (conversation_id, user_id) do nothing;

-- Se la tua struttura ha receiver_id e vuoi aggiungerli:
-- (Se non hai receiver_id salta questo blocco)
insert into public.conversation_participants (id, conversation_id, user_id, joined_at, last_read_at)
select gen_random_uuid(), conversation_id, receiver_id, min(created_at), max(created_at)
from public.messages
where conversation_id is not null and receiver_id is not null
group by conversation_id, receiver_id
on conflict (conversation_id, user_id) do nothing;

-- 10) (Opzionale) Aggiungi foreign key da messages(conversation_id) -> conversations(id) se non esiste
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_messages_conversation'
      AND conrelid = 'public.messages'::regclass
  ) THEN
    -- ATTENZIONE: se ci sono messages con conversation_id NULL, la FK verrà comunque aggiunta (NULLs permessi).
    ALTER TABLE public.messages
      ADD CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;
  END IF;
END$$;

-- 11) Row Level Security (RLS) - abilita ed aggiunge policy "allow_all_access" in modo sicuro
--     (Evita nested dollar-quoting: usa stringhe con singoli apici per EXECUTE)
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversations' AND policyname='allow_all_access'
  ) THEN
    EXECUTE 'CREATE POLICY allow_all_access ON public.conversations FOR ALL USING (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversation_participants' AND policyname='allow_all_access'
  ) THEN
    EXECUTE 'CREATE POLICY allow_all_access ON public.conversation_participants FOR ALL USING (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='messages' AND policyname='allow_all_access'
  ) THEN
    EXECUTE 'CREATE POLICY allow_all_access ON public.messages FOR ALL USING (true)';
  END IF;
END$$;

-- 12) Aggiungi le tabelle alla publication supabase_realtime se non già presenti
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messages';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversation_participants'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants';
    END IF;
  END IF;
END$$;

-- 13) Controlli post-migrazione (esegui manualmente per verifica)
-- SELECT count(*) FROM public.messages WHERE conversation_id IS NULL; -- dovrebbero essere 0 per i messaggi con thread_id mappato
-- SELECT count(*) FROM public.conversations;
-- SELECT * FROM public.conversations ORDER BY last_message_at desc LIMIT 5;
-- SELECT count(*) FROM public.conversation_participants;

-- 14) (OPZIONALE e solo DOPO verifica) rimuovere thread_id: COMMENTED OUT
-- ALTER TABLE public.messages DROP COLUMN IF EXISTS thread_id;
