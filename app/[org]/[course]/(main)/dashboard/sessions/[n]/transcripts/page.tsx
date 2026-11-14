import { notFound } from "next/navigation";
import { requireCourse } from "@/lib/course";
import { requestCtx } from "@/lib/server/route";
import { listInterviews } from "@/lib/server/ops/results";
import { createUserClient } from "@/lib/supabase/server";
import { Badge, Card, Notice, PageTitle } from "@/components/ui";
import { AccuracyButtons, RetryButton } from "@/components/dashboard/review-buttons";

type Item = Awaited<ReturnType<typeof listInterviews>>["anonymous"][number] & { name?: string };

function Transcript({ item, heading }: { item: Item; heading: string }) {
  return (
    <Card className="space-y-3" data-testid="transcript">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold" data-testid="transcript-heading">{heading}</h3>
        {item.state === "needs_review" ? <span className="flex items-center gap-2"><Badge tone="danger">Needs review</Badge>{item.seal ? <RetryButton reference={item.seal} /> : null}</span> : null}
      </div>
      <p className="text-sm text-muted">{Object.entries(item.ratings).map(([k, v]) => `${k}: ${v.replace(/_/g, " ")}`).join(" · ")}</p>
      {item.summary.length ? (
        <div>
          <p className="text-sm font-medium">Confirmed summary</p>
          <ul className="list-disc pl-5 text-sm">{item.summary.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      ) : null}
      <details>
        <summary className="cursor-pointer text-sm text-primary">Conversation</summary>
        <ol className="mt-2 space-y-1 text-sm">
          {item.turns.map((t, i) => (
            <li key={i}><span className="font-medium">{t.role === "learner" ? "Learner" : "Interviewer"}:</span> {t.text}</li>
          ))}
        </ol>
      </details>
      {item.insights && item.seal ? <AccuracyButtons reference={item.seal} current={item.insights.accuracy} /> : null}
    </Card>
  );
}

export default async function TranscriptsPage({ params }: PageProps<"/[org]/[course]/dashboard/sessions/[n]/transcripts">) {
  const { org, course, n } = await params;
  const ctx = await requireCourse(org, course);
  if (!ctx.can.readTranscripts) notFound();
  const db = await createUserClient();
  const { data: session } = await db.from("sessions").select("id, number, title").eq("course_id", ctx.course.id).eq("number", Number(n)).maybeSingle();
  if (!session) notFound();
  const list = await listInterviews(await requestCtx(), { session_id: session.id }, { withRefs: true });
  return (
    <>
      <PageTitle title="Transcripts" subtitle={`Session ${session.number}: ${session.title}`} />
      <div className="space-y-4" data-testid="transcripts">
        <h2 className="text-lg font-semibold">Named</h2>
        {list.named.length ? list.named.map((t) => <Transcript key={t.ref} item={t} heading={t.name} />) : <p className="text-muted">No named interviews.</p>}
        <h2 className="pt-4 text-lg font-semibold">Anonymous</h2>
        <p className="text-sm text-muted">Shown in random order, with no names or times.</p>
        {list.anonymous_hidden ? (
          <Notice>Anonymous interviews appear once {list.min_group_size} learners have responded.</Notice>
        ) : (
          list.anonymous.map((t, i) => <Transcript key={i} item={t} heading="Anonymous learner" />)
        )}
        <p className="pt-4 text-sm text-muted">Private interviews are never shown individually. They count toward the scores and themes.</p>
      </div>
    </>
  );
}
