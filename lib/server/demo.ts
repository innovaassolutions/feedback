import type { AdminClient } from "@/lib/server/supabase-admin";
import type { Json } from "@/lib/database.types";
import { hashToken, newToken } from "@/lib/server/interviews/token";
import { DEFAULT_SESSION_GUIDE } from "@/lib/guide";

// Seven submitted, analysed interviews for a session: three named, three anonymous and one
// private. Everything here is invented. The ratings give Responses 7 of 8, Able to apply 5 of 7,
// Pace about right 4 of 7 and Recommend 7.7.

type Demo = {
  anonymity: "named" | "anonymous" | "private";
  ratings: { ability: string; pace: string; relevance: string; recommend: string };
  turns: string[];
  summary: string[];
  themes: Array<{ theme: string; sentiment: "positive" | "negative" | "mixed"; paraphrase: string }>;
  blockers: string[];
  suggestions: string[];
  quotes: Array<{ text: string; theme: string }>;
};

const Q = [
  "What was the most useful part of the session for you?",
  "Was anything unclear or confusing?",
  "Did anything block or slow you down, during the session or since?",
  "If you could change one thing for the next session, what would it be?",
];

export const DEMO_INTERVIEWS: Demo[] = [
  {
    anonymity: "named",
    ratings: { ability: "yes_without_help", pace: "about_right", relevance: "most", recommend: "9" },
    turns: [
      "Rebuilding the workflow from the guide. I did it twice and the second time I didn't need the guide.",
      "Not really. The Link Generator expiry caught me out but the guide explains it.",
      "Nothing blocked me.",
      "Keep the hands-on part exactly as it is.",
    ],
    summary: ["You found rebuilding the workflow most useful.", "The Link Generator expiry was new but the guide covered it.", "Keep the hands-on part as it is."],
    themes: [
      { theme: "Hands-on practice", sentiment: "positive", paraphrase: "Rebuilding the workflow twice made it stick." },
      { theme: "Materials and documentation", sentiment: "positive", paraphrase: "The guide explained the Link Generator expiry." },
    ],
    blockers: [],
    suggestions: ["Keep the hands-on rebuild exercise"],
    quotes: [{ text: "I did it twice and the second time I didn't need the guide.", theme: "Hands-on practice" }],
  },
  {
    anonymity: "named",
    ratings: { ability: "yes_with_guide", pace: "too_fast", relevance: "some", recommend: "8" },
    turns: [
      "Seeing Get Document Data pull the fields out of a real file.",
      "The Core Agent part went too fast. I copied the settings but I couldn't tell you why they work.",
      "The workspace was slow to load at the start.",
      "Ten more minutes on the Core Agent, with time to try our own instructions.",
    ],
    summary: ["Get Document Data on a real file was most useful.", "The Core Agent part went too fast.", "You'd like more time on the Core Agent."],
    themes: [
      { theme: "Content and relevance", sentiment: "positive", paraphrase: "Seeing Get Document Data on a real file was useful." },
      { theme: "Pace and timing", sentiment: "negative", paraphrase: "The Core Agent section was rushed." },
      { theme: "Platform and access", sentiment: "negative", paraphrase: "The workspace loaded slowly." },
    ],
    blockers: ["Workspace slow to load at the start"],
    suggestions: ["Give ten more minutes to the Core Agent with own instructions"],
    quotes: [{ text: "I copied the settings but I couldn't tell you why they work.", theme: "Pace and timing" }],
  },
  {
    anonymity: "named",
    ratings: { ability: "yes_with_guide", pace: "about_right", relevance: "most", recommend: "8" },
    turns: [
      "The step-by-step guide. I'll keep it open next to me at work.",
      "Finding the project ID. I looked in settings for ages before someone showed me the address bar.",
      "No.",
      "Put the project ID tip on the first slide.",
    ],
    summary: ["The step-by-step guide was most useful.", "Finding the project ID was confusing.", "Put the project ID tip on the first slide."],
    themes: [
      { theme: "Materials and documentation", sentiment: "mixed", paraphrase: "The guide is useful but the project ID was hard to find." },
    ],
    blockers: [],
    suggestions: ["Show where to find the project ID on the first slide"],
    quotes: [{ text: "I looked in settings for ages before someone showed me the address bar.", theme: "Materials and documentation" }],
  },
  {
    anonymity: "anonymous",
    ratings: { ability: "only_with_help", pace: "too_fast", relevance: "a_little", recommend: "6" },
    turns: [
      "Watching the demo of the finished workflow.",
      "Most of the Core Agent part. It assumed we already knew what an agent is.",
      "I couldn't log in for the first twenty minutes, so I was behind all session.",
      "Check everyone can log in before the session starts.",
    ],
    summary: ["The demo of the finished workflow was most useful.", "The Core Agent part assumed prior knowledge.", "You couldn't log in for twenty minutes.", "Check logins before the session."],
    themes: [
      { theme: "Platform and access", sentiment: "negative", paraphrase: "Couldn't log in for the first twenty minutes." },
      { theme: "Pace and timing", sentiment: "negative", paraphrase: "Fell behind and the Core Agent part moved too fast." },
      { theme: "Instructor delivery", sentiment: "mixed", paraphrase: "The demo helped, but agents weren't introduced." },
    ],
    blockers: ["Couldn't log in for the first twenty minutes"],
    suggestions: ["Check everyone can log in before the session starts"],
    quotes: [{ text: "I couldn't log in for the first twenty minutes, so I was behind all session.", theme: "Platform and access" }],
  },
  {
    anonymity: "anonymous",
    ratings: { ability: "yes_with_guide", pace: "about_right", relevance: "some", recommend: "8" },
    turns: [
      "The Link Generator. We share results with clients every week, so that's straight away useful.",
      "Nothing major.",
      "No problems.",
      "An example with engineering drawings rather than invoices.",
    ],
    summary: ["The Link Generator is straight away useful.", "You'd like an engineering example."],
    themes: [
      { theme: "Content and relevance", sentiment: "mixed", paraphrase: "The Link Generator is useful; the examples weren't from engineering." },
    ],
    blockers: [],
    suggestions: ["Use an engineering drawing as the example"],
    quotes: [{ text: "We share results with clients every week, so that's straight away useful.", theme: "Content and relevance" }],
  },
  {
    anonymity: "anonymous",
    ratings: { ability: "not_yet", pace: "too_slow", relevance: "none_yet", recommend: "7" },
    turns: [
      "Honestly I knew most of it already.",
      "No.",
      "Nothing blocked me, I just didn't learn much new.",
      "An advanced track for people who have used the platform before.",
    ],
    summary: ["You already knew most of the content.", "You'd like an advanced track."],
    themes: [
      { theme: "Content and relevance", sentiment: "negative", paraphrase: "Too basic for an experienced user." },
      { theme: "Pace and timing", sentiment: "negative", paraphrase: "Too slow for someone who knew the basics." },
    ],
    blockers: [],
    suggestions: ["Offer an advanced track for experienced users"],
    quotes: [{ text: "Honestly I knew most of it already.", theme: "Content and relevance" }],
  },
  {
    anonymity: "private",
    ratings: { ability: "yes_without_help", pace: "about_right", relevance: "most", recommend: "8" },
    turns: [],
    summary: [],
    themes: [
      { theme: "Hands-on practice", sentiment: "positive", paraphrase: "The rebuild exercise was the most useful part." },
      { theme: "Support and follow-up", sentiment: "negative", paraphrase: "Unsure who to ask after the course." },
    ],
    blockers: [],
    suggestions: ["Say who to contact with questions after the course"],
    quotes: [],
  },
];

