-- Add course metadata columns to qna_pairs table
alter table qna_pairs 
add column if not exists course_key text,
add column if not exists course_name text;

create index if not exists idx_qna_pairs_course_key on qna_pairs (course_key);
create index if not exists idx_qna_pairs_embedding on qna_pairs using ivfflat (embedding vector_cosine_ops);

-- 1. Textbook Search BY COURSE (Strict)
create or replace function match_chunks_strict_by_course (
  query_embedding vector(1536),
  min_similarity float,
  match_count int,
  filter_course_key text
)
returns table (
  id bigint,
  document_id bigint,
  page_number int,
  content text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    c.id,
    c.document_id,
    c.page_number,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  join documents d on c.document_id = d.id
  where d.course_key = filter_course_key
  and 1 - (c.embedding <=> query_embedding) > min_similarity
  order by c.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- 2. Textbook Search BY COURSE (Loose)
create or replace function match_chunks_loose_by_course (
  query_embedding vector(1536),
  match_count int,
  filter_course_key text
)
returns table (
  id bigint,
  document_id bigint,
  page_number int,
  content text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    c.id,
    c.document_id,
    c.page_number,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  join documents d on c.document_id = d.id
  where d.course_key = filter_course_key
  order by c.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- 3. Q&A Search BY COURSE (Strict)
create or replace function match_qna_strict_by_course (
  query_embedding vector(1536),
  min_similarity float,
  match_count int,
  filter_course_key text
)
returns table (
  id uuid,
  question text,
  answer text,
  url text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    q.id,
    q.question,
    q.answer,
    q.url,
    1 - (q.embedding <=> query_embedding) as similarity
  from qna_pairs q
  where q.course_key = filter_course_key
  and 1 - (q.embedding <=> query_embedding) > min_similarity
  order by q.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- 4. Q&A Search BY COURSE (Loose)
create or replace function match_qna_loose_by_course (
  query_embedding vector(1536),
  match_count int,
  filter_course_key text
)
returns table (
  id uuid,
  question text,
  answer text,
  url text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    q.id,
    q.question,
    q.answer,
    q.url,
    1 - (q.embedding <=> query_embedding) as similarity
  from qna_pairs q
  where q.course_key = filter_course_key
  order by q.embedding <=> query_embedding
  limit match_count;
end;
$$;
