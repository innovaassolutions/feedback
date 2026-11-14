"use client";
import { useActionState } from "react";
import { saveGuide, type GuideState } from "@/lib/actions/guide";
import type { GuidePart } from "@/lib/guide";
import { DEFAULT_SESSION_GUIDE } from "@/lib/guide";
import { Button, Card, Field, Notice, inputClass } from "@/components/ui";

export function GuideForm({ courseId, guide }: { courseId: string; guide: GuidePart }) {
  const [state, action, pending] = useActionState<GuideState, FormData>(saveGuide, { status: "idle", message: "" });
  const active = new Set(guide.topics.map((t) => t.id));
  const allTopics = [...guide.topics, ...DEFAULT_SESSION_GUIDE.topics.filter((t) => !active.has(t.id))];
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="course_id" value={courseId} />
      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">Rating items</h2>
        <p className="text-sm text-muted">Concrete choices work better than agree/disagree scales. “Prefer not to say” is always added.</p>
        {guide.rating_items.map((item) => (
          <div key={item.id} className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
            <input type="hidden" name="item_id" value={item.id} />
            <Field label={`Question (${item.id})`}>
              <textarea name={`item_prompt_${item.id}`} defaultValue={item.prompt} rows={2} className={inputClass} />
            </Field>
            <Field label="Choices" hint="One per line">
              <textarea name={`item_choices_${item.id}`} defaultValue={item.choices.map((c) => c.label).join("\n")} rows={4} className={inputClass} />
            </Field>
          </div>
        ))}
      </Card>
      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">Conversation topics</h2>
        <p className="text-sm text-muted">The Interviewer covers these in order, one question per turn and one follow-up per topic.</p>
        {allTopics.map((t) => (
          <div key={t.id} className="space-y-2 border-t border-border pt-4">
            <input type="hidden" name="topic_id" value={t.id} />
            <label className="flex items-center gap-2 font-medium">
              <input type="checkbox" name={`topic_on_${t.id}`} defaultChecked={active.has(t.id)} /> Include
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Label"><input name={`topic_label_${t.id}`} defaultValue={t.label} className={inputClass} /></Field>
              <Field label="What to find out"><input name={`topic_goal_${t.id}`} defaultValue={t.goal} className={inputClass} /></Field>
              <Field label="Opening question"><input name={`topic_opener_${t.id}`} defaultValue={t.opener} className={inputClass} /></Field>
            </div>
          </div>
        ))}
      </Card>
      {state.status === "error" ? <Notice tone="danger">{state.message}</Notice> : null}
      {state.status === "saved" ? <Notice tone="success">{state.message}</Notice> : null}
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save guide"}</Button>
    </form>
  );
}
