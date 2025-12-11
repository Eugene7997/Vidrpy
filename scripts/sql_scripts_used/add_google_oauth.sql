-- Migration script to add Google OAuth support
-- Run this script to add the google_id column to the users table

-- Add google_id column
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS google_id character varying(255) NULL;

-- Add unique constraint on google_id
CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_unique 
ON public.users (google_id) 
WHERE google_id IS NOT NULL;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS users_google_id_idx 
ON public.users (google_id);

