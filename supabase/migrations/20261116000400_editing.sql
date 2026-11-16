-- Editing and removing what admins create: courses, sessions and roster names.

-- Whether a course or session holds learner activity. Admins can't read interviews directly (that
-- protects anonymity), so the delete rules ask these, which can. They answer only yes or no, and
-- answer yes to anyone who doesn't manage the course, so they reveal nothing.
create function public.course_has_feedback(p_course uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when public.can_manage_course(p_course) then exists (select 1 from public.interviews i where i.course_id = p_course)
    else true
  end
$$;

create function public.session_has_activity(p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when public.can_manage_course((select s.course_id from public.sessions s where s.id = p_session)) then
      exists (select 1 from public.interviews i where i.session_id = p_session)
      or exists (select 1 from public.questions q where q.session_id = p_session)
    else true
  end
$$;

revoke execute on function public.course_has_feedback(uuid) from public, anon;
revoke execute on function public.session_has_activity(uuid) from public, anon;
grant execute on function public.course_has_feedback(uuid) to authenticated, service_role;
grant execute on function public.session_has_activity(uuid) to authenticated, service_role;

-- An organization admin can delete a course, but never one with feedback in it: a course with any
-- interview keeps its record. Its sessions, documents, questions and roster go with it.
create policy courses_delete on public.courses for delete to authenticated
  using (public.is_org_admin(organization_id) and not public.course_has_feedback(id));

-- A course's managers can delete a session that has no interviews and no questions yet, such as
-- one added by mistake.
create policy sessions_delete on public.sessions for delete to authenticated
  using (public.can_manage_course(course_id) and not public.session_has_activity(id));

-- A course's managers can correct a learner's display name. The row must stay in its course.
create policy enrollments_update on public.enrollments for update to authenticated
  using (public.can_manage_course(course_id))
  with check (public.can_manage_course(course_id) and organization_id = public.course_org(course_id));
