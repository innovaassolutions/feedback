import type { Ctx } from "@/lib/server/ctx";
import { requireUser } from "@/lib/server/ctx";
import type { OperationInput } from "@/lib/operations";
import { conflict, forbidden, notFound, unprocessable } from "@/lib/server/http";
import { enqueue } from "@/lib/server/jobs/queue";
import { isEnrolled, isInstructor, kickJobs, sessionForUser } from "./common";

export type QuestionView = {
  id: string;
  text: string;
  state: "open" | "ai_answered" | "needs_instructor" | "answered";
  author: string;
  votes: number;
  voted: boolean;
  mine: boolean;
  created_at: string;
  sent_to_instructor: boolean;
  answers: Array<{
    id: string;
    kind: "ai" | "instructor";
    text: string;
    verified: boolean;
    edited: boolean;
    sources_disagree: boolean;
    citations: Array<{ chunk_id: string; kind: string; title: string; url: string | null }>;
  }>;
};

/** The questions on a session, by votes and then time, with their answers. */
export async function listQuestions(ctx: Ctx, input: OperationInput<"list_questions">): Promise<{ questions: QuestionView[] }> {
  const user = requireUser(ctx);
  const session = await sessionForUser(ctx, input.session_id);
  const [{ data: questions }, { data: votes }] = await Promise.all([
    ctx.db
      .from("questions")
      .select("id, text, state, author_id, author_name, vote_count, created_at, sent_to_instructor_at, answers(id, kind, text, verified, edited, sources_disagree, citations, created_at)")
      .eq("session_id", session.id)
      .order("vote_count", { ascending: false })
      .order("created_at", { ascending: true }),
    ctx.db.from("question_votes").select("question_id").eq("user_id", user.id),
  ]);
  const myVotes = new Set((votes ?? []).map((v) => v.question_id));
  return {
    questions: (questions ?? []).map((q) => ({
      id: q.id,
      text: q.text,
      state: q.state,
      author: q.author_name ?? "Anonymous learner",
      votes: q.vote_count,
      voted: myVotes.has(q.id),
      mine: q.author_id === user.id,
      created_at: q.created_at,
      sent_to_instructor: Boolean(q.sent_to_instructor_at),
      answers: (q.answers ?? [])
        .sort((a, b) => (a.kind === b.kind ? a.created_at.localeCompare(b.created_at) : a.kind === "instructor" ? -1 : 1))
        .map((a) => ({
          id: a.id,
          kind: a.kind as "ai" | "instructor",
          text: a.text,
          verified: a.verified,
          edited: a.edited,
          sources_disagree: a.sources_disagree,
          citations: (a.citations as QuestionView["answers"][number]["citations"]) ?? [],
        })),
    })),
  };
}

/** Posts a question, with the learner's name or anonymously, and queues an answer. */
export async function askQuestion(ctx: Ctx, input: OperationInput<"ask_question">) {
  const user = requireUser(ctx);
  const session = await sessionForUser(ctx, input.session_id);
  if (!(await isEnrolled(ctx, session.course_id))) throw forbidden("Only learners enrolled in this course can ask questions here");
  if (session.state !== "open" && session.state !== "closed") throw conflict("Questions open once the session has been delivered");
  let authorName: string | null = null;
  if (!input.anonymous) {
    const { data } = await ctx.db.from("enrollments").select("display_name").eq("course_id", session.course_id).eq("user_id", user.id).single();
    authorName = data?.display_name ?? null;
  }
  const { data, error } = await ctx.db
    .from("questions")
    .insert({
      organization_id: session.organization_id,
      course_id: session.course_id,
      session_id: session.id,
      // An anonymous question stores no author.
      author_id: input.anonymous ? null : user.id,
      author_name: authorName,
      text: input.text,
      state: "open",
      origin: "board",
    })
    .select("id, text, state, author_name")
    .single();
  if (error) throw new Error(`ask: ${error.message}`);
  await enqueue(ctx.admin, { kind: "answer_question", payload: { question_id: data.id }, organizationId: session.organization_id });
  kickJobs(ctx);
  return { question: { ...data, author: data.author_name ?? "Anonymous learner" } };
}

