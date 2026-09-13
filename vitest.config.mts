import { defineConfig } from "vitest/config";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    // Unit and concurrency tests are Node-side. Component tests, if we add any
    // later, get their own project entry rather than making everything jsdom.
    environment: "node",
    include: ["tests/**/*.test.ts"],

    // The concurrency test in tests/concurrency fires 50 simultaneous bids at
    // one listing row. If Vitest ran those files in parallel with others that
    // touch the same database, results would be meaningless. Phase 4 will move
    // that directory into its own sequential project; for now the default is
    // fine because nothing touches a database yet.
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": resolve(dirname(fileURLToPath(import.meta.url)), "./src"),
    },
  },
});
