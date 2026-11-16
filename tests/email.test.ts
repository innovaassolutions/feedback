import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { Email } from "@/lib/server/email";
import { handleSendEmailHook, signInLink, verifyHookSignature } from "@/lib/server/mail/auth-hook";
import { emailLogoBySlug, PLATFORM_BRAND, type EmailBrand } from "@/lib/server/mail/brand";
import { renderEmail } from "@/lib/server/mail/layout";
import { notifyBlocker } from "@/lib/server/notify";
import { SEED_USERS, STREAMSPACE_THEME } from "@/lib/server/seed";
import { derived, themeTokensSchema, type ThemeTokens } from "@/lib/theme/tokens";
import { admin, seeded, sql, userId } from "./support/db";

const SECRET = `v1,whsec_${Buffer.from("a-secret-for-these-tests-only-0123456789").toString("base64")}`;
const APP = "http://localhost:3100";

function signed(body: string, secret = SECRET, at = Math.floor(Date.now() / 1000), id = "msg_test") {
  const key = Buffer.from(secret.replace("v1,whsec_", ""), "base64");
  const signature = createHmac("sha256", key).update(`${id}.${at}.${body}`).digest("base64");
  return new Headers({ "webhook-id": id, "webhook-timestamp": String(at), "webhook-signature": `v1,${signature}` });
}

function hookRequest(payload: unknown, headers?: Headers) {
  const body = JSON.stringify(payload);
  return new Request(`${APP}/api/auth/send-email`, { method: "POST", body, headers: headers ?? signed(body) });
}

function payload(user: { id: string; email: string; platformAdmin?: boolean }, next: string, type = "magiclink") {
  return {
    user: { id: user.id, email: user.email, app_metadata: user.platformAdmin ? { platform_admin: true } : {} },
    email_data: {
      token: "123456",
      token_hash: "abc123hash",
      redirect_to: `${APP}/auth/confirm?next=${encodeURIComponent(next)}`,
      email_action_type: type,
      site_url: APP,
    },
  };
}

/** Every hex color a theme allows: its tokens and the colors the code derives from them. */
function themeColors(tokens: ThemeTokens): Set<string> {
  const out = new Set<string>();
  for (const mode of ["light", "dark"] as const) {
    const t = tokens[mode];
    for (const v of [t.primary, t.accent, t.background, t.surface, t.text, t.muted, ...t.chart]) out.add(v.toLowerCase());
    for (const v of Object.values(derived(t, mode))) out.add(v.toLowerCase());
  }
  return out;
}

async function liveTokens(slug: string): Promise<ThemeTokens> {
  const { data } = await admin().rpc("get_branding", { p_slug: slug });
  return themeTokensSchema.parse((data as { tokens: unknown }).tokens);
}

