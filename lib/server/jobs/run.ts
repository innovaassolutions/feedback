import { processJobs, registerJob, type JobDeps } from "./queue";
import { draftBrief, readDocument } from "@/agents/librarian/reading";
import { answerQuestion } from "@/agents/librarian/answer";
import { indexVerifiedAnswer, readDocumentation } from "@/agents/librarian/sources";
import { analyseInterview } from "@/agents/analyst/analyse";
import { writeSessionSummary } from "@/agents/analyst/summary";
import { notifyBlocker } from "@/lib/server/notify";
import { scoreInterview } from "@/lib/server/quality/jobs";

// Every kind of background job and the code that runs it.
registerJob("read_document", (p, deps) => readDocument(p as { document_id: string }, deps));
registerJob("draft_brief", async (p, deps) => {
  await draftBrief(p as { session_id: string }, deps);
});
registerJob("analyse_interview", async (p, deps) => {
  await analyseInterview(p as { interview_id: string }, deps);
});
registerJob("session_summary", async (p, deps) => {
  await writeSessionSummary(p as { session_id: string; kind?: "session" | "follow_up" }, deps);
});
registerJob("notify_blocker", (p, deps) => notifyBlocker(p as { session_id: string; summary: string }, deps));
registerJob("answer_question", async (p, deps) => {
  await answerQuestion(p as { question_id: string }, deps);
});
registerJob("index_verified_answer", (p, deps) => indexVerifiedAnswer(p as { answer_id: string }, deps));
registerJob("read_documentation", (p, deps) => readDocumentation(p as { source_id: string }, deps));
registerJob("score_interview", async (p, deps) => {
  await scoreInterview(p as { interview_id: string }, deps);
});

export async function runJobs(deps: JobDeps, opts?: { maxJobs?: number }) {
  return processJobs(deps, opts);
}
