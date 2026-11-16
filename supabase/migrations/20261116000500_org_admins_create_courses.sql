-- An organization admin who isn't a platform admin couldn't create a course: reading the new row
-- back (insert … returning) checked can_see_course(id), which looks the course up to find its
-- organization, and that lookup can't see a row the same statement is inserting. The row's own
-- organization is checked as well, so the new course is visible to its organization's admins.
drop policy courses_select on public.courses;
create policy courses_select on public.courses for select to authenticated
  using (public.can_see_course(id) or public.is_org_admin(organization_id));