describe("email layout", () => {
  const brand: EmailBrand = {
    name: "Smith & Jones <Training>",
    tokens: STREAMSPACE_THEME,
    logo: { url: "https://example.test/api/email-logo/x.png?v=1", width: 150, height: 40 },
    organization: true,
    slug: "smith-jones",
  };
  const content = {
    preview: "Preview line",
    heading: "A heading",
    body: ["First <b>paragraph</b>", { quote: "Quoted\nwords" }],
    button: { label: "Go", url: "https://example.test/a?b=1&c=2" },
    note: "Small print",
  };

  it("takes every color from the theme, in light and dark", () => {
    const { html } = renderEmail(brand, content);
    const allowed = themeColors(STREAMSPACE_THEME);
    const used = new Set((html.match(/#[0-9a-f]{6}\b/gi) ?? []).map((c) => c.toLowerCase()));
    expect([...used].filter((c) => !allowed.has(c))).toEqual([]);
    const light = STREAMSPACE_THEME.light;
    expect(html).toContain(`class="e-head" style="background-color:${light.primary}`);
    expect(html).toContain(`color:${derived(light, "light").on_primary};text-decoration:none`);
    expect(html).toContain(`.e-button { background-color: ${STREAMSPACE_THEME.dark.primary} !important;`);
    expect(html).toContain(`border-radius:${STREAMSPACE_THEME.radius}px;`);
  });

  it("escapes what it's given and shows the logo at its size", () => {
    const { html, text } = renderEmail(brand, content);
    expect(html).not.toContain("<b>paragraph</b>");
    expect(html).toContain("First &lt;b&gt;paragraph&lt;/b&gt;");
    expect(html).toContain('alt="Smith &amp; Jones &lt;Training&gt;" width="150" height="40"');
    expect(html).toContain('href="https://example.test/a?b=1&amp;c=2"');
    expect(html).toContain("Quoted<br>words");
    expect(text).toBe("First <b>paragraph</b>\n\nQuoted\nwords\n\nhttps://example.test/a?b=1&c=2\n\nSmall print\n\n— Smith & Jones <Training>");
  });

  it("shows the name when there is no logo, and the platform's look when no organization applies", () => {
    const { html } = renderEmail(PLATFORM_BRAND, content);
    expect(html).not.toContain("<img");
    expect(html).toContain(">Course Feedback Platform</span>");
    expect(html).toContain(`background-color:${PLATFORM_BRAND.tokens.light.primary}`);
  });
});

describe("the send-email hook's signature", () => {
  const body = JSON.stringify({ hello: "world" });

  it("accepts Supabase's signature and refuses anything else", () => {
    expect(verifyHookSignature(body, signed(body), SECRET)).toBe(true);
    expect(verifyHookSignature(`${body} `, signed(body), SECRET)).toBe(false);
    const other = `v1,whsec_${Buffer.from("some-other-secret-entirely-0123456789").toString("base64")}`;
    expect(verifyHookSignature(body, signed(body, other), SECRET)).toBe(false);
    expect(verifyHookSignature(body, signed(body, SECRET, Math.floor(Date.now() / 1000) - 600), SECRET)).toBe(false);
    expect(verifyHookSignature(body, new Headers(), SECRET)).toBe(false);
  });

  it("accepts a list of signatures when one matches", () => {
    const headers = signed(body);
    headers.set("webhook-signature", `v1,bm90LWl0 ${headers.get("webhook-signature")}`);
    expect(verifyHookSignature(body, headers, SECRET)).toBe(true);
  });
});

describe("sign-in emails", () => {
  let aisha: { id: string; email: string };
  let sam: { id: string; email: string; platformAdmin: boolean };
  let streamspace: ThemeTokens;
  let northwind: ThemeTokens;

  beforeAll(async () => {
    aisha = { id: await userId("aisha"), email: SEED_USERS.aisha.email };
    sam = { id: await userId("platformAdmin"), email: SEED_USERS.platformAdmin.email, platformAdmin: true };
    streamspace = await liveTokens("streamspace");
    northwind = await liveTokens("northwind");
    // Both have signed in before, so they get a plain sign-in link rather than an invitation.
    await sql()`update auth.users set last_sign_in_at = now() where id in (${aisha.id}, ${sam.id})`;
  });

  async function send(request: Request, secret: string | undefined = SECRET) {
    const outbox: Email[] = [];
    const res = await handleSendEmailHook(request, { admin: admin(), mailer: { send: async (e) => void outbox.push(e) }, appUrl: APP, secret });
    return { res, outbox };
  }

  function linkIn(email: Email): URL {
    const href = /href="([^"]*\/auth\/confirm[^"]*)"/.exec(email.html ?? "")![1].replace(/&amp;/g, "&");
    return new URL(href);
  }

  it("carry the organization of the page the learner signed in from", async () => {
    const { res, outbox } = await send(hookRequest(payload(aisha, "/streamspace/ime-engineering")));
    expect(res.status).toBe(200);
    expect(outbox).toHaveLength(1);
    const [email] = outbox;
    expect(email.to).toBe(aisha.email);
    expect(email.subject).toBe("Your sign-in link for Streamspace");
    expect(email.html).toContain(`background-color:${streamspace.light.primary}`);
    expect(email.html).toMatch(/src="http:\/\/localhost:3100\/api\/email-logo\/streamspace\.png\?v=[0-9a-f]+"/);
    const link = linkIn(email);
    expect(`${link.origin}${link.pathname}`).toBe(`${APP}/auth/confirm`);
    expect(link.searchParams.get("next")).toBe("/streamspace/ime-engineering");
    expect(link.searchParams.get("type")).toBe("email");
    expect(link.searchParams.get("token_hash")).toBe("abc123hash");
    expect(email.text).toContain(link.toString());
  });

  it("carry the 6-digit code for signing in on another device", async () => {
    const body = payload(aisha, "/streamspace/ime-engineering");
    const { outbox } = await send(hookRequest({ ...body, email_data: { ...body.email_data, token: "482913" } }));
    expect(outbox[0].html).toContain("482 913");
    expect(outbox[0].text).toContain("enter this code: 482 913");
    // No code in the payload, no code block.
    const without = payload(aisha, "/streamspace/ime-engineering");
    const plain = await send(hookRequest({ ...without, email_data: { ...without.email_data, token: null } }));
    expect(plain.outbox[0].text).not.toContain("enter this code");
  });

  it("never show or link to an organization the person isn't in", async () => {
    const { outbox } = await send(hookRequest(payload(aisha, "/northwind/customer-onboarding")));
    const [email] = outbox;
    expect(email.subject).toBe("Your sign-in link for Streamspace");
    expect(`${email.subject}${email.html}${email.text}`).not.toMatch(/northwind/i);
    expect(email.html).not.toContain(northwind.light.primary);
    expect(linkIn(email).searchParams.get("next")).toBe("/");
  });

  it("use the platform's look for a platform admin outside any organization's pages", async () => {
    const own = await send(hookRequest(payload(sam, "/northwind")));
    expect(own.outbox[0].subject).toBe("Your sign-in link for Northwind Academy");
    expect(own.outbox[0].html).toContain(`background-color:${northwind.light.primary}`);
    expect(linkIn(own.outbox[0]).searchParams.get("next")).toBe("/northwind");

    const home = await send(hookRequest(payload(sam, "/")));
    expect(home.outbox[0].subject).toBe("Your sign-in link");
    expect(home.outbox[0].html).not.toContain("<img");
  });

  it("refuse unsigned calls, a missing secret and email types the platform doesn't send", async () => {
    const body = payload(aisha, "/");
    expect((await send(hookRequest(body, new Headers()))).res.status).toBe(401);
    expect((await send(hookRequest(body), "")).res.status).toBe(500);
    const recovery = await send(hookRequest(payload(aisha, "/", "recovery")));
    expect(recovery.res.status).toBe(400);
    expect(recovery.outbox).toEqual([]);
    expect(((await recovery.res.json()) as { error: { http_code: number } }).error.http_code).toBe(400);
  });

  it("fall back to the app's confirm address when Auth replaced the redirect", () => {
    const link = signInLink(APP, APP, "email", "h");
    expect(link.toString()).toBe(`${APP}/auth/confirm?type=email&token_hash=h`);
  });
});

describe("a person's first email", () => {
  const stamp = Date.now();
  let ids: Awaited<ReturnType<typeof seeded>>;
  beforeAll(async () => {
    ids = await seeded();
  });

  async function newAccount(email: string, platformAdmin = false) {
    const { data, error } = await admin().auth.admin.createUser({ email, email_confirm: true, app_metadata: platformAdmin ? { platform_admin: true } : {} });
    if (error) throw error;
    return { id: data.user.id, email, platformAdmin };
  }

  async function firstEmail(who: { id: string; email: string; platformAdmin?: boolean }, next: string) {
    const outbox: Email[] = [];
    const res = await handleSendEmailHook(hookRequest(payload(who, next)), { admin: admin(), mailer: { send: async (e) => void outbox.push(e) }, appUrl: APP, secret: SECRET });
    expect(res.status).toBe(200);
    return outbox[0];
  }

  it("invites a new learner to give feedback, and says how signing in works", async () => {
    const learner = await newAccount(`new.learner.${stamp}@invite.example`);
    await sql()`insert into public.enrollments (organization_id, course_id, user_id, display_name, email) values (${ids.streamspace}, ${ids.ime}, ${learner.id}, 'New Learner', ${learner.email})`;
    const email = await firstEmail(learner, "/streamspace/ime-engineering");
    expect(email.subject).toBe("You're invited to give feedback on Streamspace platform training: IME Engineering");
    expect(email.text).toContain("a short interview of about five minutes");
    expect(email.text).toContain(`There's no password. Whenever you want to sign in, enter this email address at ${APP}/streamspace/sign-in`);
    expect(email.text).toContain(`If it has expired, get a new one at ${APP}/streamspace/sign-in.`);
    expect(email.html).toContain(">You&#39;re invited</h1>");
  });

  it("tells a new sponsor what they'll see, and a new platform admin what they can do", async () => {
    const sponsor = await newAccount(`new.sponsor.${stamp}@invite.example`);
    await sql()`insert into public.memberships (organization_id, course_id, user_id, role, display_name, email) values (${ids.streamspace}, ${ids.ime}, ${sponsor.id}, 'sponsor', 'New Sponsor', ${sponsor.email})`;
    const toSponsor = await firstEmail(sponsor, "/streamspace/ime-engineering");
    expect(toSponsor.subject).toBe("You can now view the results of Streamspace platform training: IME Engineering");
    expect(toSponsor.text).toContain("Nothing is shown from a single learner.");

    const platformAdmin = await newAccount(`new.platform.${stamp}@invite.example`, true);
    const toAdmin = await firstEmail(platformAdmin, "/platform");
    expect(toAdmin.subject).toBe("You're now a platform admin of the Course Feedback Platform");
    expect(toAdmin.text).toContain(`${APP}/sign-in`);
    // Other tests count the platform admins (alerts go to each), so this one doesn't stay.
    await admin().auth.admin.deleteUser(platformAdmin.id);
  });

  it("names the organization even when the link opens the home page", async () => {
    const learner = await newAccount(`home.learner.${stamp}@invite.example`);
    await sql()`insert into public.enrollments (organization_id, course_id, user_id, display_name, email) values (${ids.streamspace}, ${ids.ime}, ${learner.id}, 'Home Learner', ${learner.email})`;
    const email = await firstEmail(learner, "/");
    expect(email.subject).toBe("You're invited to Streamspace");
    expect(email.text).toContain(`${APP}/streamspace/sign-in`);
  });
});

describe("app emails", () => {
  it("reach instructors in their organization's branding", async () => {
    const ids = await seeded();
    const outbox: Email[] = [];
    await notifyBlocker(
      { session_id: ids.s1, summary: "The <lab> login didn't work" },
      { admin: admin(), now: () => new Date(), mailer: { send: async (e) => void outbox.push(e) } },
    );
    expect(outbox.length).toBeGreaterThan(0);
    const tokens = await liveTokens("streamspace");
    for (const email of outbox) {
      expect(email.subject).toBe("A learner is blocked after Session 1");
      expect(email.html).toContain(`background-color:${tokens.light.primary}`);
      expect(email.html).toContain("The &lt;lab&gt; login didn&#39;t work");
      expect(email.html).toContain('href="http://localhost:3100/streamspace/ime-engineering/dashboard"');
      expect(email.text).toContain("The <lab> login didn't work");
    }
  });

  it("serve each organization's logo as a PNG for mail apps that don't show SVG", async () => {
    const logo = await emailLogoBySlug(admin(), "northwind");
    expect(logo?.png.subarray(0, 4).toString("hex")).toBe("89504e47");
    expect(logo?.height).toBe(80);
    expect(await emailLogoBySlug(admin(), "no-such-organization")).toBeNull();
  });
});
