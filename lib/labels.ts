export const SESSION_STATE_LABEL = {
  draft: "Draft",
  scheduled: "Upcoming",
  open: "Feedback open",
  closed: "Closed",
} as const;

export const SESSION_STATE_ORDER = ["draft", "scheduled", "open", "closed"] as const;

/** The button that moves a session on, named for what it does. */
export const SESSION_STATE_ACTION = {
  draft: "Show to learners",
  scheduled: "Open feedback",
  open: "Close feedback",
  closed: null,
} as const;

/** What a session's state means, in one line. */
export function describeSessionState(state: "draft" | "scheduled" | "open" | "closed", closesAt: string | null): string {
  if (state === "draft") return "Only instructors can see it.";
  if (state === "scheduled") return "Learners can see it. Feedback opens when you open it, after the session.";
  if (state === "open") return closesAt ? `Learners can give feedback until ${formatDate(closesAt)}.` : "Learners can give feedback.";
  return "Feedback has ended. The Q&A board stays open.";
}
export type SessionState = (typeof SESSION_STATE_ORDER)[number];

export function nextSessionState(state: SessionState): SessionState | null {
  const i = SESSION_STATE_ORDER.indexOf(state);
  return i >= 0 && i < SESSION_STATE_ORDER.length - 1 ? SESSION_STATE_ORDER[i + 1] : null;
}

export const INTERVIEW_STATE_LABEL = {
  in_progress: "In progress",
  submitted: "Submitted",
  analysed: "Analysed",
  needs_review: "Needs review",
  abandoned: "Abandoned",
} as const;

export const QUESTION_STATE_LABEL = {
  open: "Waiting for an answer",
  ai_answered: "AI answer · not reviewed",
  needs_instructor: "Sent to instructor",
  answered: "Answered by instructor",
} as const;

export const ANONYMITY_LABEL = {
  named: "Named",
  anonymous: "Anonymous",
  private: "Private, summary only",
} as const;

export const SOURCE_KIND_LABEL = {
  session_document: "Session document",
  documentation_page: "Documentation",
  verified_answer: "Verified answer",
} as const;

export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date.length === 10 ? `${date}T00:00:00Z` : date) : date;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
