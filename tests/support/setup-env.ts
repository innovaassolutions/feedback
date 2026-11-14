import { existsSync } from "node:fs";

const file = ".test-stack/.env";
if (!existsSync(file)) throw new Error("The test stack isn't set up. Run `npm run test:db -- reset`.");
// Test-stack values win over anything in .env.local.
for (const line of (await import("node:fs")).readFileSync(file, "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
  if (m) process.env[m[1]] = m[2];
}
