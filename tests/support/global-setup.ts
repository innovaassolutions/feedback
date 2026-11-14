import { reset } from "../../scripts/test-stack";

// Vitest and Playwright share the test stack. Each run starts from a freshly seeded database.
export default function setup() {
  if (process.env.SKIP_DB_RESET !== "1") reset();
}
