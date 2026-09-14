#!/usr/bin/env node
/** Load pages in a real browser and report console errors/warnings.
 *  Development aid: hydration mismatches are dev-only and invisible to curl. */
import { chromium } from "playwright";
const base = process.env.SHOT_BASE ?? "http://localhost:3000";
const paths = process.argv.slice(2);
const b = await chromium.launch();
let bad = 0;
for (const path of paths) {
  const p = await b.newPage();
  const msgs = [];
  p.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") msgs.push(m.text().slice(0, 160));
  });
  await p.goto(base + path, { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  console.log(`\n=== ${path} ===`);
  if (msgs.length) { bad++; console.log(msgs.slice(0, 3).join("\n")); }
  else console.log("(clean)");
  await p.close();
}
await b.close();
process.exit(bad ? 1 : 0);
