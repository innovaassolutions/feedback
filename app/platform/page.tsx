import Link from "next/link";
import { createUserClient } from "@/lib/supabase/server";
import { createOrganization } from "@/lib/actions/organizations";
import { Card, Field, PageTitle, inputClass } from "@/components/ui";
import { ActionForm } from "@/components/forms/action-form";

export default async function PlatformPage() {
  const db = await createUserClient();
  const { data: orgs } = await db.from("organizations").select("id, slug, name, live_theme_id").order("name");
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
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-3 text-lg font-semibold">New organization</h2>
        <ActionForm action={createOrganization} submit="Create organization">
          <Field label="Name"><input name="name" required className={inputClass} /></Field>
          <Field label="Address" hint="The path its pages live under, such as /acme"><input name="slug" required className={inputClass} /></Field>
          <Field label="Logo" hint="PNG or SVG, up to 2 MB"><input name="logo" type="file" accept=".png,.svg" required className={inputClass} /></Field>
        </ActionForm>
      </Card>
    </>
  );
}
