#!/usr/bin/env node
/**
 * Drive a real bid through a real browser, and prove Realtime reaches a second
 * viewer who never reloads.
 *
 * Two pages open on the same listing. One signs in as a verified bidder and
 * places a bid; the other stays anonymous and is never navigated again. If the
 * anonymous page's price changes on its own, the subscription works.
 *
 * Development aid, local only. Not part of CI.
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

if (existsSync(resolve(".env.local"))) process.loadEnvFile(resolve(".env.local"));

const BASE = process.env.SHOT_BASE ?? "http://localhost:3000";
const URL = process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE =
  process.env.SUPABASE_TEST_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// A live listing whose seller is not our bidder.
const { data: listing } = await admin
  .from("listings")
  .select("id, title, seller_id, starting_price, current_price, bid_increment")
  .eq("status", "live")
  .order("ends_at", { ascending: false })
  .limit(1)
  .single();

console.log(`listing: ${listing.title}`);

const browser = await chromium.launch();

// --- viewer B: anonymous, opened FIRST and never touched again -------------
const watcher = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await watcher.goto(`${BASE}/listings/${listing.id}`, { waitUntil: "networkidle" });
await watcher.waitForTimeout(2500); // let the socket subscribe

const liveBadge = await watcher
  .locator("text=/^(Live|Offline)$/")
  .first()
  .textContent()
  .catch(() => "(not found)");
console.log(`watcher socket: ${liveBadge}`);

const priceBefore = await watcher
  .locator("main")
  .getByText(/^₹[\d,]+$/)
  .first()
  .textContent();
console.log(`watcher price before: ${priceBefore}`);

// --- viewer A: signs in and bids -------------------------------------------
const bidder = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await bidder.goto(`${BASE}/login?next=/listings/${listing.id}`, {
  waitUntil: "networkidle",
});
await bidder.fill("#email", "bidder-ishan@example.test");
await bidder.fill("#password", "demo-password-not-secret");
await bidder.click('button[type="submit"]');
await bidder.waitForURL(`**/listings/${listing.id}`, { timeout: 20000 });
await bidder.waitForTimeout(1500);

const panelState = await bidder
  .locator("#amount")
  .inputValue()
  .catch(() => "(no bid field — panel is in a blocked state)");
console.log(`bidder sees amount field: ${panelState}`);

await bidder.screenshot({ path: "shots/bid-panel.png" });

await bidder.click('form button[type="submit"]');
await bidder.waitForTimeout(3000);

const result = await bidder
  .locator('[role="status"], [role="alert"]')
  .first()
  .textContent()
  .catch(() => "(no message)");
console.log(`bid result: ${result?.trim()}`);

await bidder.screenshot({ path: "shots/bid-placed.png" });

// --- did the watcher update without reloading? -----------------------------
await watcher.waitForTimeout(3000);
const priceAfter = await watcher
  .locator("main")
  .getByText(/^₹[\d,]+$/)
  .first()
  .textContent();
console.log(`watcher price after:  ${priceAfter}`);
console.log(
  priceBefore !== priceAfter
    ? "REALTIME OK — the watcher updated without navigating"
    : "REALTIME DID NOT ARRIVE — price unchanged on the watcher",
);
await watcher.screenshot({ path: "shots/bid-watcher.png" });

await browser.close();
