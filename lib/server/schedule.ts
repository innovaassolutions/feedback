import type { JobDeps } from "@/lib/server/jobs/queue";
import { markOnce } from "@/lib/server/jobs/queue";
import { scheduleDocumentationReads } from "@/agents/librarian/sources";
import { checkAlerts } from "@/lib/server/quality/jobs";
import { followUpWindow } from "@/lib/server/follow-up";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * Feedback reminders: one 24 hours after a session opens and one 24 hours before it closes, to
 * each enrolled learner with no completion for it. Each is sent at most once.
 */
export async function sendReminders(deps: JobDeps) {
  const now = deps.now();
  const { data: sessions } = await deps.admin
    .from("sessions")
    .select("id, organization_id, course_id, number, title, opened_at, closes_at, courses!inner(slug, title, organizations!inner(slug))")
    .eq("state", "open");
  let sent = 0;
  for (const s of sessions ?? []) {
    if (!s.opened_at) continue;
    const due: Array<{ key: string; subject: string }> = [];
    if (now.getTime() >= new Date(s.opened_at).getTime() + DAY) {
      due.push({ key: "after_open", subject: `How did Session ${s.number} go?` });
    }
    if (s.closes_at && now.getTime() >= new Date(s.closes_at).getTime() - DAY && now < new Date(s.closes_at)) {
      due.push({ key: "before_close", subject: `Last day to give feedback on Session ${s.number}` });
    }
    if (!due.length) continue;
    const [{ data: learners }, { data: done }] = await Promise.all([
      deps.admin.from("enrollments").select("user_id, email, display_name").eq("course_id", s.course_id),
      deps.admin.from("completions").select("user_id").eq("session_id", s.id).eq("kind", "session"),
    ]);
    const finished = new Set((done ?? []).map((d) => d.user_id));
    const link = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/${s.courses.organizations.slug}/${s.courses.slug}/sessions/${s.number}/interview`;
    for (const reminder of due) {
      for (const l of learners ?? []) {
        if (finished.has(l.user_id)) continue;
        if (!(await markOnce(deps.admin, `reminder:${reminder.key}:${s.id}:${l.user_id}`, s.organization_id, "reminder_sent"))) continue;
        await deps.mailer.send({
          to: l.email,
          subject: reminder.subject,
          text: `Hello ${l.display_name.split(" ")[0]},\n\nYour feedback on Session ${s.number}: ${s.title} helps shape the next session. It takes about five minutes, and you choose how anonymous to be.\n\n${link}`,
        });
        sent++;
      }
    }
  }
  return sent;
}

/** Interviews with no activity for 24 hours are abandoned. Their ratings stay; they aren't analysed. */
export async function abandonStaleInterviews(deps: JobDeps) {
  const cutoff = new Date(deps.now().getTime() - DAY).toISOString();
  const { data } = await deps.admin.from("interviews").update({ state: "abandoned" }).eq("state", "in_progress").lt("last_activity_at", cutoff).select("id");
  return data?.length ?? 0;
}

/** Sessions whose feedback window has ended move to closed. Q&A stays open. */
export async function closeFinishedSessions(deps: JobDeps) {
  const now = deps.now().toISOString();
  const { data } = await deps.admin.from("sessions").update({ state: "closed", closed_at: now }).eq("state", "open").lt("closes_at", now).select("id");
  return data?.length ?? 0;
}

/** Deletes transcripts of interviews submitted more than retention_days ago. Scores and themes stay. */
export async function applyRetention(deps: JobDeps) {
  const { data: courses } = await deps.admin.from("courses").select("id, retention_days");
  let deleted = 0;
  for (const c of courses ?? []) {
    const cutoff = new Date(deps.now().getTime() - c.retention_days * DAY).toISOString();
    const { data: old } = await deps.admin.from("interviews").select("id").eq("course_id", c.id).not("submitted_at", "is", null).lt("submitted_at", cutoff);
    const ids = (old ?? []).map((i) => i.id);
    if (!ids.length) continue;
    const { count } = await deps.admin.from("interview_turns").delete({ count: "exact" }).in("interview_id", ids);
    await deps.admin.from("interviews").update({ summary: null }).in("id", ids);
    deleted += count ?? 0;
  }
  return deleted;
}

/** Tells learners when a course's follow-up interview opens. */
export async function announceFollowUps(deps: JobDeps) {
  const { data: courses } = await deps.admin.from("courses").select("id, organization_id, slug, title, organizations!inner(slug)");
  let sent = 0;
  for (const c of courses ?? []) {
    const window = await followUpWindow(deps.admin, c.id, deps.now());
    if (!window.open || !window.sessionId) continue;
    const [{ data: learners }, { data: done }] = await Promise.all([
      deps.admin.from("enrollments").select("user_id, email, display_name").eq("course_id", c.id),
      deps.admin.from("completions").select("user_id").eq("session_id", window.sessionId).eq("kind", "follow_up"),
    ]);
    const finished = new Set((done ?? []).map((d) => d.user_id));
    const link = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/${c.organizations.slug}/${c.slug}/sessions/${window.sessionNumber}/interview?kind=follow_up`;
    for (const l of learners ?? []) {
      if (finished.has(l.user_id)) continue;
      if (!(await markOnce(deps.admin, `follow_up_invite:${c.id}:${l.user_id}`, c.organization_id, "reminder_sent"))) continue;
      await deps.mailer.send({
        to: l.email,
        subject: `${c.title}: has it helped at work?`,
        text: `Hello ${l.display_name.split(" ")[0]},\n\nIt's been a while since the course. A short follow-up asks what you've used at work and what got in the way. About five minutes.\n\n${link}`,
      });
      sent++;
    }
  }
  return sent;
}

/** Everything the cron tick does before running queued jobs. */
export async function runSchedule(deps: JobDeps) {
  return {
    closed: await closeFinishedSessions(deps),
    abandoned: await abandonStaleInterviews(deps),
    reminders: await sendReminders(deps),
    follow_ups: await announceFollowUps(deps),
    retention: await applyRetention(deps),
    documentation: await scheduleDocumentationReads(deps),
    alerts: await checkAlerts(deps),
  };
}
