import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { reset, TEST_ENV_FILE } from "../../scripts/test-stack";

// Vitest and Playwright share the test stack. Each run starts from a freshly seeded database.
//
// The test stack's Auth hands sign-in emails to the app on port 3100, which is Playwright's server.
// Vitest has no app server, so this one runs the same hook code there for the run, and invitation
// emails still reach the test inbox.
export default async function setup() {
  if (process.env.SKIP_DB_RESET !== "1") reset();
  const server = await startSendEmailHook();
  return () => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
}

async function startSendEmailHook(): Promise<Server | null> {
  for (const line of readFileSync(TEST_ENV_FILE, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) process.env[m[1]] = m[2];
  }
  // Imported after the environment is set, since these read it when they load.
  const { handleSendEmailHook } = await import("../../lib/server/mail/auth-hook");
  const { adminClient } = await import("../../lib/server/supabase-admin");
  const { mailer } = await import("../../lib/server/email");
  const { publicEnv } = await import("../../lib/env");

  const server = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/auth/send-email") {
      res.writeHead(404).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(name, value);
    const response = await handleSendEmailHook(
      new Request(`${publicEnv.appUrl}${req.url}`, { method: "POST", headers, body: Buffer.concat(chunks) }),
      { admin: adminClient(), mailer: mailer(), appUrl: publicEnv.appUrl, secret: process.env.SEND_EMAIL_HOOK_SECRET },
    );
    res.writeHead(response.status, { "content-type": "application/json" }).end(await response.text());
  });
  return new Promise((resolve) => {
    server.once("error", () => {
      // Port 3100 is taken, most likely by a Playwright server, which runs the hook itself.
      console.log("Port 3100 is in use; sign-in emails go to the server already there.");
      resolve(null);
    });
    server.listen(3100, () => resolve(server));
  });
}
