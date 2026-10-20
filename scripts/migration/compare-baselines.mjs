#!/usr/bin/env node
// Compares two phase0-baseline JSON outputs. Exits 1 on any difference that matters.
// Usage: node scripts/migration/compare-baselines.mjs baseline-prod.json baseline-restored.json
import { readFileSync } from "node:fs";

const [a, b] = process.argv.slice(2).map((p) => JSON.parse(readFileSync(p, "utf8")));
if (!a || !b) {
  console.error("usage: compare-baselines.mjs expected.json actual.json");
  process.exit(2);
}
const ignore = new Set(["generated_at", "database_bytes"]);
const diffs = [];
function walk(x, y, path) {
  if (ignore.has(path.at(-1))) return;
  if (typeof x !== typeof y || Array.isArray(x) !== Array.isArray(y)) {
    diffs.push(`${path.join(".")}: ${JSON.stringify(x)} != ${JSON.stringify(y)}`);
    return;
  }
  if (x && typeof x === "object") {
    const keys = new Set([...Object.keys(x), ...Object.keys(y ?? {})]);
    for (const k of keys) walk(x[k], y?.[k], [...path, k]);
    return;
  }
  if (x !== y) diffs.push(`${path.join(".")}: ${JSON.stringify(x)} != ${JSON.stringify(y)}`);
}
walk(a, b, []);
if (diffs.length) {
  console.error(`MISMATCH (${diffs.length})`);
  for (const d of diffs.slice(0, 200)) console.error("  " + d);
  process.exit(1);
}
console.log("baselines match: counts, timestamps and financial totals are identical");
