-- Session results. Aggregates are read through this function so that no individual row is ever
-- readable below the group-size threshold, and nothing comes back in an order that could be
-- matched to a learner. Quotes, blockers and suggestions go to instructors only.

create function public.session_results(p_session uuid, p_kind public.interview_kind) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_course uuid;
  v_min int;
  v_responses int;
  v_enrolled int;
  v_instructor boolean;
begin
  select s.course_id, c.min_group_size into v_course, v_min
    from public.sessions s join public.courses c on c.id = s.course_id
   where s.id = p_session;
  if v_course is null or not public.can_read_results(v_course) then
    return null;
  end if;
  v_instructor := public.has_course_role(v_course, 'instructor');
  v_responses := public.submitted_count(p_session, p_kind);
  select count(*)::int into v_enrolled from public.enrollments where course_id = v_course;

  if v_responses < v_min then
    return jsonb_build_object('responses', v_responses, 'enrolled', v_enrolled, 'min_group_size', v_min, 'hidden', true);
  end if;

  return jsonb_build_object(
    'responses', v_responses,
    'enrolled', v_enrolled,
    'min_group_size', v_min,
    'hidden', false,
    'ratings', (
      select coalesce(jsonb_agg(jsonb_build_object('item_id', r.item_id, 'choice', r.choice) order by r.item_id, r.choice), '[]'::jsonb)
        from public.ratings r join public.interviews i on i.id = r.interview_id
       where r.session_id = p_session and r.kind = p_kind and i.state in ('submitted', 'analysed', 'needs_review')),
    'themes', (
      select coalesce(jsonb_agg(jsonb_build_object('theme', t->>'theme', 'sentiment', t->>'sentiment') order by t->>'theme', t->>'sentiment'), '[]'::jsonb)
        from public.insights n cross join lateral jsonb_array_elements(n.themes) t
       where n.session_id = p_session and n.kind = p_kind),
    'blockers', case when v_instructor then (
      select coalesce(jsonb_agg(b order by b), '[]'::jsonb)
        from public.insights n cross join lateral jsonb_array_elements_text(n.blockers) b
       where n.session_id = p_session and n.kind = p_kind) else '[]'::jsonb end,
    'suggestions', case when v_instructor then (
      select coalesce(jsonb_agg(x order by x), '[]'::jsonb)
        from public.insights n cross join lateral jsonb_array_elements_text(n.suggestions) x
       where n.session_id = p_session and n.kind = p_kind) else '[]'::jsonb end,
    'quotes', case when v_instructor then (
      select coalesce(jsonb_agg(q order by q->>'theme', q->>'text'), '[]'::jsonb)
        from public.insights n join public.interviews i on i.id = n.interview_id
        cross join lateral jsonb_array_elements(n.quotes) q
       where n.session_id = p_session and n.kind = p_kind and i.anonymity <> 'private') else null end,
    'summary', (select summary from public.sessions where id = p_session),
    'summary_source', (select summary_source from public.sessions where id = p_session)
  );
end
$$;
