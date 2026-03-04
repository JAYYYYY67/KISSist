-- Create a private bucket for materials
insert into storage.buckets (id, name, public)
values ('materials', 'materials', false);

-- Create a table for documents
create table if not exists documents (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  file_name text not null, -- Stores the storage path (e.g. materials/filename.pdf)
  created_at timestamptz default now()
);

-- Enable RLS (Role Level Security)
alter table documents enable row level security;

-- Policy: Allow full access to authenticated users (or restrict to admins if preferred)
-- For now, letting authenticated users view/insert is simple for the tutor app context.
create policy "Allow authenticated users to read documents"
on documents for select
to authenticated
using (true);

create policy "Allow authenticated users to insert documents"
on documents for insert
to authenticated
with check (true);

-- Storage Policy: Allow authenticated users to upload to 'materials' bucket
create policy "Allow authenticated uploads"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'materials' );

create policy "Allow authenticated reads"
on storage.objects for select
to authenticated
using ( bucket_id = 'materials' );

-- Create chunks table
create table if not exists chunks (
  id uuid default gen_random_uuid() primary key,
  document_id uuid references documents(id) on delete cascade,
  page_number integer not null,
  content text not null,
  embedding vector(1536), -- Placeholder for future embeddings
  created_at timestamptz default now()
);

-- Enable RLS for chunks
alter table chunks enable row level security;

create policy "Allow authenticated users to read chunks"
on chunks for select
to authenticated
using (true);

create policy "Allow authenticated users to insert chunks"
on chunks for insert
to authenticated
with check (true);

-- Create a function to search for chunks
-- Create strict match function
create or replace function match_chunks_strict (
  query_embedding vector(1536),
  min_similarity float,
  match_count int
)
returns table (
  id uuid,
  content text,
  page_number int,
  document_id uuid,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    chunks.id,
    chunks.content,
    chunks.page_number,
    chunks.document_id,
    1 - (chunks.embedding <=> query_embedding) as similarity
  from chunks
  where 1 - (chunks.embedding <=> query_embedding) > min_similarity
  order by chunks.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Create loose match function
create or replace function match_chunks_loose (
  query_embedding vector(1536),
  match_count int
)
returns table (
  id uuid,
  content text,
  page_number int,
  document_id uuid,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    chunks.id,
    chunks.content,
    chunks.page_number,
    chunks.document_id,
    1 - (chunks.embedding <=> query_embedding) as similarity
  from chunks
  order by chunks.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Create Q&A Pairs table (replaced qna)
create table if not exists qna_pairs (
  id uuid default gen_random_uuid() primary key,
  source text not null, -- e.g. "manual", "csv-import", "textbook-v1"
  url text,
  question text not null,
  answer text not null,
  embedding vector(1536),
  created_at timestamptz default now(),
  unique (source, question)
);

-- Enable RLS for qna_pairs
alter table qna_pairs enable row level security;

create policy "Allow authenticated users to read qna_pairs"
on qna_pairs for select
to authenticated
using (true);

create policy "Allow authenticated users to insert qna_pairs"
on qna_pairs for insert
to authenticated
with check (true);

-- Create strict Q&A match function
create or replace function match_qna_strict (
  query_embedding vector(1536),
  min_similarity float,
  match_count int
)
returns table (
  id uuid,
  question text,
  answer text,
  url text,
  source text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    qna_pairs.id,
    qna_pairs.question,
    qna_pairs.answer,
    qna_pairs.url,
    qna_pairs.source,
    1 - (qna_pairs.embedding <=> query_embedding) as similarity
  from qna_pairs
  where 1 - (qna_pairs.embedding <=> query_embedding) > min_similarity
  order by qna_pairs.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Create loose Q&A match function
create or replace function match_qna_loose (
  query_embedding vector(1536),
  match_count int
)
returns table (
  id uuid,
  question text,
  answer text,
  url text,
  source text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    qna_pairs.id,
    qna_pairs.question,
    qna_pairs.answer,
    qna_pairs.url,
    qna_pairs.source,
    1 - (qna_pairs.embedding <=> query_embedding) as similarity
  from qna_pairs
  order by qna_pairs.embedding <=> query_embedding
  limit match_count;
end;
$$;
