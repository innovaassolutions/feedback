import Link from "next/link";
import { createUserClient } from "@/lib/supabase/server";
import { createOrganization } from "@/lib/actions/organizations";
import { Card, Field, PageTitle, inputClass } from "@/components/ui";
import { ActionForm } from "@/components/forms/action-form";
import { NameAndAddress } from "@/components/forms/name-and-address";
import { publicEnv } from "@/lib/env";
import { requestCtx } from "@/lib/server/route";
import { listPlatformAdmins } from "@/lib/server/ops/people";
import { AddPlatformAdminForm, RemoveButton } from "@/components/admin/people-forms";

export default async function PlatformPage() {
  const db = await createUserClient();
  const { data: orgs } = await db.from("organizations").select("id, slug, name, live_theme_id").order("name");
  const ctx = await requestCtx();
  const admins = await listPlatformAdmins(ctx);
  return (
    <>
      <PageTitle title="Organizations" />
      <Card className="mb-6">
        <ul className="divide-y divide-border" data-testid="organizations">
          {(orgs ?? []).map((o) => (
            <li key={o.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span>{o.name} <span className="text-sm text-muted">/{o.slug}</span></span>
              <span className="flex gap-4 text-sm">
                <Link href={`/${o.slug}/settings/brand`}>Branding</Link>
                <Link href={`/${o.slug}/settings/courses`}>Courses</Link>
                <Link href={`/${o.slug}/settings/people`}>People</Link>
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-3 text-lg font-semibold">New organization</h2>
        <ActionForm action={createOrganization} submit="Create organization">
          <NameAndAddress
            nameLabel="Organization name"
            nameField="name"
            base={`${new URL(publicEnv.appUrl).host}/`}
            placeholder="acme"
            help="A short name for the organization's pages on this platform, not its own website. Lowercase letters, numbers and hyphens. It can't be changed later, because links, emails and QR codes use it."
          />
          <Field label="Logo" hint="PNG or SVG, up to 2 MB"><input name="logo" type="file" accept=".png,.svg" required className={inputClass} /></Field>
        </ActionForm>
      </Card>
      <Card className="mt-6" data-testid="platform-admins">
        <h2 className="mb-1 text-lg font-semibold">Platform admins</h2>
        <p className="mb-3 text-sm text-muted">
          Platform admins create organizations and can manage every organization, its courses and its people. Add organization admins, instructors and sponsors on each organization&apos;s People page instead.
        </p>
        <ul className="mb-4 divide-y divide-border">
          {admins.map((a) => (
            <li key={a.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {a.name || a.email} {a.name ? <span className="text-sm text-muted">{a.email}</span> : null}
                {a.last_sign_in_at ? null : <span className="ml-2 text-sm text-muted">· hasn&apos;t signed in yet</span>}
              </span>
              {a.user_id === ctx.user?.id ? <span className="text-sm text-muted">You</span> : <RemoveButton path={`/api/platform/admins/${a.user_id}`} what={`${a.name || a.email} as a platform admin`} />}
            </li>
          ))}
        </ul>
        <AddPlatformAdminForm />
      </Card>
    </>
  );
}
