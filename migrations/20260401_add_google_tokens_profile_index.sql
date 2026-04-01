ALTER TABLE google_tokens
ADD COLUMN IF NOT EXISTS profile_index integer DEFAULT 0;
