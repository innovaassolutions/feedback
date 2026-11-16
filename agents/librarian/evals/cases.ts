import type { SourceGroup } from "../tools";

// The Librarian's eval set: questions on Session 3 of an invented course about an invented
// workflow product, answered from fixture sources. The session's recording shows a "Publish"
// button that the product documentation says has since become "Deploy", so one question checks
// that a disagreement between the session and the documentation is noticed. All names are invented.

export type FixtureSource = {
  id: string;
  group: SourceGroup;
  kind: "session_document" | "documentation_page" | "verified_answer";
  title: string;
  transcript?: boolean;
  session_number?: number;
  page_url?: string;
  content: string;
};

export const EVAL_SESSION = { number: 3, title: "Automations" };

export const SOURCES: FixtureSource[] = [
  // Session 3's recording transcript.
  {
    id: "t3-1",
    group: "this_session",
    kind: "session_document",
    transcript: true,
    session_number: 3,
    title: "Session 3 recording transcript",
    content:
      "Instructor: Welcome back. Today we'll build an automation that reads incoming invoices. Everyone should have invoice-sample.pdf from the shared course folder; that's the file we'll use for the whole exercise. Open Automations from the left-hand menu and choose New automation.",
  },
  {
    id: "t3-2",
    group: "this_session",
    kind: "session_document",
    transcript: true,
    session_number: 3,
    title: "Session 3 recording transcript",
    content:
      "Instructor: For the trigger, pick When a file arrives and point it at your Invoices inbox. Then add a Core Agent step and paste in the extraction instructions from the handout. Run it once on invoice-sample.pdf and check the supplier name and total come out right.",
  },
  {
    id: "t3-3",
    group: "this_session",
    kind: "session_document",
    transcript: true,
    session_number: 3,
    title: "Session 3 recording transcript",
    content:
      "Instructor: When you're happy with it, click Publish in the top right. That makes the automation live. Jonah Reyes: Does it try again if the agent step fails? Instructor: Good question. Yes, a failed step is retried, and every attempt shows up on the Runs tab, so you can see what happened.",
  },
  {
    id: "t3-4",
    group: "this_session",
    kind: "session_document",
    transcript: true,
    session_number: 3,
    title: "Session 3 recording transcript",
    content:
      "Instructor: Before Session 4, connect your own invoices inbox and run the automation on five real invoices. Bring any that came out wrong, and we'll start next time by fixing the extraction instructions together.",
  },
  // Session 3's slides.
  {
    id: "s3-1",
    group: "this_session",
    kind: "session_document",
    session_number: 3,
    title: "Session 3 slides",
    content:
      "# Session 3: Automations\n\nBy the end of this session you can build an automation that reads invoices, make it live, and check its runs.\n\n## Exercise\n1. New automation\n2. Trigger: When a file arrives\n3. Core Agent step with the extraction instructions\n4. Test on invoice-sample.pdf\n5. Make it live",
  },
  // Session 2's transcript.
  {
    id: "t2-1",
    group: "other_session",
    kind: "session_document",
    transcript: true,
    session_number: 2,
    title: "Session 2 recording transcript",
    content:
      "Instructor: In this session we set up your workspace. Workspace admins add teammates from Settings, then Members, then Invite. Each teammate gets an email and joins with the role you choose.",
  },
  // The product documentation.
  {
    id: "d-deploy",
    group: "documentation",
    kind: "documentation_page",
    title: "Making an automation live",
    page_url: "https://docs.workflow.example/automations/deploy",
    content:
      "To make an automation live, choose Deploy at the top right of the automation editor. Deploy replaced the Publish button in version 4.2; it works the same way. A deployed automation starts listening for its trigger straight away. To stop it, choose Pause.",
  },
  {
    id: "d-retries",
    group: "documentation",
    kind: "documentation_page",
    title: "Retries and failed steps",
    page_url: "https://docs.workflow.example/automations/retries",
    content:
      "When a step fails, the automation retries it up to three times, waiting 1, 5 and then 15 minutes. Every attempt is listed on the automation's Runs tab. To change how many times a step is retried, open Automation settings, then Reliability, and set Retries to a number from 0 to 5.",
  },
  {
    id: "d-file-trigger",
    group: "documentation",
    kind: "documentation_page",
    title: "The When a file arrives trigger",
    page_url: "https://docs.workflow.example/triggers/file",
    content:
      "The When a file arrives trigger starts an automation for each new file in the inbox it watches. It accepts PDF, PNG and JPEG files up to 20 MB each. Larger files and other types are skipped, and each skipped file is listed on the Runs tab with the reason.",
  },
  {
    id: "d-core-agent",
    group: "documentation",
    kind: "documentation_page",
    title: "Core Agent steps",
    page_url: "https://docs.workflow.example/steps/core-agent",
    content:
      "A Core Agent step reads the file or text it is given and returns the fields its instructions ask for. Write the instructions as a list of the fields you want, with an example value for each. Test a step with Run once before making the automation live.",
  },
  // A verified answer from an earlier question.
  {
    id: "v-1",
    group: "verified_answer",
    kind: "verified_answer",
    session_number: 2,
    title: "Verified answer",
    content: "Question: Where do I invite colleagues to my workspace? Answer: Go to Settings, then Members, and choose Invite. Enter their email and pick their role.",
  },
];

