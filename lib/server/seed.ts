import { readFileSync } from "node:fs";
import path from "node:path";
import type { AdminClient } from "@/lib/server/supabase-admin";
import { DEFAULT_FOLLOW_UP_GUIDE, DEFAULT_SESSION_GUIDE } from "@/lib/guide";
import type { ThemeTokens } from "@/lib/theme/tokens";
import type { Json } from "@/lib/database.types";

// Everyone and everything here is fictional. Addresses use the reserved .example domain.

type SeedUser = { key: string; name: string; email: string; platformAdmin?: boolean };

export const SEED_USERS = {
  platformAdmin: { key: "platformAdmin", name: "Sam Rivera", email: "sam.rivera@platform.example", platformAdmin: true },
  // Streamspace
  dana: { key: "dana", name: "Dana Whitfield", email: "dana.whitfield@streamspace.example" },
  marcus: { key: "marcus", name: "Marcus Lindqvist", email: "marcus.lindqvist@streamspace.example" },
  priya: { key: "priya", name: "Priya Raman", email: "priya.raman@ime-engineering.example" },
  aisha: { key: "aisha", name: "Aisha Bello", email: "aisha.bello@ime-engineering.example" },
  ben: { key: "ben", name: "Ben Carter", email: "ben.carter@ime-engineering.example" },
  chloe: { key: "chloe", name: "Chloe Nakamura", email: "chloe.nakamura@ime-engineering.example" },
  diego: { key: "diego", name: "Diego Alvarez", email: "diego.alvarez@ime-engineering.example" },
  elena: { key: "elena", name: "Elena Petrova", email: "elena.petrova@ime-engineering.example" },
  farid: { key: "farid", name: "Farid Haddad", email: "farid.haddad@ime-engineering.example" },
  grace: { key: "grace", name: "Grace Liu", email: "grace.liu@ime-engineering.example" },
  hamish: { key: "hamish", name: "Hamish Doyle", email: "hamish.doyle@ime-engineering.example" },
  // Northwind Academy
  owen: { key: "owen", name: "Owen Marsh", email: "owen.marsh@northwind.example" },
  isla: { key: "isla", name: "Isla Brennan", email: "isla.brennan@northwind.example" },
  kofi: { key: "kofi", name: "Kofi Mensah", email: "kofi.mensah@northwind.example" },
  lena: { key: "lena", name: "Lena Vogel", email: "lena.vogel@northwind.example" },
} satisfies Record<string, SeedUser>;

export type SeedUserKey = keyof typeof SEED_USERS;

export const STREAMSPACE_LEARNERS: SeedUserKey[] = ["aisha", "ben", "chloe", "diego", "elena", "farid", "grace", "hamish"];
export const NORTHWIND_LEARNERS: SeedUserKey[] = ["isla", "kofi", "lena"];

export const STREAMSPACE_THEME: ThemeTokens = {
  light: {
    primary: "#1d5fd1",
    accent: "#0b6e6e",
    background: "#f4f7fb",
    surface: "#ffffff",
    text: "#0f1b2d",
    muted: "#4a5a70",
    chart: ["#1d5fd1", "#0b8a8a", "#d0761f", "#7a4fc0", "#c0395a"],
  },
  dark: {
    primary: "#8db6ff",
    accent: "#5fd4c8",
    background: "#0c1320",
    surface: "#141f33",
    text: "#e6edf7",
    muted: "#a3b3ca",
    chart: ["#8db6ff", "#5fd4c8", "#f2a65a", "#b99af0", "#f08aa3"],
  },
  radius: 8,
  heading_font: "Inter",
  body_font: "Inter",
};

export const NORTHWIND_THEME: ThemeTokens = {
  light: {
    primary: "#2e6b3a",
    accent: "#9a4e17",
    background: "#f7f6f1",
    surface: "#ffffff",
    text: "#1c2117",
    muted: "#545b4c",
    chart: ["#2e6b3a", "#c06a2b", "#3f6f9e", "#8c5a9e", "#a3a03a"],
  },
  dark: {
    primary: "#8cc79a",
    accent: "#f0a46b",
    background: "#12150f",
    surface: "#1b1f17",
    text: "#e8ebe2",
    muted: "#a6ad9c",
    chart: ["#8cc79a", "#f0a46b", "#8fb4dc", "#c9a3d8", "#d6d27a"],
  },
  radius: 4,
  heading_font: "Merriweather",
  body_font: "Source Sans 3",
};

