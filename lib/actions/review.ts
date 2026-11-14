"use server";
import { revalidatePath } from "next/cache";
import { requestCtx } from "@/lib/server/route";
import { deleteMyData, markInsightAccuracy, retryAnalysis } from "@/lib/server/ops/quality";
import { HttpError } from "@/lib/server/http";

export async function markAccuracy(ref: string, accuracy: "accurate" | "not_accurate") {
  try {
    await markInsightAccuracy(await requestCtx(), ref, accuracy);
    return { ok: true as const };
  } catch (err) {
    if (err instanceof HttpError) return { ok: false as const, error: err.message };
    throw err;
  }
}

export async function analyseAgain(ref: string) {
  try {
    await retryAnalysis(await requestCtx(), ref);
    revalidatePath("/", "layout");
    return { ok: true as const };
  } catch (err) {
    if (err instanceof HttpError) return { ok: false as const, error: err.message };
    throw err;
  }
}

export async function removeMyData(courseId: string) {
  const result = await deleteMyData(await requestCtx(), courseId);
  revalidatePath("/", "layout");
  return result;
}
