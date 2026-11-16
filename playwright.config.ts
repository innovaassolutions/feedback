import { existsSync, readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { ensure } from "./scripts/test-stack";

// The end-to-end server runs on port 3100 against the test stack, so `npm run e2e` works
// while `npm run dev` is running on port 3000 against the dev database.
if (!process.env.TEST_WORKER_INDEX) ensure();

function readEnv(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const testEnv = readEnv(".test-stack/.env");
for (const [k, v] of Object.entries(testEnv)) process.env[k] = v;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  workers: 3,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  globalSetup: "./e2e/global-setup.ts",
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /realtime\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        // A fake microphone, and permission prompts answered automatically.
        launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
      },
    },
    // Timing checks (a live update within two seconds) run on their own after everything else, so
    // a machine busy with three parallel workers doesn't decide them.
    {
      name: "realtime",
      testMatch: /realtime\.spec\.ts/,
      dependencies: ["chromium"],
      fullyParallel: false,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npx next dev -p 3100",
    url: "http://localhost:3100/sign-in",
    reuseExistingServer: false,
    timeout: 240_000,
    env: { ...testEnv, NEXT_DIST_DIR: ".next-e2e", PORT: "3100" },
  },
});