export const SESSION_1_BRIEF = {
  objectives: [
    "Rebuild the sample workflow from the rebuild guide on your own project",
    "Pull data out of an uploaded document with Get Document Data",
    "Configure the Core Agent and share results with the Link Generator",
  ],
  topics: ["Get Document Data", "Core Agent", "Link Generator", "Finding your project ID"],
  known_issues: ["Some learners couldn't sign in to the training workspace at the start of the session"],
};

function must<R extends { data: unknown; error: { message: string } | null }>(result: R, what: string): NonNullable<R["data"]> {
  if (result.error || result.data === null) throw new Error(`${what}: ${result.error?.message ?? "no data"}`);
  return result.data as NonNullable<R["data"]>;
}

export type SeedResult = {
  users: Record<SeedUserKey, string>;
  orgs: { streamspace: string; northwind: string };
  courses: { ime: string; northwind: string };
  sessions: { s1: string; s2: string; s3: string; nw1: string };
  counts: { organizations: number; courses: number; sessions: number; users: number };
};

/** Seeds an empty database. `npm run db:reset` runs it after rebuilding the schema. */
export async function seed(db: AdminClient, opts: { now?: Date } = {}): Promise<SeedResult> {
  const now = opts.now ?? new Date();

  const users = {} as Record<SeedUserKey, string>;
  for (const u of Object.values(SEED_USERS) as SeedUser[]) {
    const { data, error } = await db.auth.admin.createUser({
      email: u.email,
      email_confirm: true,
      user_metadata: { full_name: u.name },
      app_metadata: u.platformAdmin ? { platform_admin: true } : {},
    });
    if (error || !data.user) throw new Error(`create user ${u.email}: ${error?.message}`);
    users[u.key as SeedUserKey] = data.user.id;
  }

  const orgRows = must(
    await db.from("organizations").insert([
      { slug: "streamspace", name: "Streamspace" },
      { slug: "northwind", name: "Northwind Academy" },
    ]).select("id, slug"),
    "organizations",
  );
  const streamspace = orgRows.find((o) => o.slug === "streamspace")!.id;
  const northwind = orgRows.find((o) => o.slug === "northwind")!.id;

  // Logos, then the hand-written themes, so both tenants are branded from the start.
  const assets = path.join(process.cwd(), "scripts", "assets");
  for (const [orgId, file] of [[streamspace, "streamspace-logo.svg"], [northwind, "northwind-logo.svg"]] as const) {
    const logoPath = `${orgId}/${file}`;
    const up = await db.storage.from("logos").upload(logoPath, readFileSync(path.join(assets, file)), {
      contentType: "image/svg+xml",
      upsert: true,
    });
    if (up.error) throw new Error(`upload logo: ${up.error.message}`);
    const approvedAt = now.toISOString();
    const theme = must(
      await db.from("themes").insert({
        organization_id: orgId,
        status: "live",
        tokens: (orgId === streamspace ? STREAMSPACE_THEME : NORTHWIND_THEME) as unknown as Json,
        logo_path: logoPath,
        source: "seed",
        approved_at: approvedAt,
      }).select("id").single(),
      "theme",
    );
    must(await db.from("organizations").update({ live_theme_id: theme.id, logo_path: logoPath }).eq("id", orgId).select("id"), "set theme");
  }

  const courseRows = must(
    await db.from("courses").insert([
      {
        organization_id: streamspace,
        slug: "ime-engineering",
        title: "Streamspace platform training: IME Engineering",
        description: "Building, running and publishing workflows on the Streamspace platform.",
      },
      {
        organization_id: northwind,
        slug: "customer-onboarding",
        title: "Customer Onboarding Essentials",
        description: "A short course on welcoming and supporting new customers.",
      },
    ]).select("id, slug"),
    "courses",
  );
  const ime = courseRows.find((c) => c.slug === "ime-engineering")!.id;
  const nwCourse = courseRows.find((c) => c.slug === "customer-onboarding")!.id;

  const name = (k: SeedUserKey) => SEED_USERS[k].name;
  const email = (k: SeedUserKey) => SEED_USERS[k].email;
  must(
    await db.from("memberships").insert([
      { organization_id: streamspace, user_id: users.dana, role: "org_admin", course_id: null, display_name: name("dana"), email: email("dana") },
      { organization_id: streamspace, user_id: users.dana, role: "instructor", course_id: ime, display_name: name("dana"), email: email("dana") },
      { organization_id: streamspace, user_id: users.marcus, role: "instructor", course_id: ime, display_name: name("marcus"), email: email("marcus") },
      { organization_id: streamspace, user_id: users.priya, role: "sponsor", course_id: ime, display_name: name("priya"), email: email("priya") },
      { organization_id: northwind, user_id: users.owen, role: "org_admin", course_id: null, display_name: name("owen"), email: email("owen") },
      { organization_id: northwind, user_id: users.owen, role: "instructor", course_id: nwCourse, display_name: name("owen"), email: email("owen") },
    ]).select("id"),
    "memberships",
  );

  must(
    await db.from("enrollments").insert([
      ...STREAMSPACE_LEARNERS.map((k) => ({ organization_id: streamspace, course_id: ime, user_id: users[k], display_name: name(k), email: email(k) })),
      ...NORTHWIND_LEARNERS.map((k) => ({ organization_id: northwind, course_id: nwCourse, user_id: users[k], display_name: name(k), email: email(k) })),
    ]).select("id"),
    "enrollments",
  );

  must(
    await db.from("guides").insert([
      { organization_id: streamspace, course_id: ime, rating_items: DEFAULT_SESSION_GUIDE.rating_items, topics: DEFAULT_SESSION_GUIDE.topics, follow_up: DEFAULT_FOLLOW_UP_GUIDE },
      { organization_id: northwind, course_id: nwCourse, rating_items: DEFAULT_SESSION_GUIDE.rating_items, topics: DEFAULT_SESSION_GUIDE.topics, follow_up: DEFAULT_FOLLOW_UP_GUIDE },
    ]).select("id"),
    "guides",
  );

  const day = 24 * 60 * 60 * 1000;
  const opened = new Date(now.getTime() - day);
  const closes = new Date(opened.getTime() + 7 * day);
  const sessionRows = must(
    await db.from("sessions").insert([
      {
        organization_id: streamspace,
        course_id: ime,
        number: 1,
        title: "Rebuilding your first workflow",
        date: "2026-11-13",
        objectives: "Rebuild the sample workflow from the rebuild guide: pull document data, configure the Core Agent and share results with the Link Generator.",
        state: "open",
        brief: SESSION_1_BRIEF,
        brief_approved_at: opened.toISOString(),
        brief_approved_by: users.dana,
        opened_at: opened.toISOString(),
        closes_at: closes.toISOString(),
      },
      {
        organization_id: streamspace,
        course_id: ime,
        number: 2,
        title: "Agents and automations",
        date: "2026-11-20",
        objectives: "Chain agents together and trigger workflows automatically.",
        state: "scheduled",
      },
      {
        organization_id: streamspace,
        course_id: ime,
        number: 3,
        title: "Publishing and versioning workflows",
        date: "2026-11-27",
        objectives: "Publish a workflow, manage versions and roll back safely.",
        state: "draft",
      },
      {
        organization_id: northwind,
        course_id: nwCourse,
        number: 1,
        title: "Welcome and first steps",
        date: "2026-11-10",
        objectives: "Greet a new customer, set up their account and agree the first milestone.",
        state: "open",
        opened_at: opened.toISOString(),
        closes_at: closes.toISOString(),
      },
    ]).select("id, number, course_id"),
    "sessions",
  );
  const sid = (course: string, n: number) => sessionRows.find((s) => s.course_id === course && s.number === n)!.id;

  return {
    users,
    orgs: { streamspace, northwind },
    courses: { ime, northwind: nwCourse },
    sessions: { s1: sid(ime, 1), s2: sid(ime, 2), s3: sid(ime, 3), nw1: sid(nwCourse, 1) },
    counts: { organizations: orgRows.length, courses: courseRows.length, sessions: sessionRows.length, users: Object.keys(users).length },
  };
}
