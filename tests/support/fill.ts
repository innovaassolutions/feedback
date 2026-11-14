import { sql } from "./db";

const vector = `('[' || array_to_string(array_fill(0.01::float8, array[1536]), ',') || ']')::extensions.vector`;

/**
 * Puts at least one row in every table for one organization, on a session of its own so
 * other tests' counts aren't affected. Runs as the database owner, so RLS doesn't apply.
 */
export async function fillEveryTable(orgId: string, courseId: string, learnerId: string, number: number) {
  const s = sql();
  const [session] = await s`
    insert into public.sessions (organization_id, course_id, number, title, date, state)
    values (${orgId}, ${courseId}, ${number}, 'Tenancy fixture', current_date, 'open')
    on conflict (course_id, number) do update set title = excluded.title
    returning id`;
  const sid = session.id as string;
  const [doc] = await s`
    insert into public.documents (organization_id, course_id, session_id, title, audience, storage_path, file_name, mime_type, size_bytes, status)
    values (${orgId}, ${courseId}, ${sid}, 'Fixture', 'learners', ${`${orgId}/${courseId}/${sid}/fixture-${number}.txt`}, 'fixture.txt', 'text/plain', 1, 'ready')
    on conflict (storage_path) do update set title = excluded.title returning id`;
  const [docSource] = await s`
    insert into public.documentation_sources (organization_id, url, status)
    values (${orgId}, ${`https://docs.fixture.example/${orgId}`}, 'ready')
    on conflict (organization_id, url) do update set status = excluded.status returning id`;
  await s.unsafe(
    `insert into public.document_chunks (organization_id, course_id, session_id, source_kind, document_id, title, content, embedding)
     values ($1, $2, $3, 'session_document', $4, 'Fixture', 'Fixture text', ${vector})`,
    [orgId, courseId, sid, doc.id],
  );
  await s.unsafe(
    `insert into public.document_chunks (organization_id, source_kind, documentation_source_id, page_url, title, content, embedding)
     values ($1, 'documentation_page', $2, 'https://docs.fixture.example/page', 'Fixture page', 'Fixture text', ${vector})`,
    [orgId, docSource.id],
  );
  const [interview] = await s`
    insert into public.interviews (organization_id, course_id, session_id, kind, anonymity, participant_id, state, stage, token_hash)
    values (${orgId}, ${courseId}, ${sid}, 'session', 'named', ${learnerId}, 'analysed', 'done', 'fixture')
    returning id`;
  await s`insert into public.interview_turns (organization_id, interview_id, seq, role, text, mode, stage)
          values (${orgId}, ${interview.id}, 1, 'learner', 'Fixture turn', 'text', 'conversation')`;
  await s`insert into public.ratings (organization_id, course_id, session_id, interview_id, kind, item_id, choice)
          values (${orgId}, ${courseId}, ${sid}, ${interview.id}, 'session', 'pace', 'about_right')`;
  await s`insert into public.insights (organization_id, course_id, session_id, interview_id, kind, themes, agent_version)
          values (${orgId}, ${courseId}, ${sid}, ${interview.id}, 'session', '[]'::jsonb, 'fixture')`;
  await s`insert into public.completions (organization_id, course_id, session_id, user_id, kind)
          values (${orgId}, ${courseId}, ${sid}, ${learnerId}, 'session') on conflict do nothing`;
  const [question] = await s`
    insert into public.questions (organization_id, course_id, session_id, author_id, author_name, text, state)
    values (${orgId}, ${courseId}, ${sid}, ${learnerId}, 'Fixture learner', 'A fixture question?', 'answered') returning id`;
  const [answer] = await s`
    insert into public.answers (organization_id, course_id, session_id, question_id, kind, text, verified)
    values (${orgId}, ${courseId}, ${sid}, ${question.id}, 'instructor', 'A fixture answer.', true) returning id`;
  await s.unsafe(
    `insert into public.document_chunks (organization_id, course_id, session_id, source_kind, answer_id, title, content, embedding)
     values ($1, $2, $3, 'verified_answer', $4, 'Fixture answer', 'Fixture text', ${vector})`,
    [orgId, courseId, sid, answer.id],
  );
  await s`insert into public.question_votes (organization_id, course_id, question_id, user_id)
          values (${orgId}, ${courseId}, ${question.id}, ${learnerId}) on conflict do nothing`;
  await s`insert into public.actions (organization_id, course_id, session_id, you_said, we_did, status)
          values (${orgId}, ${courseId}, ${sid}, 'Fixture', 'Fixture', 'done')`;
  await s`insert into public.agent_runs (organization_id, agent, agent_version, model, operation, outcome)
          values (${orgId}, 'analyst', 'fixture', 'stub', 'fixture', 'ok')`;
  await s`insert into public.quality_checks (organization_id, agent, agent_version, kind, items, passed, total)
          values (${orgId}, 'interviewer', 'fixture', 'rubric', '[]'::jsonb, 1, 1)`;
  await s`insert into public.jobs (organization_id, kind, status) values (${orgId}, 'fixture', 'done')`;
  return sid;
}
