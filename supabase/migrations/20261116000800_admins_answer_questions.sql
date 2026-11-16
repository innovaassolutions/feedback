-- Organization admins, and platform admins, handle Q&A as instructors do, at Todd's request: answer
-- a question, verify or edit an AI answer, and remove a duplicate. Questions the Librarian can't
-- answer go to the instructor, and an admin couldn't respond to them.
drop policy questions_update on public.questions;
create policy questions_update on public.questions for update to authenticated
  using (public.reads_course_detail(course_id)) with check (public.reads_course_detail(course_id));

drop policy questions_delete on public.questions;
create policy questions_delete on public.questions for delete to authenticated
  using (public.reads_course_detail(course_id));

drop policy answers_write on public.answers;
create policy answers_write on public.answers for all to authenticated
  using (public.reads_course_detail(course_id)) with check (public.reads_course_detail(course_id));
