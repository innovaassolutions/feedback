import { NextResponse } from "next/server";
import { z } from "zod";
import { json, requestCtx } from "@/lib/server/route";
import { documentDownloadUrl } from "@/lib/server/ops/documents";
import { HttpError } from "@/lib/server/http";

/** Redirects to a short-lived signed URL. A document the user can't see is 404. */
export async function GET(_req: Request, { params }: { params: Promise<{ document_id: string }> }) {
  const { document_id } = await params;
  if (!z.uuid().safeParse(document_id).success) return json(404, { error: "Document not found" });
  try {
    const url = await documentDownloadUrl(await requestCtx(), document_id);
    return NextResponse.redirect(url, 302);
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { error: err.message });
    return json(500, { error: "Something went wrong" });
  }
}
