import type { Ctx } from "@/lib/server/ctx";
import { requireUser } from "@/lib/server/ctx";
import type { OperationInput } from "@/lib/operations";
import { notFound, unprocessable } from "@/lib/server/http";
import { DOCUMENT_MIME, MAX_DOCUMENT_BYTES, detectDocumentKind, safeFileName } from "@/lib/files";
import { enqueue } from "@/lib/server/jobs/queue";
import { kickJobs, requireManage, sessionForUser } from "./common";

/** Validates and stores a document, then queues it for the Librarian to read. */
export async function addDocument(ctx: Ctx, input: OperationInput<"add_document">) {
  const session = await sessionForUser(ctx, input.session_id);
  await requireManage(ctx, session.course_id);
  const file = input.file;
  // Checked before anything is stored, so a rejected file leaves nothing behind.
  if (file.size > MAX_DOCUMENT_BYTES) throw unprocessable("Files can be up to 25 MB");
  if (file.size === 0) throw unprocessable("The file is empty");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = detectDocumentKind(file.name, bytes);
  if (!kind) throw unprocessable("Upload a PDF, Word (.docx), Markdown, plain text or VTT transcript file");

  const documentId = crypto.randomUUID();
  const fileName = safeFileName(file.name);
  const storagePath = `${session.organization_id}/${session.course_id}/${session.id}/${documentId}/${fileName}`;
  const upload = await ctx.db.storage.from("documents").upload(storagePath, bytes, { contentType: DOCUMENT_MIME[kind], upsert: false });
  if (upload.error) throw new Error(`store document: ${upload.error.message}`);

  const { data, error } = await ctx.db
    .from("documents")
    .insert({
      id: documentId,
      organization_id: session.organization_id,
      course_id: session.course_id,
      session_id: session.id,
      title: input.title,
      audience: input.audience,
      storage_path: storagePath,
      file_name: fileName,
      mime_type: DOCUMENT_MIME[kind],
      size_bytes: file.size,
      status: "processing",
      created_by: ctx.user!.id,
    })
    .select("id, title, audience, status, file_name, size_bytes")
    .single();
  if (error) {
    await ctx.db.storage.from("documents").remove([storagePath]);
    throw new Error(`record document: ${error.message}`);
  }
  await enqueue(ctx.admin, { kind: "read_document", payload: { document_id: documentId }, organizationId: session.organization_id });
  kickJobs(ctx);
  return { document: data };
}

export async function removeDocument(ctx: Ctx, input: OperationInput<"remove_document">) {
  requireUser(ctx);
  const { data: doc } = await ctx.db.from("documents").select("id, course_id, storage_path").eq("id", input.document_id).maybeSingle();
  if (!doc) throw notFound("Document not found");
  await requireManage(ctx, doc.course_id);
  await ctx.db.storage.from("documents").remove([doc.storage_path]);
  // Chunks go with the row (on delete cascade).
  const { error } = await ctx.db.from("documents").delete().eq("id", doc.id);
  if (error) throw new Error(`remove document: ${error.message}`);
  return { removed: doc.id };
}

/** A short-lived signed URL for a document the user may see. Anything else is 404. */
export async function documentDownloadUrl(ctx: Ctx, documentId: string): Promise<string> {
  requireUser(ctx);
  const { data: doc } = await ctx.db.from("documents").select("id, storage_path, file_name").eq("id", documentId).maybeSingle();
  if (!doc) throw notFound("Document not found");
  const { data, error } = await ctx.db.storage.from("documents").createSignedUrl(doc.storage_path, 60, { download: doc.file_name });
  if (error || !data) throw notFound("Document not found");
  return data.signedUrl;
}
