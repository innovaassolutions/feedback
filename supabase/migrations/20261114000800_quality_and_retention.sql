-- Quality monitoring, the labelled-set candidates, and a learner's right to remove their data.

-- Platform admins' addresses, for alerts. Server only.
create function public.platform_admin_emails() returns setof text
language sql stable security definer set search_path = '' as $$
  select email from auth.users where coalesce((raw_app_meta_data ->> 'platform_admin')::boolean, false) and email is not null
$$;
revoke execute on function public.platform_admin_emails() from public, anon, authenticated;
grant execute on function public.platform_admin_emails() to service_role;

-- Agent quality by agent and AGENT.md version. Counts and rates only; no learner content.
create function public.quality_figures() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    return null;
  end if;
  return jsonb_build_object(
    'runs', (
      select coalesce(jsonb_agg(r order by r->>'agent', r->>'version'), '[]'::jsonb) from (
        select jsonb_build_object(
          'agent', agent,
          'version', agent_version,
          'runs', count(*),
          'validation_failures', count(*) filter (where outcome = 'validation_failed'),
          'errors', count(*) filter (where outcome = 'error'),
          'cost_usd', coalesce(sum(cost_usd), 0),
          'median_latency_ms', percentile_cont(0.5) within group (order by latency_ms)
        ) as r
        from public.agent_runs group by agent, agent_version
      ) x),
    'rubric', (
      select coalesce(jsonb_agg(r), '[]'::jsonb) from (
        select jsonb_build_object('agent', agent, 'version', agent_version, 'passed', sum(passed), 'total', sum(total), 'interviews', count(*),
                                  'code_only', count(*) filter (where code_only)) as r
        from public.quality_checks group by agent, agent_version
      ) x),
    'interviews', (
      select coalesce(jsonb_agg(r), '[]'::jsonb) from (
        select jsonb_build_object(
          'version', coalesce(agent_version, 'unknown'),
          'started', count(*),
          'submitted', count(*) filter (where state in ('submitted', 'analysed', 'needs_review')),
          'abandoned', count(*) filter (where state = 'abandoned'),
          'needs_review', count(*) filter (where state = 'needs_review'),
          'confirmed_without_edits', count(*) filter (where state in ('submitted', 'analysed', 'needs_review') and summary_edited = false),
          'median_turns', percentile_cont(0.5) within group (order by turn_count) filter (where state in ('submitted', 'analysed', 'needs_review')),
          'rated_helpful', count(*) filter (where interview_rating = 'helpful'),
          'rated', count(*) filter (where interview_rating is not null)
        ) as r
        from public.interviews group by agent_version
      ) x),
    'cost_per_interview', (
      select coalesce(jsonb_agg(r), '[]'::jsonb) from (
        select jsonb_build_object('version', i.agent_version, 'cost_usd', coalesce(sum(a.cost_usd), 0) / greatest(count(distinct i.id), 1)) as r
        from public.interviews i left join public.agent_runs a on a.interview_id = i.id
        where i.state in ('submitted', 'analysed', 'needs_review')
        group by i.agent_version
      ) x),
    'answers', (
      select coalesce(jsonb_agg(r), '[]'::jsonb) from (
        select jsonb_build_object(
          'version', coalesce(agent_version, 'unknown'),
          'ai_answers', count(*),
          'verified_without_edits', count(*) filter (where verified and not edited),
          'verified', count(*) filter (where verified)
        ) as r
        from public.answers where kind = 'ai' group by agent_version
      ) x),
    'questions', (
      select coalesce(jsonb_agg(r), '[]'::jsonb) from (
        select jsonb_build_object(
          'version', v.agent_version,
          'questions', count(distinct q.id),
          'not_covered', count(distinct q.id) filter (where q.state = 'needs_instructor'
                                                       or (q.state = 'answered' and not exists (select 1 from public.answers a where a.question_id = q.id and a.kind = 'ai')))
        ) as r
        from public.questions q
        join lateral (select agent_version from public.agent_runs r where r.question_id = q.id and r.agent = 'librarian' order by r.created_at limit 1) v on true
        group by v.agent_version
      ) x),
    'review_queue', (
      select count(*) from public.interviews where state = 'needs_review'),
    'candidates', (
      select coalesce(jsonb_agg(jsonb_build_object('insight_id', n.id, 'course', c.title, 'session', s.number, 'analyst_version', n.agent_version, 'marked_on', n.accuracy_marked_at::date)
                                order by n.accuracy_marked_at desc), '[]'::jsonb)
        from public.insights n join public.sessions s on s.id = n.session_id join public.courses c on c.id = n.course_id
       where n.accuracy = 'not_accurate')
  );
end
$$;

-- The seven-day figures alerts are based on. Server only.
create function public.seven_day_quality(p_now timestamptz) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'rubric_passed', (select coalesce(sum(passed), 0) from public.quality_checks where created_at > p_now - interval '7 days'),
    'rubric_total', (select coalesce(sum(total), 0) from public.quality_checks where created_at > p_now - interval '7 days'),
    'runs', (select count(*) from public.agent_runs where created_at > p_now - interval '7 days'),
    'validation_failures', (select count(*) from public.agent_runs where created_at > p_now - interval '7 days' and outcome = 'validation_failed')
  )
$$;
revoke execute on function public.seven_day_quality(timestamptz) from public, anon, authenticated;
grant execute on function public.seven_day_quality(timestamptz) to service_role;

-- A learner removes their own named interviews and questions in a course. Deleting through
-- the API would need the learner to be able to read the rows first, which they can't, so this
-- runs as the owner but only ever touches rows that belong to auth.uid().
create function public.delete_my_data(p_course uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_interviews int;
  v_questions int;
begin
  if auth.uid() is null then
    return null;
  end if;
  delete from public.interviews where course_id = p_course and participant_id = auth.uid() and anonymity = 'named';
  get diagnostics v_interviews = row_count;
  delete from public.questions where course_id = p_course and author_id = auth.uid();
  get diagnostics v_questions = row_count;
  return jsonb_build_object('interviews', v_interviews, 'questions', v_questions);
end
$$;
revoke execute on function public.delete_my_data(uuid) from public, anon;
grant execute on function public.delete_my_data(uuid) to authenticated;
