#!/usr/bin/env node
/**
 * Screenshot the running app.
 *
 * Exists so that UI work can be verified by looking at it rather than by
 * reading the HTML and hoping. Point it at a running dev server.
 *
 *   node scripts/shots.mjs <listing-id> [outDir]
 *
 * Not part of CI. Phase 7's Playwright e2e suite is the real test harness;
 * this is the development loop that comes before it.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.SHOT_BASE ?? "http://localhost:3000";
const listingId = process.argv[2];
const outDir = resolve(process.argv[3] ?? "shots");

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();

async function shot(name, path, opts = {}) {
  const page = await browser.newPage({
    viewport: opts.viewport ?? { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });

  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  // Let the web fonts settle; a screenshot mid-swap shows the fallback face.
  await page.waitForTimeout(700);

  if (opts.hover) {
    await page.hover(opts.hover);
    // Long enough for the slowest layer (the 700ms shine sweep) to finish.
    await page.waitForTimeout(900);
  }

  if (opts.scrollTo) {
    await page.evaluate((y) => window.scrollTo(0, y), opts.scrollTo);
    await page.waitForTimeout(600);
  }

  const file = resolve(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: Boolean(opts.fullPage) });
  console.log(`${name}  ->  ${file}`);
  await page.close();
}

await shot("01-home", "/");
await shot("02-home-hover", "/", { hover: "a[data-tilt]" });
await shot("03-home-scrolled", "/", { scrollTo: 900 });
await shot("04-mobile", "/", { viewport: { width: 390, height: 844 } });
if (listingId) await shot("05-listing", `/listings/${listingId}`);
await shot("06-login", "/login");

await browser.close();
