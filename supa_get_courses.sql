-- RPC to get courses summary
create or replace function get_courses_summary()
returns table (
  course_key text,
  course_name text,
  doc_count bigint
)
language plpgsql
as $$
begin
  return query
  select
    d.course_key,
    max(d.course_name) as course_name, 
    count(*)::bigint as doc_count
  from documents d
  where d.course_key is not null
  group by d.course_key
  order by max(d.course_name) asc;
end;
$$;
