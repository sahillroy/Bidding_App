import { defineConfig } from "vitest/config";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

/*
  Load .env.local into process.env before the suites are collected.

  Without this, the RLS integration tests find no database configuration and
  SKIP — and a skipped test looks almost exactly like a passing one in the
  summary line. "14 skipped" is easy to read as success at a glance, which
  would mean shipping a schema nobody verified.

  process.loadEnvFile is native in Node 20.6+, so this needs no dependency.
  Vitest does not load .env files into process.env on its own; Vite's own env
  handling only exposes VITE_-prefixed values to import.meta.env.
*/
const envLocal = resolve(dirname(fileURLToPath(import.meta.url)), ".env.local");
if (existsSync(envLocal)) {
  process.loadEnvFile(envLocal);
}

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
