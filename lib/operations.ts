import { z } from "zod";
import { themeTokensSchema } from "@/lib/theme/tokens";

// Every API operation: a name, a one-line description and a Zod schema for its input.
// No input is optional. The agents' tools are named after the operations they call.

const id = z.uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date format YYYY-MM-DD");
const text = (max: number) => z.string().trim().min(1).max(max);

export const ANONYMITY_LEVELS = ["named", "anonymous", "private"] as const;
export const INTERVIEW_KINDS = ["session", "follow_up"] as const;
export const SESSION_STATES = ["draft", "scheduled", "open", "closed"] as const;
export const ACTION_STATUSES = ["planned", "in_progress", "done"] as const;
export const STAFF_ROLES = ["org_admin", "instructor", "sponsor"] as const;

type Op<S extends z.ZodType> = { method: "GET" | "POST" | "DELETE"; path: string; description: string; input: S };
const op = <S extends z.ZodType>(method: Op<S>["method"], path: string, description: string, input: S): Op<S> => ({ method, path, description, input });

export const operations = {
  list_sessions: op("GET", "/api/courses/{course_id}/sessions", "The sessions a user may see, with state and response counts", z.object({ course_id: id })),
  get_session: op("GET", "/api/sessions/{session_id}", "The session, its brief, and the documents the user may see", z.object({ session_id: id })),
  create_session: op(
    "POST",
    "/api/courses/{course_id}/sessions",
    "Creates a draft session",
    z.object({ course_id: id, title: text(200), date: isoDate, objectives: z.string().trim().max(4000) }),
  ),
  set_session_state: op("POST", "/api/sessions/{session_id}/state", "Moves a session to its next state", z.object({ session_id: id, state: z.enum(SESSION_STATES) })),
  add_document: op(
    "POST",
    "/api/sessions/{session_id}/documents",
    "Stores the file and queues it for reading",
    z.object({ session_id: id, title: text(200), audience: z.enum(["learners", "agents_only"]), file: z.instanceof(File) }),
  ),
  remove_document: op("DELETE", "/api/documents/{document_id}", "Removes a document and its chunks", z.object({ document_id: id })),
  approve_brief: op(
    "POST",
    "/api/sessions/{session_id}/brief",
    "Saves the brief the Interviewer will use",
    z.object({
      session_id: id,
      objectives: z.array(text(300)).max(20),
      topics: z.array(text(200)).max(30),
      known_issues: z.array(text(300)).max(20),
    }),
  ),
  add_documentation_source: op(
    "POST",
    "/api/organizations/{organization_id}/documentation",
    "Reads a product documentation site into the organization's sources",
    z.object({ organization_id: id, url: z.url({ protocol: /^https?$/ }) }),
  ),
  invite_learners: op(
    "POST",
    "/api/courses/{course_id}/enrollments",
    "Enrolls learners and sends magic links",
    z.object({ course_id: id, emails: z.array(z.string().trim().min(1).max(320)).min(1).max(500) }),
  ),
  add_staff: op(
    "POST",
    "/api/organizations/{organization_id}/staff",
    "Gives a person an organization admin, instructor or sponsor role, creating their account and sending a sign-in link",
    z.object({
      organization_id: id,
      name: text(120),
      email: z.string().trim().toLowerCase().pipe(z.email()),
      role: z.enum(STAFF_ROLES),
      // Instructors and sponsors belong to one course; an organization admin to none.
      course_id: id.nullable(),
    }),
  ),
  remove_staff: op("DELETE", "/api/staff/{membership_id}", "Removes one organization admin, instructor or sponsor role", z.object({ membership_id: id })),
  add_platform_admin: op(
    "POST",
    "/api/platform/admins",
    "Makes a person a platform admin, creating their account and sending a sign-in link",
    z.object({ name: text(120), email: z.string().trim().toLowerCase().pipe(z.email()) }),
  ),
  remove_platform_admin: op("DELETE", "/api/platform/admins/{user_id}", "Removes a person's platform admin access", z.object({ user_id: id })),
  start_interview: op(
    "POST",
    "/api/sessions/{session_id}/interviews",
    "Starts an interview and sets its token",
    z.object({ session_id: id, anonymity: z.enum(ANONYMITY_LEVELS), kind: z.enum(INTERVIEW_KINDS) }),
  ),
  send_turn: op(
    "POST",
    "/api/interviews/{interview_id}/turns",
    "Adds the learner's turn and returns the Interviewer's reply",
    z.object({ interview_id: id, text: text(4000), mode: z.enum(["text", "voice"]) }),
  ),
  save_rating: op(
    "POST",
    "/api/interviews/{interview_id}/ratings",
    "Saves one rating",
    z.object({ interview_id: id, item_id: z.string().regex(/^[a-z_]+$/), choice: z.string().min(1).max(64) }),
  ),
  submit_interview: op(
    "POST",
    "/api/interviews/{interview_id}/submit",
    "Submits the interview and queues analysis",
    z.object({ interview_id: id, anonymity: z.enum(ANONYMITY_LEVELS), summary: z.array(text(600)).min(1).max(8) }),
  ),
  get_voice_token: op("POST", "/api/interviews/{interview_id}/voice-token", "Mints a short-lived Vocal Bridge token", z.object({ interview_id: id })),
  get_session_results: op("GET", "/api/sessions/{session_id}/results", "The aggregated metrics, themes and quotes for a session", z.object({ session_id: id })),
  list_interviews: op("GET", "/api/sessions/{session_id}/interviews", "The transcripts an instructor may read", z.object({ session_id: id })),
  record_action: op(
    "POST",
    "/api/sessions/{session_id}/actions",
    "Records a change made because of feedback",
    z.object({ session_id: id, you_said: text(1000), we_did: text(1000), status: z.enum(ACTION_STATUSES) }),
  ),
  list_questions: op("GET", "/api/sessions/{session_id}/questions", "The questions, by votes and then time", z.object({ session_id: id })),
  ask_question: op(
    "POST",
    "/api/sessions/{session_id}/questions",
    "Posts a question and queues an answer",
    z.object({ session_id: id, text: z.string().trim().min(3).max(2000), anonymous: z.boolean() }),
  ),
  vote_question: op("POST", "/api/questions/{question_id}/votes", "Adds the learner's \"I have this question too\"", z.object({ question_id: id })),
  answer_question: op(
    "POST",
    "/api/questions/{question_id}/answers",
    "An instructor answers, or verifies an AI answer",
    z.object({ question_id: id, text: z.string().trim().max(6000), verifies_answer_id: id.nullable() }),
  ),
  propose_theme: op("POST", "/api/organizations/{organization_id}/themes", "The Brand designer proposes a theme", z.object({ organization_id: id, logo: z.instanceof(File) })),
  approve_theme: op("POST", "/api/themes/{theme_id}/approval", "Makes a theme live for the organization", z.object({ theme_id: id, tokens: themeTokensSchema })),
  get_quality: op("GET", "/api/platform/quality", "Agent quality figures by agent and AGENT.md version", z.object({})),
} as const;

export type OperationName = keyof typeof operations;
export type OperationInput<N extends OperationName> = z.infer<(typeof operations)[N]["input"]>;
