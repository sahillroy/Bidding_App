#!/usr/bin/env node
/**
 * One-command local stack for a machine that has Docker.
 *
 *   npm run setup:local
 *
 * Checks Docker is running, writes .env.local with the published local
 * Supabase keys (the same on every machine — they are not secrets), starts
 * the stack, and resets the database so migrations 0001–0012 and seed.sql
 * are applied. After this, `npm run test:integration` and `npm run dev` work.
 *
 * Storage needs about 6 GB of RAM for Docker. At ~3.7 GB the storage
 * container fails its health check and image uploads die. That is a Docker
 * Desktop setting, not something this script can fix: Settings → Resources.
 */

import { execSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_EXAMPLE = join(ROOT, ".env.example");
const ENV_LOCAL = join(ROOT, ".env.local");

// Published local-stack JWTs from the Supabase CLI. Identical on every
// machine. Constrained by RLS (anon) or used only on the server (service).
const LOCAL_URL = "http://127.0.0.1:54321";
const LOCAL_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const LOCAL_SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

function fail(message) {
  console.error(`\n  setup:local failed\n  ${message}\n`);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    fail(`\`${command} ${args.join(" ")}\` exited ${result.status}.`);
  }
}

function setEnv(contents, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(contents)) return contents.replace(pattern, line);
  return `${contents.trimEnd()}\n${line}\n`;
}

console.log("BidKar local Docker setup\n");

try {
  execSync("docker info", { stdio: "ignore" });
} catch {
  fail(
    "Docker is not running. Start Docker Desktop first.\n" +
      "  Give it at least 6 GB of RAM (Settings → Resources).\n" +
      "  At ~3.7 GB the Storage container fails its health check and uploads die.",
  );
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 24) {
  fail(
    `Node ${process.versions.node} is too old. .nvmrc pins 24.8. Install Node 24+ and retry.`,
  );
}

if (!existsSync(join(ROOT, "node_modules"))) {
  console.log("node_modules missing — running npm ci…\n");
  run("npm", ["ci"]);
}

if (!existsSync(ENV_EXAMPLE)) {
  fail(".env.example is missing. Are you in the repo root?");
}

if (!existsSync(ENV_LOCAL)) {
  copyFileSync(ENV_EXAMPLE, ENV_LOCAL);
  console.log("Created .env.local from .env.example");
}

let env = readFileSync(ENV_LOCAL, "utf8");
env = setEnv(env, "NEXT_PUBLIC_SUPABASE_URL", LOCAL_URL);
env = setEnv(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY", LOCAL_ANON);
env = setEnv(env, "SUPABASE_SERVICE_ROLE_KEY", LOCAL_SERVICE);
env = setEnv(env, "SUPABASE_TEST_URL", LOCAL_URL);
env = setEnv(env, "SUPABASE_TEST_ANON_KEY", LOCAL_ANON);
env = setEnv(env, "SUPABASE_TEST_SERVICE_KEY", LOCAL_SERVICE);
env = setEnv(env, "NEXT_PUBLIC_APP_URL", "http://localhost:3000");
env = setEnv(env, "NEXT_PUBLIC_DEMO_MODE", "true");
writeFileSync(ENV_LOCAL, env.endsWith("\n") ? env : `${env}\n`);
console.log("Pointed .env.local at the local Supabase stack (127.0.0.1:54321).");
console.log(
  "  Those JWTs are the published CLI demo keys. They are not secrets.\n",
);

console.log("Starting Supabase (first run pulls images — can take several minutes)…\n");
run("npx", ["supabase", "start"]);

console.log("\nResetting the database (migrations 0001–0012 + seed)…\n");
run("npx", ["supabase", "db", "reset"]);

console.log(`
Ready.

  Studio          http://127.0.0.1:54323
  Mail catcher    http://127.0.0.1:54324
  App (after dev) http://localhost:3000

Next:

  npm run test:integration
  npm run dev

Demo logins (password for all: demo-password-not-secret)

  admin@example.test          admin queue
  seller-anaya@example.test   has pending + rejected seed listings

Phase 3 acceptance path

  1. Open / in a private window. You should see live auctions, not
     "Gaming laptop listed at ten crore".
  2. Search that title — zero results. Unapproved listings are unsearchable.
  3. Sign in as the admin. /admin/listings shows the pending rows; the
     ten-crore laptop is price-flagged.
  4. Sign in as Anaya (or create an account). /sell → List an item.
     Complete the wizard, add a photo, submit.
  5. Confirm the new listing is absent from / and from search.
  6. As admin, approve it. It must then appear on / and be searchable.
`);
