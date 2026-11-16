// The test stack: a second local Supabase used by Vitest and Playwright, so tests never touch
// the database behind `npm run dev`. Its config is generated from supabase/config.toml with
// every port moved from 543xx to 553xx and the site address moved to port 3100.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const stackDir = path.join(root, ".test-stack");
const supaDir = path.join(stackDir, "supabase");
export const TEST_ENV_FILE = path.join(stackDir, ".env");
const EXCLUDE = "studio,imgproxy,vector,logflare,supavisor,edge-runtime,postgres-meta";
// The test stack's send-email hook secret. It signs requests between two local test processes only.
const TEST_HOOK_SECRET = `v1,whsec_${Buffer.from("feedback-test-stack-send-email-hook").toString("base64")}`;

/** Writes the test stack's config. Returns true when it differs from the one the stack has. */
export function sync(): boolean {
  mkdirSync(supaDir, { recursive: true });
  let config = readFileSync(path.join(root, "supabase", "config.toml"), "utf8");
  config = config
    .replace(/project_id = "[^"]+"/, 'project_id = "feedback-test"')
    .replace(/\b543(\d\d)\b/g, "553$1")
    .replace(/localhost:3000/g, "localhost:3100")
    .replace(/127\.0\.0\.1:3000/g, "127.0.0.1:3100")
    .replace(/host\.docker\.internal:3000/g, "host.docker.internal:3100")
    .replace(/env\(SEND_EMAIL_HOOK_SECRET\)/g, TEST_HOOK_SECRET)
    .replace(/inspector_port = 8083/, "inspector_port = 8093");
  const configPath = path.join(supaDir, "config.toml");
  const changed = !existsSync(configPath) || readFileSync(configPath, "utf8") !== config;
  writeFileSync(configPath, config);
  for (const dir of ["migrations", "templates"]) {
    rmSync(path.join(supaDir, dir), { recursive: true, force: true });
    cpSync(path.join(root, "supabase", dir), path.join(supaDir, dir), { recursive: true });
  }
  return changed;
}

function supabase(args: string[], quiet = false): string {
  return execFileSync("supabase", [...args, "--workdir", stackDir], {
    cwd: root,
    encoding: "utf8",
    stdio: quiet ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "inherit"],
    maxBuffer: 20 * 1024 * 1024,
  });
}

function status(): Record<string, string> | null {
  try {
    const out = supabase(["status", "-o", "env"], true);
    const env: Record<string, string> = {};
    for (const line of out.split("\n")) {
      const m = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
      if (m) env[m[1]] = m[2];
    }
    return env.API_URL ? env : null;
  } catch {
    return null;
  }
}

function writeEnv(s: Record<string, string>) {
  const lines = {
    NEXT_PUBLIC_SUPABASE_URL: s.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: s.PUBLISHABLE_KEY ?? s.ANON_KEY,
    SUPABASE_SECRET_KEY: s.SECRET_KEY ?? s.SERVICE_ROLE_KEY,
    SUPABASE_DB_URL: s.DB_URL,
    MAILPIT_URL: s.MAILPIT_URL ?? s.INBUCKET_URL ?? "http://127.0.0.1:55324",
    NEXT_PUBLIC_APP_URL: "http://localhost:3100",
    EMAIL_TRANSPORT: "smtp",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: "55325",
    EMAIL_FROM: "Course Feedback <feedback@platform.example>",
    AI_PROVIDER: "stub",
    VOCAL_BRIDGE_API_KEY: "test-vocal-bridge-key",
    // Unreachable on purpose: tests never call the real voice service.
    VOCAL_BRIDGE_API_URL: "http://127.0.0.1:9",
    CRON_SECRET: "test-cron-secret",
    SEND_EMAIL_HOOK_SECRET: TEST_HOOK_SECRET,
  };
  writeFileSync(TEST_ENV_FILE, Object.entries(lines).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
}

export function ensure() {
  const changed = sync();
  let s = status();
  if (s && changed) {
    // A running stack keeps the config it started with, so a changed one needs a restart.
    console.log("The test stack's config changed; restarting it…");
    stop();
    s = null;
  }
  if (!s) {
    console.log("Starting the test Supabase stack…");
    supabase(["start", "-x", EXCLUDE]);
    s = status();
    if (!s) throw new Error("The test Supabase stack did not start");
  }
  writeEnv(s);
}

export function reset() {
  ensure();
  supabase(["db", "reset", "--no-seed"], true);
  execFileSync("npx", ["tsx", "scripts/seed.ts"], {
    cwd: root,
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, FEEDBACK_ENV_FILE: TEST_ENV_FILE },
  });
}


export function stop() {
  supabase(["stop"]);
}