/** One "I have this question too" per learner per question. */
export async function voteQuestion(ctx: Ctx, input: OperationInput<"vote_question">) {
  const user = requireUser(ctx);
  const { data: q } = await ctx.db.from("questions").select("id, organization_id, course_id").eq("id", input.question_id).maybeSingle();
  if (!q) throw notFound("Question not found");
  if (!(await isEnrolled(ctx, q.course_id))) throw forbidden("Only learners can vote");
  const { error } = await ctx.db.from("question_votes").insert({ organization_id: q.organization_id, course_id: q.course_id, question_id: q.id, user_id: user.id });
  if (error) {
    if (error.code === "23505") throw conflict("You've already said you have this question");
    throw new Error(`vote: ${error.message}`);
  }
  const { data: after } = await ctx.db.from("questions").select("vote_count").eq("id", q.id).single();
  return { votes: after?.vote_count ?? 0 };
}

/**
 * An instructor answers, or verifies an AI answer (optionally editing it). Either way the answer
 * becomes a source for later questions. Writing a new answer replaces any AI answer.
 */
export async function answerQuestionOp(ctx: Ctx, input: OperationInput<"answer_question">) {
  const user = requireUser(ctx);
  const { data: q } = await ctx.db.from("questions").select("id, organization_id, course_id, session_id, first_answered_at").eq("id", input.question_id).maybeSingle();
  if (!q) throw notFound("Question not found");
  if (!(await isInstructor(ctx, q.course_id))) throw forbidden("Only the course's instructors can answer");
  const now = ctx.now().toISOString();
  let answerId: string;
  if (input.verifies_answer_id) {
    const { data: existing } = await ctx.db.from("answers").select("id, text").eq("id", input.verifies_answer_id).eq("question_id", q.id).maybeSingle();
    if (!existing) throw notFound("Answer not found");
    const edited = Boolean(input.text) && input.text !== existing.text;
    const { error } = await ctx.db
      .from("answers")
      .update({ verified: true, verified_by: user.id, verified_at: now, updated_at: now, ...(edited ? { text: input.text, edited: true } : {}) })
      .eq("id", existing.id);
    if (error) throw new Error(`verify: ${error.message}`);
    answerId = existing.id;
  } else {
    if (!input.text) throw unprocessable("Write an answer");
    await ctx.db.from("answers").delete().eq("question_id", q.id);
    const { data, error } = await ctx.db
      .from("answers")
      .insert({
        organization_id: q.organization_id,
        course_id: q.course_id,
        session_id: q.session_id,
        question_id: q.id,
        kind: "instructor",
        text: input.text,
        verified: true,
        verified_by: user.id,
        verified_at: now,
        author_id: user.id,
      })
      .select("id")
      .single();
    if (error) throw new Error(`answer: ${error.message}`);
    answerId = data.id;
  }
  await ctx.db.from("questions").update({ state: "answered", first_answered_at: q.first_answered_at ?? now }).eq("id", q.id);
  await enqueue(ctx.admin, { kind: "index_verified_answer", payload: { answer_id: answerId }, organizationId: q.organization_id });
  kickJobs(ctx);
  return { answer_id: answerId, state: "answered" };
}

/** Deleting an answer removes it as a source (its chunk goes with it). */
export async function deleteAnswer(ctx: Ctx, answerId: string) {
  requireUser(ctx);
  const { data: a } = await ctx.db.from("answers").select("id, question_id, course_id").eq("id", answerId).maybeSingle();
  if (!a) throw notFound("Answer not found");
  if (!(await isInstructor(ctx, a.course_id))) throw forbidden("Only the course's instructors can do this");
  await ctx.db.from("answers").delete().eq("id", a.id);
  const { count } = await ctx.db.from("answers").select("id", { count: "exact", head: true }).eq("question_id", a.question_id);
  if (!count) await ctx.db.from("questions").update({ state: "needs_instructor" }).eq("id", a.question_id);
  return { deleted: a.id };
}

export async function deleteQuestion(ctx: Ctx, questionId: string) {
  requireUser(ctx);
  const { data: q } = await ctx.db.from("questions").select("id, course_id").eq("id", questionId).maybeSingle();
  if (!q) throw notFound("Question not found");
  if (!(await isInstructor(ctx, q.course_id))) throw forbidden("Only the course's instructors can do this");
  await ctx.db.from("questions").delete().eq("id", q.id);
  return { deleted: q.id };
}
