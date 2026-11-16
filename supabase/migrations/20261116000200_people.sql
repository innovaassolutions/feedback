-- People: organization admins add organization admins, instructors and sponsors; platform admins
-- add other platform admins.

-- A course role must name a course of the same organization. The page checks this too; the
-- database makes sure, so an admin of one organization can never attach a role to another's course.
drop policy memberships_write on public.memberships;
create policy memberships_write on public.memberships for all to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id) and (course_id is null or public.course_org(course_id) = organization_id));

-- The platform admins, for the platform page. Server only; the page checks the viewer first.
create function public.platform_admins() returns table (user_id uuid, email text, name text, last_sign_in_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', ''), u.last_sign_in_at
  from auth.users u
  where coalesce((u.raw_app_meta_data ->> 'platform_admin')::boolean, false) and u.email is not null
  order by u.email
$$;
revoke execute on function public.platform_admins() from public, anon, authenticated;
grant execute on function public.platform_admins() to service_role;
