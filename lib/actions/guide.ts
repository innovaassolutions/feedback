"use server";
import { revalidatePath } from "next/cache";
import { createUserClient } from "@/lib/supabase/server";
import { guidePartSchema, type GuidePart } from "@/lib/guide";

export type GuideState = { status: "idle" | "saved" | "error"; message: string };

function lines(v: FormDataEntryValue | null) {
  return String(v ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "item";

/** Saves the session guide. Row Level Security lets only the course's managers write it. */
export async function saveGuide(_prev: GuideState, form: FormData): Promise<GuideState> {
  const courseId = String(form.get("course_id"));
  const itemIds = form.getAll("item_id").map(String);
  const topicIds = form.getAll("topic_id").map(String);
  const part: GuidePart = {
    rating_items: itemIds.map((id) => ({
      id,
      prompt: String(form.get(`item_prompt_${id}`) ?? "").trim(),
      choices: lines(form.get(`item_choices_${id}`)).map((label) => ({ id: id === "recommend" ? label : slug(label), label })),
    })),
    topics: topicIds
      .filter((id) => form.get(`topic_on_${id}`) === "on")
      .map((id) => ({
        id,
        label: String(form.get(`topic_label_${id}`) ?? "").trim(),
        goal: String(form.get(`topic_goal_${id}`) ?? "").trim(),
        opener: String(form.get(`topic_opener_${id}`) ?? "").trim(),
      })),
  };
  const parsed = guidePartSchema.safeParse(part);
  if (!parsed.success) return { status: "error", message: "Every item needs a prompt and at least two choices, and every topic needs a label, a goal and an opening question." };
  const db = await createUserClient();
  const { data: current } = await db.from("guides").select("version").eq("course_id", courseId).maybeSingle();
  if (!current) return { status: "error", message: "You can't edit this guide." };
  const { data: user } = await db.auth.getUser();
  const { error } = await db
    .from("guides")
    .update({ rating_items: parsed.data.rating_items, topics: parsed.data.topics, version: current.version + 1, updated_by: user.user?.id ?? null, updated_at: new Date().toISOString() })
    .eq("course_id", courseId);
  if (error) return { status: "error", message: "The guide couldn't be saved." };
  revalidatePath("/", "layout");
  return { status: "saved", message: `Saved as version ${current.version + 1}. New interviews use it.` };
}
