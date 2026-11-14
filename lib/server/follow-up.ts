import type { AdminClient } from "@/lib/server/supabase-admin";

/**
 * The follow-up interview opens follow_up_days after the course's last session, once that
 * session has been delivered. It is held against that last session.
 */
export async function followUpWindow(db: AdminClient, courseId: string, now: Date) {
  const [{ data: course }, { data: last }] = await Promise.all([
    db.from("courses").select("follow_up_days").eq("id", courseId).single(),
    db.from("sessions").select("id, number, date, state").eq("course_id", courseId).order("number", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!course || !last) return { open: false, sessionId: null as string | null, sessionNumber: null as number | null, opensAt: null as Date | null };
  const opensAt = new Date(new Date(`${last.date}T00:00:00Z`).getTime() + course.follow_up_days * 86_400_000);
  const delivered = last.state === "open" || last.state === "closed";
  return { open: delivered && now >= opensAt, sessionId: last.id, sessionNumber: last.number, opensAt };
}
