-- The Librarian weighs a session's own material against the product documentation, so its search
-- returns the nearest chunks of each group separately: the question's session's documents
-- (slides, guides and the recording's transcript), other sessions' documents, the organization's
-- product documentation, and verified answers. Ranked within each group, a long transcript can't
-- crowd the documentation out, or the other way round. Each row says which session it came from.
create function public.match_chunks_grouped(p_course_id uuid, p_session_id uuid, p_embedding extensions.vector(1536), p_per_group int)
returns table (
  id uuid,
  source_kind public.chunk_source_kind,
  source_group text,
  title text,
  content text,
  document_id uuid,
  page_url text,
  answer_id uuid,
  session_id uuid,
  session_number int,
  session_title text,
  file_name text,
  mime_type text,
  similarity float8
)
language sql stable security definer set search_path = public, extensions as $$
  with scored as (
    select c.id, c.source_kind, c.title, c.content, c.document_id, c.page_url, c.answer_id, c.session_id,
           1 - (c.embedding <=> p_embedding) as similarity,
           case
             when c.source_kind = 'documentation_page' then 'documentation'
             when c.source_kind = 'verified_answer' then 'verified_answer'
             when c.session_id = p_session_id then 'this_session'
             else 'other_session'
           end as source_group
      from public.document_chunks c
     where c.course_id = p_course_id
        or (c.source_kind = 'documentation_page'
            and c.organization_id = (select organization_id from public.courses where id = p_course_id))
  ), ranked as (
    select s.*, row_number() over (partition by s.source_group order by s.similarity desc) as rank_in_group
      from scored s
  )
  select r.id, r.source_kind, r.source_group, r.title, r.content, r.document_id, r.page_url, r.answer_id, r.session_id,
         se.number, se.title, d.file_name, d.mime_type, r.similarity
    from ranked r
    left join public.sessions se on se.id = r.session_id
    left join public.documents d on d.id = r.document_id
   where r.rank_in_group <= p_per_group
   order by r.similarity desc
$$;
revoke execute on function public.match_chunks_grouped(uuid, uuid, extensions.vector, int) from public, anon, authenticated;
grant execute on function public.match_chunks_grouped(uuid, uuid, extensions.vector, int) to service_role;
