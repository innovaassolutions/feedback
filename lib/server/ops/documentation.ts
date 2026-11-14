import type { Ctx } from "@/lib/server/ctx";
import { requireUser } from "@/lib/server/ctx";
import type { OperationInput } from "@/lib/operations";
import { forbidden, notFound } from "@/lib/server/http";
import { enqueue } from "@/lib/server/jobs/queue";
import { kickJobs } from "./common";

/** Reads a product documentation site into the organization's sources. Organization admins only. */
export async function addDocumentationSource(ctx: Ctx, input: OperationInput<"add_documentation_source">) {
  requireUser(ctx);
  const { data: org } = await ctx.db.from("organizations").select("id").eq("id", input.organization_id).maybeSingle();
  if (!org) throw notFound("Organization not found");
  const { data: admin } = await ctx.db.rpc("is_org_admin", { org: org.id });
  if (!admin) throw forbidden("Only organization admins can add documentation");
  const url = new URL(input.url);
  url.hash = "";
  const { data, error } = await ctx.db
    .from("documentation_sources")
    .upsert({ organization_id: org.id, url: url.toString(), status: "processing", created_by: ctx.user!.id }, { onConflict: "organization_id,url" })
    .select("id, url, status")
    .single();
  if (error) throw new Error(`documentation source: ${error.message}`);
  await enqueue(ctx.admin, { kind: "read_documentation", payload: { source_id: data.id }, organizationId: org.id });
  kickJobs(ctx);
  return { source: data };
}
