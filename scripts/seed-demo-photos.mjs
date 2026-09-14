#!/usr/bin/env node
/**
 * Seed placeholder photographs into local Supabase Storage.
 *
 * WHY THIS EXISTS
 *
 * `supabase/seed.sql` creates 41 listings and zero images, so until now the
 * Storage half of Phase 3 had never actually been exercised: the bucket, its
 * RLS policies, the public URL shape and the `listing_images` rows were all
 * written and none of them had ever carried a real object. This runs that
 * whole path for real.
 *
 * It also makes the homepage demoable. Hovering a lot cross-fades through its
 * photographs, and with one image per listing there is nothing to cross-fade.
 *
 * WHAT IT PRODUCES — AND WHAT IT DOES NOT
 *
 * Generated gradient art, the same visual language as the built-in placeholder,
 * rendered to real WebP files. It does NOT invent photographs of products we do
 * not have: a marketplace demo whose whole premise is being honest about what
 * is simulated has no business shipping fake product photos. Each variant is a
 * different angle and offset of the same gradient, so cycling reads as motion
 * without pretending to be something it is not.
 *
 * LOCAL ONLY. It uses the service role key to write on behalf of sellers,
 * which is exactly the thing application code must never do. It is a
 * development fixture, it refuses to run against anything but localhost, and
 * it is not wired into CI.
 *
 *   node scripts/seed-demo-photos.mjs [listingsToCover] [variantsEach]
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const envFile = resolve(".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const URL = process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE =
  process.env.SUPABASE_TEST_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !SERVICE) {
  console.error("Set SUPABASE_TEST_URL and SUPABASE_TEST_SERVICE_KEY (or the NEXT_PUBLIC_/SERVICE_ROLE equivalents) in .env.local.");
  process.exit(1);
}

// The service role key bypasses RLS entirely. It may only ever point at a
// local stack, never at a hosted project.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(URL)) {
  console.error(`Refusing to run against ${URL}. This script is local-only.`);
  process.exit(1);
}

const COVER = Number(process.argv[2] ?? 14);
const VARIANTS = Math.min(Number(process.argv[3] ?? 3), 8);

const PALETTES = [
  ["#1e3a5f", "#2d5a87"], ["#3d2f4f", "#5a4570"],
  ["#1f4037", "#2d5f4f"], ["#4a3728", "#6b5140"],
  ["#2b3a4a", "#3f5468"], ["#4a2f3a", "#6b4553"],
  ["#2f4538", "#456b52"], ["#3a3550", "#524a75"],
];

/** FNV-1a — matches the hash in listing-image.tsx, so a seeded photo and the
 *  fallback placeholder for the same listing share a colour family. */
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const supabase = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: listings, error: listErr } = await supabase
  .from("listings")
  .select("id, title, seller_id")
  .eq("status", "live")
  .order("ends_at", { ascending: true })
  .limit(COVER);

if (listErr) {
  console.error("Could not read listings:", listErr.message);
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<canvas id='c' width='1200' height='900'></canvas>");

let uploaded = 0;
let skipped = 0;

for (const listing of listings ?? []) {
  const { count } = await supabase
    .from("listing_images")
    .select("id", { count: "exact", head: true })
    .eq("listing_id", listing.id);

  if ((count ?? 0) > 0) {
    skipped++;
    continue;
  }

  const h = hash(listing.id);
  const [from, to] = PALETTES[h % PALETTES.length];
  const initials = listing.title
    .split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  for (let v = 0; v < VARIANTS; v++) {
    const dataUrl = await page.evaluate(
      ({ from, to, initials, v, seed }) => {
        const c = document.getElementById("c");
        const ctx = c.getContext("2d");
        const angle = ((seed % 90) + v * 47) * (Math.PI / 180);
        const dx = Math.cos(angle) * c.width;
        const dy = Math.sin(angle) * c.height;

        const g = ctx.createLinearGradient(0, 0, dx, dy);
        g.addColorStop(0, from);
        g.addColorStop(1, to);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, c.width, c.height);

        // A soft off-centre highlight, moved per variant so cycling reads as
        // the light shifting across the object rather than a hard cut.
        const rg = ctx.createRadialGradient(
          c.width * (0.3 + v * 0.18), c.height * (0.34 + v * 0.12), 40,
          c.width * 0.5, c.height * 0.5, c.width * 0.8,
        );
        rg.addColorStop(0, "rgba(255,255,255,0.16)");
        rg.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, c.width, c.height);

        ctx.font = "700 240px system-ui, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(initials, c.width / 2 + (v - 1) * 26, c.height / 2);

        return c.toDataURL("image/webp", 0.82);
      },
      { from, to, initials, v, seed: h },
    );

    if (!dataUrl.startsWith("data:image/webp")) {
      console.error("This browser did not encode WebP. Aborting.");
      await browser.close();
      process.exit(1);
    }

    const bytes = Buffer.from(dataUrl.split(",")[1], "base64");
    // The same {seller}/{listing}/{id}.webp shape the upload path uses, so the
    // storage RLS policies see exactly what they would in production.
    const path = `${listing.seller_id}/${listing.id}/${randomUUID()}.webp`;

    const { error: upErr } = await supabase.storage
      .from("listing-images")
      .upload(path, bytes, { contentType: "image/webp", upsert: false });

    if (upErr) {
      console.error(`upload failed (${listing.title}):`, upErr.message);
      continue;
    }

    const { error: rowErr } = await supabase
      .from("listing_images")
      .insert({ listing_id: listing.id, storage_path: path, sort_order: v });

    if (rowErr) {
      console.error(`row failed (${listing.title}):`, rowErr.message);
      continue;
    }

    uploaded++;
  }
}

await browser.close();
console.log(
  `${uploaded} images uploaded across ${(listings ?? []).length - skipped} listings ` +
    `(${skipped} already had photos).`,
);
