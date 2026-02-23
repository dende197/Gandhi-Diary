-- Separate last sent trackers for Stress and Study to allow two notifications per day
ALTER TABLE public.notification_settings 
ADD COLUMN IF NOT EXISTS last_stress_sent TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_study_sent TIMESTAMP WITH TIME ZONE;
