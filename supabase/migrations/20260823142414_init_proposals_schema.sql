-- Proposals Table
CREATE TABLE IF NOT EXISTS public.proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id VARCHAR(50) NOT NULL,
    creator_user_id TEXT NOT NULL,
    creator_name TEXT,
    type VARCHAR(20) NOT NULL CHECK (type IN ('ASSEMBLY', 'EXAM_MOVE')),
    target_date TIMESTAMPTZ NOT NULL,
    original_date TIMESTAMPTZ,
    subject TEXT,
    duration TEXT,
    reason TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposals_class_id ON public.proposals(class_id);

-- Proposal Votes Table
CREATE TABLE IF NOT EXISTS public.proposal_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    user_name TEXT,
    vote VARCHAR(20) NOT NULL CHECK (vote IN ('ACCEPT', 'DECLINE', 'COUNTER_PROPOSE')),
    counter_proposed_date TIMESTAMPTZ,
    note TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_vote_per_proposal UNIQUE(proposal_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_votes_proposal_id ON public.proposal_votes(proposal_id);

-- Class Representatives Table
CREATE TABLE IF NOT EXISTS public.class_representatives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class VARCHAR(50) NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_per_class_rep UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_class_reps_class ON public.class_representatives(class);

-- Enable RLS and create permissive policies for public/authenticated access
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_representatives ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on proposals' AND tablename = 'proposals') THEN
        CREATE POLICY "Allow all on proposals" ON public.proposals FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on proposal_votes' AND tablename = 'proposal_votes') THEN
        CREATE POLICY "Allow all on proposal_votes" ON public.proposal_votes FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all on class_representatives' AND tablename = 'class_representatives') THEN
        CREATE POLICY "Allow all on class_representatives" ON public.class_representatives FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- Enable Realtime for proposals and proposal_votes
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.proposals;
    EXCEPTION WHEN duplicate_object THEN
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.proposal_votes;
    EXCEPTION WHEN duplicate_object THEN
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.class_representatives;
    EXCEPTION WHEN duplicate_object THEN
    END;
END $$;
