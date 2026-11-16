import type { AdminClient } from "@/lib/server/supabase-admin";
import type { EmailBrand } from "./brand";
import type { EmailBlock, EmailContent } from "./layout";

// The first email a person gets is an invitation, not a bare sign-in link: it says who invited them,
// to what, what they can do there, and how signing in works.

export type Invitation = { subject: string; content: EmailContent };

type Who = { id: string; platformAdmin: boolean };

const howToSignIn = (signInUrl: string) =>
  `There's no password. Whenever you want to sign in, enter this email address at ${signInUrl} and we'll email you a link and a code like these.`;

/** The 6-digit code as a block, for someone who reads this email on another device. */
export const codeLines = (code: string | null): EmailBlock[] =>
  code ? [{ code: `${code.slice(0, 3)} ${code.slice(3)}`, label: "Reading this on another device? On the sign-in page there, enter this code:" }] : [];

/** What the person was invited as, from the page their link opens and the roles they hold there. */
export async function invitationFor(
  admin: AdminClient,
  who: Who,
  brand: EmailBrand,
  nextPath: string,
  link: string,
  appUrl: string,
  code: string | null = null,
): Promise<Invitation> {
  const [pathOrg, pathCourse] = nextPath.split(/[?#]/)[0].split("/").filter(Boolean);
  const orgSlug = brand.slug ?? "";
  // A course only counts when the link opens one of this organization's courses.
  const courseSlug = pathOrg === orgSlug ? pathCourse : undefined;
  const note = "This link and code work once and expire in 24 hours.";

  if (!brand.organization) {
    const signInUrl = `${appUrl}/sign-in`;
    return who.platformAdmin
      ? {
          subject: "You're now a platform admin of the Course Feedback Platform",
          content: {
            preview: "You can create organizations and manage their courses and people.",
            heading: "Welcome to the Course Feedback Platform",
            body: ["You've been made a platform admin. You can create organizations and manage their courses and people.", howToSignIn(signInUrl), ...codeLines(code)],
            button: { label: "Sign in", url: link },
            note: `${note} If it has expired, get a new one at ${signInUrl}.`,
          },
        }
      : {
          subject: "You're invited to the Course Feedback Platform",
          content: {
            preview: "Sign in to see your courses.",
            heading: "You're invited",
            body: ["You've been given access to the Course Feedback Platform.", howToSignIn(signInUrl), ...codeLines(code)],
            button: { label: "Sign in", url: link },
            note: `${note} If it has expired, get a new one at ${signInUrl}.`,
          },
        };
  }

  const signInUrl = `${appUrl}/${orgSlug}/sign-in`;
  const { data: org } = await admin.from("organizations").select("id").eq("slug", orgSlug).maybeSingle();
  const { data: course } =
    org && courseSlug ? await admin.from("courses").select("id, title").eq("organization_id", org.id).eq("slug", courseSlug).maybeSingle() : { data: null };
  const [{ data: roles }, { data: enrolled }] = await Promise.all([
    org ? admin.from("memberships").select("role, course_id").eq("organization_id", org.id).eq("user_id", who.id) : Promise.resolve({ data: [] }),
    course ? admin.from("enrollments").select("id").eq("course_id", course.id).eq("user_id", who.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const has = (role: string, courseId: string | null) => (roles ?? []).some((r) => r.role === role && r.course_id === courseId);

  let subject = `You're invited to ${brand.name}`;
  let heading = "You're invited";
  let lines = [`${brand.name} has given you access to its course feedback.`];
  if (course && has("instructor", course.id)) {
    subject = `You've been added to ${course.title} as an instructor`;
    lines = [`${brand.name} has added you as an instructor on ${course.title}.`, "You can run its sessions, see what learners said and answer their questions."];
  } else if (course && has("sponsor", course.id)) {
    subject = `You can now view the results of ${course.title}`;
    heading = "You have access to the results";
    lines = [`${brand.name} has given you access to the results of ${course.title}.`, "You'll see the dashboard, its themes and the printed report. Nothing is shown from a single learner."];
  } else if (course && enrolled) {
    subject = `You're invited to give feedback on ${course.title}`;
    lines = [
      `${brand.name} has invited you to give feedback on ${course.title}.`,
      "After each session, a short interview of about five minutes asks what worked for you and what didn't. You can type or talk, and you choose how anonymous to be.",
    ];
  } else if (!courseSlug && has("org_admin", null)) {
    subject = `You're now an admin of ${brand.name}'s course feedback`;
    lines = [`${brand.name} has made you an admin of its course feedback.`, "You can manage its branding, courses and people, set up every course and see its results."];
  }

  return {
    subject,
    content: {
      preview: lines[0],
      heading,
      body: [...lines, howToSignIn(signInUrl), ...codeLines(code)],
      button: { label: "Sign in", url: link },
      note: `${note} If it has expired, get a new one at ${signInUrl}.`,
    },
  };
}
