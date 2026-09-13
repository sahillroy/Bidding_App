import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("phase 0 foundations", () => {
  it("runs the test suite at all", () => {
    expect(1 + 1).toBe(2);
  });

  it("mounts the DEMO banner in the root layout", () => {
    // The banner must be in the ROOT layout, not in individual pages, so that
    // every current and future route inherits it. See implementationplan.md §1.1.
    expect(read("src/app/layout.tsx")).toContain("<DemoBanner />");
  });

  it("gives the DEMO banner no way to be switched off", () => {
    const banner = read("src/components/demo-banner.tsx");

    // Strip comments before asserting. The file deliberately *discusses* the
    // things we are forbidding, and a test that cannot tell code from prose
    // would punish us for documenting the reasoning.
    const code = banner
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    // No props at all: a component that takes no props cannot be told to hide.
    expect(code).toMatch(/export function DemoBanner\(\)/);

    // It must not read the demo-mode env var either. If it did, deleting one
    // environment variable in Vercel would silently remove a legally
    // load-bearing notice.
    expect(code).not.toContain("NEXT_PUBLIC_DEMO_MODE");
    expect(code).not.toContain("process.env");

    // No client-side state means no dismiss handler.
    expect(code).not.toContain("use client");
  });

  it("documents every environment variable the app reads", () => {
    const example = read(".env.example");
    const required = [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "QSTASH_TOKEN",
      "QSTASH_CURRENT_SIGNING_KEY",
      "QSTASH_NEXT_SIGNING_KEY",
      "NEXT_PUBLIC_APP_URL",
      "NEXT_PUBLIC_DEMO_MODE",
    ];
    for (const key of required) {
      expect(example, `${key} missing from .env.example`).toContain(key);
    }
  });

  it("never exposes the service role key to the browser", () => {
    // NEXT_PUBLIC_ is Next.js's marker for "inline this into the client bundle".
    // The service role key bypasses Row Level Security completely, so prefixing
    // it would hand every visitor full read/write access to the database.
    expect(read(".env.example")).not.toContain(
      "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
    );
  });
});