const dateOnly = (d: Date) => `${d.toISOString().slice(0, 10)}T00:00:00Z`;

/**
 * Inserts the demo interviews for a session. `learners` gives one user id per interview, in the
 * same order as DEMO_INTERVIEWS. Named interviews link to their learner; the others don't, and
 * their completion rows carry only a date.
 */
export async function seedDemoInterviews(db: AdminClient, sessionId: string, learners: string[], now = new Date()) {
  const { data: session } = await db.from("sessions").select("id, organization_id, course_id").eq("id", sessionId).single();
  if (!session) throw new Error("demo: session not found");
  const ids: string[] = [];
  for (const [i, demo] of DEMO_INTERVIEWS.entries()) {
    const named = demo.anonymity === "named";
    const at = named ? new Date(now.getTime() - (DEMO_INTERVIEWS.length - i) * 600_000).toISOString() : dateOnly(now);
    const progress = {
      rating_items: DEFAULT_SESSION_GUIDE.rating_items.map((r) => r.id),
      current_item: null,
      clarified: [],
      topics: ["most_useful", "unclear", "blockers", "change_next_time"].map((id) => ({ id, status: "covered" })),
      current_topic: null,
      last_offer: false,
      proposed_summary: demo.summary,
      blockers_flagged: 0,
      questions_raised: 0,
    };
    const { data: iv, error } = await db
      .from("interviews")
      .insert({
        organization_id: session.organization_id,
        course_id: session.course_id,
        session_id: session.id,
        kind: "session",
        anonymity: demo.anonymity,
        participant_id: named ? learners[i] : null,
        state: "analysed",
        stage: "done",
        token_hash: hashToken(newToken()),
        progress: progress as unknown as Json,
        turn_count: demo.turns.length + 1,
        summary: demo.anonymity === "private" ? null : demo.summary,
        summary_edited: false,
        agent_version: "demo",
        started_at: at,
        last_activity_at: at,
        submitted_at: at,
        analysed_at: at,
      })
      .select("id")
      .single();
    if (error || !iv) throw new Error(`demo interview: ${error?.message}`);
    ids.push(iv.id);
    const turns = demo.turns.flatMap((answer, k) => [
      { role: "interviewer", text: Q[k], stage: "conversation" },
      { role: "learner", text: answer, stage: "conversation" },
    ]);
    if (turns.length) {
      await db.from("interview_turns").insert(
        turns.map((t, k) => ({ organization_id: session.organization_id, interview_id: iv.id, seq: k + 1, role: t.role, text: t.text, mode: "text", stage: t.stage as "conversation", created_at: at })),
      );
    }
    await db.from("ratings").insert(
      Object.entries(demo.ratings).map(([item_id, choice]) => ({
        organization_id: session.organization_id,
        course_id: session.course_id,
        session_id: session.id,
        interview_id: iv.id,
        kind: "session" as const,
        item_id,
        choice,
        created_at: at,
        updated_at: at,
      })),
    );
    await db.from("insights").insert({
      organization_id: session.organization_id,
      course_id: session.course_id,
      session_id: session.id,
      interview_id: iv.id,
      kind: "session",
      themes: demo.themes as unknown as Json,
      blockers: demo.blockers,
      suggestions: demo.suggestions,
      quotes: demo.quotes as unknown as Json,
      paraphrases: demo.themes.map((t) => ({ text: t.paraphrase, theme: t.theme })) as unknown as Json,
      agent_version: "demo",
      created_at: at,
    });
    await db.from("completions").insert({
      organization_id: session.organization_id,
      course_id: session.course_id,
      session_id: session.id,
      user_id: learners[i],
      kind: "session",
      completed_on: now.toISOString().slice(0, 10),
    });
  }
  return ids;
}