export type LibrarianCase = {
  id: string;
  question: string;
  answerable: boolean;
  /** Each group listed must be cited at least once. */
  citeGroups?: SourceGroup[];
  /** Each entry is a list of alternatives; the answer must contain one of each. */
  mustMention?: string[][];
  mustNotMention?: string[];
  sourcesDisagree?: boolean;
};

export const CASES: LibrarianCase[] = [
  {
    id: "covered-sample-file",
    question: "Which sample file did we use in this session?",
    answerable: true,
    citeGroups: ["this_session"],
    mustMention: [["invoice-sample.pdf"]],
  },
  {
    id: "renamed-button",
    question: "The instructor clicked Publish to make the automation live, but I can't find a Publish button. Where is it?",
    answerable: true,
    citeGroups: ["this_session", "documentation"],
    mustMention: [["Deploy"]],
    sourcesDisagree: true,
  },
  {
    id: "retries-how-to",
    question: "How many times does a failed step get retried, and can I change that?",
    answerable: true,
    citeGroups: ["documentation"],
    mustMention: [["three", "3"], ["Reliability"]],
  },
  {
    id: "file-limit",
    question: "What's the biggest file the When a file arrives trigger will take?",
    answerable: true,
    citeGroups: ["documentation"],
    mustMention: [["20 MB", "20MB"]],
  },
  {
    id: "homework",
    question: "What were we asked to do before the next session?",
    answerable: true,
    citeGroups: ["this_session"],
    mustMention: [["five", "5"]],
  },
  {
    id: "learner-not-named",
    question: "Did anyone ask about failed steps during the session? What was the answer?",
    answerable: true,
    citeGroups: ["this_session"],
    mustMention: [["Runs"]],
    mustNotMention: ["Jonah", "Reyes"],
  },
  {
    id: "earlier-session",
    question: "How do I add a teammate to my workspace?",
    answerable: true,
    mustMention: [["Members"], ["Invite"]],
  },
  {
    id: "not-in-sources",
    question: "How much does the enterprise plan cost per user?",
    answerable: false,
  },
];

export type CaseResult = { id: string; passed: boolean; problems: string[] };

/** Scores one answer against its case. Every check is in code. */
export function scoreCase(
  c: LibrarianCase,
  out: { answerable: boolean; answer: string; citations: string[]; sources_disagree: boolean },
  seenIds: Set<string>,
): CaseResult {
  const problems: string[] = [];
  const byId = new Map(SOURCES.map((s) => [s.id, s]));
  if (out.answerable !== c.answerable) problems.push(`answerable was ${out.answerable}, expected ${c.answerable}`);
  if (c.answerable && out.answerable) {
    const cited = out.citations.filter((id) => seenIds.has(id));
    if (!cited.length) problems.push("no citation came from its searches");
    if (cited.length !== out.citations.length) problems.push("cited a passage its searches didn't return");
    for (const g of c.citeGroups ?? []) {
      if (!cited.some((id) => byId.get(id)?.group === g)) problems.push(`didn't cite ${g.replace("_", " ")}`);
    }
    const text = out.answer.toLowerCase();
    for (const options of c.mustMention ?? []) {
      if (!options.some((o) => text.includes(o.toLowerCase()))) problems.push(`answer doesn't mention ${options.join(" or ")}`);
    }
    for (const word of c.mustNotMention ?? []) {
      if (text.includes(word.toLowerCase())) problems.push(`answer mentions ${word}`);
    }
    if (c.sourcesDisagree !== undefined && out.sources_disagree !== c.sourcesDisagree) problems.push(`sources_disagree was ${out.sources_disagree}`);
  }
  return { id: c.id, passed: problems.length === 0, problems };
}
