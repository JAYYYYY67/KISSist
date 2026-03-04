-- 1. Create assistant_feedback table
create table if not exists assistant_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  created_by uuid not null, -- references auth.users(id) could be added
  
  question text not null,
  course_key text null,

  model_answer text not null,
  final_answer text not null,
  comment text null,
  reference_meta jsonb null,
  low_confidence boolean not null default false,
  
  embedding vector(1536) null
);

-- 2. Enable RLS
alter table assistant_feedback enable row level security;

-- 3. Policy: Allow authenticated users to insert/select
create policy "Allow authenticated users to insert feedback"
on assistant_feedback for insert
to authenticated
with check (true);

create policy "Allow authenticated users to read feedback"
on assistant_feedback for select
to authenticated
using (true);

-- 4. Create index for fast vector search
create index if not exists idx_assistant_feedback_embedding on assistant_feedback using ivfflat (embedding vector_cosine_ops);

-- 5. Create function to match feedback via vector similarity
create or replace function match_feedback_strict (
  query_embedding vector(1536),
  min_similarity float,
  match_count int
)
returns table (
  id uuid,
  question text,
  model_answer text,
  final_answer text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    f.id,
    f.question,
    f.model_answer,
    f.final_answer,
    1 - (f.embedding <=> query_embedding) as similarity
  from assistant_feedback f
  where f.embedding is not null
    and f.final_answer is not null
    and 1 - (f.embedding <=> query_embedding) > min_similarity
  order by f.embedding <=> query_embedding
  limit match_count;
end;
$$;
