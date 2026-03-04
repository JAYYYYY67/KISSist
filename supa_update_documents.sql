-- Add course metadata columns to documents table

alter table documents 
add column if not exists course_key text,
add column if not exists course_name text;

-- Add an index on course_key for filtering
create index if not exists idx_documents_course_key on documents (course_key);
