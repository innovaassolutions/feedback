-- Whether each learner and staff member has signed in yet, so admins know whom to send an invitation
-- again. Only yes or no, and only to those who manage the course or the organization.

create function public.roster_sign_in_status(p_course uuid)
returns table (enrollment_id uuid, signed_in boolean)
language sql stable security definer set search_path = '' as $$
  select e.id, u.last_sign_in_at is not null
    from public.enrollments e join auth.users u on u.id = e.user_id
   where e.course_id = p_course and public.can_manage_course(p_course)
$$;

create function public.staff_sign_in_status(p_organization uuid)
returns table (membership_id uuid, signed_in boolean)
language sql stable security definer set search_path = '' as $$
  select m.id, u.last_sign_in_at is not null
    from public.memberships m join auth.users u on u.id = m.user_id
   where m.organization_id = p_organization and public.is_org_admin(p_organization)
$$;

revoke execute on function public.roster_sign_in_status(uuid) from public, anon;
revoke execute on function public.staff_sign_in_status(uuid) from public, anon;
grant execute on function public.roster_sign_in_status(uuid) to authenticated, service_role;
grant execute on function public.staff_sign_in_status(uuid) to authenticated, service_role;
