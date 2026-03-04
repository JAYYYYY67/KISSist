create or replace function match_assistant_feedback (
  query_embedding vector(1536),
  match_count int,
  min_similarity float,
  course_key_param text default null
)
returns table (
  id uuid,
  question text,
  final_answer text,
  course_key text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    f.id,
    f.question,
    f.final_answer,
    f.course_key,
    1 - (f.embedding <=> query_embedding) as similarity
  from assistant_feedback f
  where f.embedding is not null
    and f.final_answer is not null
    and 1 - (f.embedding <=> query_embedding) > min_similarity
    and (
      course_key_param is null
      or f.course_key = course_key_param
      or f.course_key is null
    )
  order by f.embedding <=> query_embedding
  limit match_count;
end;
$$;
