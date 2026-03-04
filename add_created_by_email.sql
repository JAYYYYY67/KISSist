-- Migration: Add created_by_email to assistant_feedback
-- Description: Stores the email of the TA who submitted the final_answer for operational ease without doing JOINs into auth.users.

ALTER TABLE public.assistant_feedback 
ADD COLUMN IF NOT EXISTS created_by_email text null;
