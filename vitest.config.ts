import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@/": root,
      // server-only throws outside a React server build. Tests run route logic directly.
      "server-only": `${root}tests/support/empty.ts`,
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "agents/**/*.test.ts", "lib/**/*.test.ts"],
    globalSetup: ["tests/support/global-setup.ts"],
    setupFiles: ["tests/support/setup-env.ts"],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    pool: "forks",
    // Files share one test database and its job queue, so they run one at a time.
    fileParallelism: false,
  },
});
