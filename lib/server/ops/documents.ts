import type { Ctx } from "@/lib/server/ctx";
import { requireUser } from "@/lib/server/ctx";
import type { OperationInput } from "@/lib/operations";
import { conflict, notFound, unprocessable } from "@/lib/server/http";
import { DOCUMENT_MIME, MAX_DOCUMENT_BYTES, detectDocumentKind, documentStoragePath, safeFileName, type DocumentKind } from "@/lib/files";
import { enqueue } from "@/lib/server/jobs/queue";
import { kickJobs, requireManage, sessionForUser } from "./common";

const UNSUPPORTED = "Upload a PDF, Word (.docx), Markdown or plain text file, or a VTT or SRT transcript";

/** The size and type checks every document passes, from its bytes rather than its name alone. */
function checkFile(fileName: string, bytes: Uint8Array): DocumentKind {
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) throw unprocessable("Files can be up to 25 MB");
  if (bytes.byteLength === 0) throw unprocessable("The file is empty");
  const kind = detectDocumentKind(fileName, bytes);
  if (!kind) throw unprocessable(UNSUPPORTED);
  return kind;
}

type SessionRow = Awaited<ReturnType<typeof sessionForUser>>;

/** Records a stored document and queues it for the Librarian to read. */
async function recordDocument(
  ctx: Ctx,
  session: SessionRow,
  doc: { id: string; fileName: string; kind: DocumentKind; size: number; storagePath: string; title: string; audience: "learners" | "agents_only" },
) {
  const { data, error } = await ctx.db
    .from("documents")
    .insert({
      id: doc.id,
      organization_id: session.organization_id,
      course_id: session.course_id,
      session_id: session.id,
      title: doc.title,
      audience: doc.audience,
      storage_path: doc.storagePath,
      file_name: doc.fileName,
      mime_type: DOCUMENT_MIME[doc.kind],
      size_bytes: doc.size,
      status: "processing",
      created_by: ctx.user!.id,
    })
    .select("id, title, audience, status, file_name, size_bytes")
    .single();
  if (error) {
    await ctx.admin.storage.from("documents").remove([doc.storagePath]);
    if (error.code === "23505") throw conflict("That upload was already added");
    throw new Error(`record document: ${error.message}`);
  }
  await enqueue(ctx.admin, { kind: "read_document", payload: { document_id: doc.id }, organizationId: session.organization_id });
  kickJobs(ctx);
  return { document: data };
}

const idsOf = (session: SessionRow) => ({ organizationId: session.organization_id, courseId: session.course_id, sessionId: session.id });

/** Validates and stores a document sent in the request, then queues it for the Librarian to read. */
export async function addDocument(ctx: Ctx, input: OperationInput<"add_document">) {
  const session = await sessionForUser(ctx, input.session_id);
  await requireManage(ctx, session.course_id);
  const file = input.file;
  // Checked before anything is stored, so a rejected file leaves nothing behind.
  if (file.size > MAX_DOCUMENT_BYTES) throw unprocessable("Files can be up to 25 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = checkFile(file.name, bytes);

  const documentId = crypto.randomUUID();
  const fileName = safeFileName(file.name);
  const storagePath = documentStoragePath(idsOf(session), documentId, fileName);
  const upload = await ctx.db.storage.from("documents").upload(storagePath, bytes, { contentType: DOCUMENT_MIME[kind], upsert: false });
  if (upload.error) throw new Error(`store document: ${upload.error.message}`);
  return recordDocument(ctx, session, { id: documentId, fileName, kind, size: bytes.byteLength, storagePath, title: input.title, audience: input.audience });
}

/**
 * The browser stores a document itself, straight into the session's folder (the storage rules let
 * only the course's managers write there), so a file larger than the hosting platform's request
 * limit still arrives. This checks the stored file from its bytes and records it. A file that fails
 * the checks is deleted. The path is built here from the session and the document id, never taken
 * from the browser.
 */
export async function registerDocument(ctx: Ctx, input: OperationInput<"register_document">) {
  const session = await sessionForUser(ctx, input.session_id);
  await requireManage(ctx, session.course_id);
  const fileName = safeFileName(input.file_name);
  const storagePath = documentStoragePath(idsOf(session), input.document_id, fileName);
  const { data: blob, error } = await ctx.admin.storage.from("documents").download(storagePath);
  if (error || !blob) throw notFound("The uploaded file wasn't found. Upload it again.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let kind: DocumentKind;
  try {
    kind = checkFile(fileName, bytes);
  } catch (err) {
    await ctx.admin.storage.from("documents").remove([storagePath]);
    throw err;
  }
  return recordDocument(ctx, session, { id: input.document_id, fileName, kind, size: bytes.byteLength, storagePath, title: input.title, audience: input.audience });
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
