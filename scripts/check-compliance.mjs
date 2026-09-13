#!/usr/bin/env node
/**
 * Compliance guard. Runs in CI and fails the build.
 *
 * Purpose (implementationplan.md §2.1, §2.2, §15): the hard constraints of this
 * project are legal, not stylistic. Someone — a future contributor, a future
 * you, an over-helpful AI assistant — will eventually try to "improve" the KYC
 * flow by storing the document number, or wire in a live payment key. This
 * script is the tripwire that stops that reaching main.
 *
 * It is deliberately crude. A determined person can work around it. It is not a
 * security boundary; it is a speed bump loud enough that nobody crosses the
 * line by accident.
 *
 * Checks:
 *   1. No database column that looks built to hold an Aadhaar or PAN number.
 *   2. No literal that looks like a real PAN or a 12-digit Aadhaar in source.
 *   3. No live (non-test) payment provider key.
 *   4. The DEMO banner is still mounted in the root layout.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const failures = [];

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "out",
  "coverage",
  "docs", // documentation must be free to *discuss* these rules
  "scripts", // this file necessarily contains the patterns it looks for
  "public",
]);

const SCAN_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".sql", ".json"];

function collectFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectFiles(full, acc);
    } else if (SCAN_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      acc.push(full);
    }
  }
  return acc;
}

const files = collectFiles(ROOT);

function report(file, lineNo, line, message) {
  failures.push({
    file: relative(ROOT, file).split(sep).join("/"),
    lineNo,
    line: line.trim().slice(0, 120),
    message,
  });
}

// ---------------------------------------------------------------------------
// 1. Columns that look built to hold a document number
// ---------------------------------------------------------------------------
//
// The three columns we DO allow are doc_type, format_valid and masked_hint.
// Anything else whose name mentions aadhaar or pan and which is declared as a
// text-ish or numeric type is assumed to be storage for the number itself.

const DOC_WORD = /(aadhaar|aadhar|\bpan\b|uidai|uid_number)/i;
const ALLOWED_COLUMNS = /(doc_type|format_valid|masked_hint|pan_format|aadhaar_format|is_valid)/i;
const SQL_COLUMN_DECL =
  /^\s*"?([a-z_]+)"?\s+(text|varchar|char|citext|bigint|numeric|integer|int|bytea|jsonb)\b/i;

// ---------------------------------------------------------------------------
// 2. Literals that look like real document numbers
// ---------------------------------------------------------------------------
//
// UIDAI never issues an Aadhaar starting with 0 or 1, so synthetic test numbers
// in this repo must start with 0 or 1. A 12-digit run starting 2-9 is therefore
// either a real number or careless test data; both are rejected.
const AADHAAR_LITERAL = /(?<![\d.])[2-9]\d{11}(?![\d.])/;
const PAN_LITERAL = /(?<![A-Z0-9])[A-Z]{5}\d{4}[A-Z](?![A-Z0-9])/;

// ---------------------------------------------------------------------------
// 3. Live payment keys
// ---------------------------------------------------------------------------
const LIVE_KEY = /(rzp_live_|sk_live_|pk_live_|whsec_live_)/;

// Lines carrying this marker are exempt. Use it only for the format-validation
// code itself, which must necessarily mention these shapes.
const ALLOW_MARKER = "compliance-allow";

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const isSql = file.endsWith(".sql");
  const lines = text.split(/\r?\n/);

  lines.forEach((line, i) => {
    const lineNo = i + 1;
    if (line.includes(ALLOW_MARKER)) return;

    const withoutComment = isSql
      ? line.replace(/--.*$/, "")
      : line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");

    if (isSql) {
      const decl = SQL_COLUMN_DECL.exec(withoutComment);
      if (decl && DOC_WORD.test(decl[1]) && !ALLOWED_COLUMNS.test(decl[1])) {
        report(
          file,
          lineNo,
          line,
          `Column "${decl[1]}" looks like storage for a document number. ` +
            `Only doc_type, format_valid and masked_hint may be persisted (§2.1).`,
        );
      }
    }

    if (AADHAAR_LITERAL.test(withoutComment)) {
      report(
        file,
        lineNo,
        line,
        "12-digit literal starting 2-9. Synthetic Aadhaar test values must " +
          "start with 0 or 1, which UIDAI never issues (§2.1).",
      );
    }

    if (PAN_LITERAL.test(withoutComment)) {
      report(
        file,
        lineNo,
        line,
        "PAN-shaped literal (AAAAA9999A). Do not embed document numbers (§2.1).",
      );
    }

    if (LIVE_KEY.test(withoutComment)) {
      report(
        file,
        lineNo,
        line,
        "Live payment provider key. This project uses test mode only (§2.2).",
      );
    }
  });
}

// ---------------------------------------------------------------------------
// 4. The DEMO banner is still mounted
// ---------------------------------------------------------------------------

const LAYOUT = join(ROOT, "src", "app", "layout.tsx");
if (!existsSync(LAYOUT)) {
  failures.push({
    file: "src/app/layout.tsx",
    lineNo: 0,
    line: "",
    message: "Root layout is missing; the DEMO banner cannot be verified.",
  });
} else {
  const layout = readFileSync(LAYOUT, "utf8");
  if (!/<DemoBanner\s*\/>/.test(layout)) {
    failures.push({
      file: "src/app/layout.tsx",
      lineNo: 0,
      line: "",
      message:
        "<DemoBanner /> is not rendered in the root layout. The demo notice " +
        "must appear on every page and cannot be removed (§1.1).",
    });
  }
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error("\nCompliance check FAILED\n");
  for (const f of failures) {
    console.error(`  ${f.file}:${f.lineNo}`);
    console.error(`    ${f.message}`);
    if (f.line) console.error(`    > ${f.line}`);
    console.error("");
  }
  console.error(
    `${failures.length} problem(s). These are legal constraints, not style ` +
      `rules — see docs/COMPLIANCE.md before changing anything here.\n`,
  );
  process.exit(1);
}

console.log(`Compliance check passed (${files.length} files scanned).`);
