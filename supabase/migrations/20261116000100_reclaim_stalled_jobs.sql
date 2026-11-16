-- A job left "running" was cut off mid-run: a function timed out, or the server stopped. Before
-- this, claim_jobs took only queued jobs and nothing ever retried one stuck in running, so its work
-- was lost (a session summary stayed out of date). A run is never longer than five minutes (the
-- cron tick's limit), so a job still running after fifteen is claimed again. After three attempts
-- it is marked failed, the same as a job that keeps throwing.
create or replace function public.claim_jobs(p_limit int, p_now timestamptz) returns setof public.jobs
language plpgsql security definer set search_path = '' as $$
begin
  update public.jobs
     set status = 'failed', last_error = 'Stopped while running', updated_at = p_now
   where status = 'running' and updated_at < p_now - interval '15 minutes' and attempts >= 3;

  return query
  update public.jobs j
     set status = 'running', attempts = j.attempts + 1, updated_at = p_now
   where j.id in (
     select id from public.jobs
      where (status = 'queued' and run_after <= p_now)
         or (status = 'running' and updated_at < p_now - interval '15 minutes')
      order by run_after
      limit p_limit
      for update skip locked
   )
  returning j.*;
end
$$;
revoke execute on function public.claim_jobs(int, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_jobs(int, timestamptz) to service_role;
