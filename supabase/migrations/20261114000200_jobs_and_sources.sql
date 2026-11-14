-- Background jobs, invitations and source search.

-- Claims up to p_limit due jobs. SKIP LOCKED lets several workers run at once.
create function public.claim_jobs(p_limit int, p_now timestamptz) returns setof public.jobs
language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.jobs j
     set status = 'running', attempts = j.attempts + 1, updated_at = p_now
   where j.id in (
     select id from public.jobs
      where status = 'queued' and run_after <= p_now
      order by run_after
      limit p_limit
      for update skip locked
   )
  returning j.*;
end
$$;
revoke execute on function public.claim_jobs(int, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_jobs(int, timestamptz) to service_role;

-- Looks up an account by email when inviting learners. Server only.
create function public.user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1
$$;
revoke execute on function public.user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.user_id_by_email(text) to service_role;

-- The nearest chunks to an embedding, from the three kinds of source one course may use:
-- its session documents, its organization's documentation pages, and its verified answers.
create function public.match_chunks(p_course_id uuid, p_embedding extensions.vector(1536), p_count int)
returns table (
  id uuid,
  source_kind public.chunk_source_kind,
  title text,
  content text,
  document_id uuid,
  page_url text,
  answer_id uuid,
  session_id uuid,
  similarity float8
)
language sql stable security definer set search_path = public, extensions as $$
  select c.id, c.source_kind, c.title, c.content, c.document_id, c.page_url, c.answer_id, c.session_id,
         1 - (c.embedding <=> p_embedding) as similarity
    from public.document_chunks c
   where c.course_id = p_course_id
      or (c.source_kind = 'documentation_page'
          and c.organization_id = (select organization_id from public.courses where id = p_course_id))
   order by c.embedding <=> p_embedding
   limit p_count
$$;
revoke execute on function public.match_chunks(uuid, extensions.vector, int) from public, anon, authenticated;
grant execute on function public.match_chunks(uuid, extensions.vector, int) to service_role;

-- Submitted-interview counts per session, for the sessions a user can see. Counts only.
create function public.session_response_counts(p_course uuid)
returns table (session_id uuid, responses int, enrolled int)
language sql stable security definer set search_path = '' as $$
  select s.id,
         public.submitted_count(s.id, 'session'),
         (select count(*)::int from public.enrollments e where e.course_id = p_course)
    from public.sessions s
   where s.course_id = p_course
     and public.can_see_course(p_course)
     and (s.state <> 'draft' or public.can_manage_course(p_course))
$$;
