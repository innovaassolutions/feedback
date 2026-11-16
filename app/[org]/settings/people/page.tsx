import { getCurrentUser, isPlatformAdmin } from "@/lib/auth";
import { requireBranding } from "@/lib/branding";
import { createUserClient } from "@/lib/supabase/server";
import { Card, PageTitle } from "@/components/ui";
import { AddStaffForm, RemoveButton } from "@/components/admin/people-forms";
import { EditForm } from "@/components/admin/edit-forms";

type Person = { id: string; user_id: string; display_name: string; email: string };

function PeopleList({ people, role, selfId, canRemoveSelf, empty }: { people: Person[]; role: string; selfId: string; canRemoveSelf: boolean; empty: string }) {
  if (!people.length) return <p className="py-2 text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {people.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span>
            {p.display_name} <span className="text-sm text-muted">{p.email}</span>
          </span>
          <span className="flex flex-wrap items-start gap-3">
            <EditForm toggle="Edit name" path={`/api/staff/${p.id}`} fields={[{ name: "display_name", label: "Name", value: p.display_name }]} />
            {p.user_id === selfId && !canRemoveSelf ? (
              <span className="text-sm text-muted">You</span>
            ) : (
              <RemoveButton path={`/api/staff/${p.id}`} what={`${p.display_name} as ${role}`} />
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Organization admins, and each course's instructors and sponsors. Learners are on each course's roster. */
export default async function PeoplePage({ params }: PageProps<"/[org]/settings/people">) {
  const { org } = await params;
  const branding = await requireBranding(org);
  const user = (await getCurrentUser())!;
  const db = await createUserClient();
  const [{ data: memberships }, { data: courses }] = await Promise.all([
    db.from("memberships").select("id, user_id, role, course_id, display_name, email").eq("organization_id", branding.id).order("display_name"),
    db.from("courses").select("id, title").eq("organization_id", branding.id).order("title"),
  ]);
  const all = memberships ?? [];
  const platformAdmin = isPlatformAdmin(user);
  return (
    <>
      <PageTitle title="People" subtitle={`Who can run and view ${branding.name}'s courses. Learners are added on each course's Roster page.`} />
      <Card className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">Add a person</h2>
        <AddStaffForm organizationId={branding.id} courses={courses ?? []} />
      </Card>
      <Card className="mb-6" data-testid="org-admins">
        <h2 className="mb-1 text-lg font-semibold">Organization admins</h2>
        <PeopleList
          people={all.filter((m) => m.role === "org_admin")}
          role="organization admin"
          selfId={user.id}
          canRemoveSelf={platformAdmin}
          empty="None yet. Platform admins can manage every organization."
        />
      </Card>
      {(courses ?? []).map((c) => (
        <Card key={c.id} className="mb-6" data-testid={`course-people-${c.id}`}>
          <h2 className="mb-3 text-lg font-semibold">{c.title}</h2>
          <h3 className="text-sm font-medium">Instructors</h3>
          <PeopleList people={all.filter((m) => m.course_id === c.id && m.role === "instructor")} role={`instructor on ${c.title}`} selfId={user.id} canRemoveSelf empty="No instructors yet." />
          <h3 className="mt-4 text-sm font-medium">Sponsors</h3>
          <PeopleList people={all.filter((m) => m.course_id === c.id && m.role === "sponsor")} role={`sponsor on ${c.title}`} selfId={user.id} canRemoveSelf empty="No sponsors yet." />
        </Card>
      ))}
    </>
  );
}
