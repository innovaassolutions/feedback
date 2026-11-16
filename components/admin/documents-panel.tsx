"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { browserClient } from "@/lib/supabase/browser";
import { DOCUMENT_ACCEPT, MAX_DOCUMENT_BYTES, documentStoragePath } from "@/lib/files";
import { Badge, Button, Field, Notice, inputClass } from "@/components/ui";
import { EditForm } from "@/components/admin/edit-forms";

export type AdminDocument = {
  id: string;
  title: string;
  audience: "learners" | "agents_only";
  status: "processing" | "ready" | "failed";
  error: string | null;
  file_name: string;
  size_bytes: number;
};

const STATUS_LABEL = { processing: "Reading…", ready: "Ready", failed: "Couldn't read" } as const;
const AUDIENCE_LABEL = { learners: "Learners and agents", agents_only: "Agents only" } as const;

export function DocumentsPanel({
  organizationId,
  courseId,
  sessionId,
  documents,
  waitingForBrief = false,
}: {
  organizationId: string;
  courseId: string;
  sessionId: string;
  documents: AdminDocument[];
  waitingForBrief?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Refresh while a document is being read, and after that until the brief draft arrives.
  const processing = documents.some((d) => d.status === "processing") || waitingForBrief;

  useEffect(() => {
    if (!processing) return;
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [processing, router]);

  // The file goes straight to storage from the browser, so large files don't pass through the
  // app's request limit; the app then checks the stored file and records it.
  async function upload(form: FormData) {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return setError("Choose a file to upload.");
    if (file.size > MAX_DOCUMENT_BYTES) return setError("Files can be up to 25 MB.");
    setBusy(true);
    setError(null);
    const documentId = crypto.randomUUID();
    const path = documentStoragePath({ organizationId, courseId, sessionId }, documentId, file.name);
    const stored = await browserClient().storage.from("documents").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (stored.error) {
      setBusy(false);
      return setError("The file couldn't be uploaded. Check your connection and try again.");
    }
    const res = await api("POST", `/api/sessions/${sessionId}/documents/uploaded`, {
      document_id: documentId,
      file_name: file.name,
      title: String(form.get("title") ?? "").trim() || file.name.replace(/\.[^.]+$/, ""),
      audience: String(form.get("audience") ?? "agents_only"),
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    (document.getElementById("upload-form") as HTMLFormElement | null)?.reset();
    router.refresh();
  }

  async function remove(id: string) {
    const res = await api("DELETE", `/api/documents/${id}`);
    if (!res.ok) return setError(res.error);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border" data-testid="document-list">
        {documents.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="font-medium">{d.title}</p>
              <p className="text-sm text-muted">
                {d.file_name} · {(d.size_bytes / 1024).toFixed(0)} KB · {AUDIENCE_LABEL[d.audience]}
              </p>
              {d.status === "failed" && d.error ? <p className="mt-1 text-sm text-danger" role="alert">{d.error}</p> : null}
              <div className="mt-2">
                <EditForm
                  toggle="Edit"
                  path={`/api/documents/${d.id}`}
                  fields={[
                    { name: "title", label: "Title", value: d.title },
                    {
                      name: "audience",
                      label: "Who can see it",
                      type: "select",
                      value: d.audience,
                      options: [
                        { value: "learners", label: AUDIENCE_LABEL.learners },
                        { value: "agents_only", label: AUDIENCE_LABEL.agents_only },
                      ],
                    },
                  ]}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={d.status === "ready" ? "success" : d.status === "failed" ? "danger" : "neutral"}>{STATUS_LABEL[d.status]}</Badge>
              <Button variant="danger" onClick={() => remove(d.id)} aria-label={`Remove ${d.title}`}>Remove</Button>
            </div>
          </li>
        ))}
        {documents.length === 0 ? <li className="py-3 text-muted">No documents yet.</li> : null}
      </ul>
      <form id="upload-form" action={upload} className="grid gap-3 sm:grid-cols-3">
        <Field label="File" hint="PDF, Word, Markdown, text, or a VTT or SRT transcript, up to 25 MB">
          <input name="file" type="file" required accept={DOCUMENT_ACCEPT} className={inputClass} />
        </Field>
        <Field label="Title">
          <input name="title" className={inputClass} placeholder="Defaults to the file name" />
        </Field>
        <Field label="Who can see it">
          <select name="audience" defaultValue="learners" className={inputClass}>
            <option value="learners">Learners and agents</option>
            <option value="agents_only">Agents only</option>
          </select>
        </Field>
        {error ? <div className="sm:col-span-3"><Notice tone="danger">{error}</Notice></div> : null}
        <div>
          <Button type="submit" disabled={busy}>{busy ? "Uploading…" : "Upload document"}</Button>
        </div>
      </form>
    </div>
  );
}
