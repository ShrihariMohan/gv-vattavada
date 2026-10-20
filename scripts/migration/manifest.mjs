#!/usr/bin/env node
// Writes a manifest (SHA-256, bytes, baseline counts/totals) next to backup files.
// Usage: node scripts/migration/manifest.mjs --out backups/2026-10-20/manifest.json \
//          --baseline backups/2026-10-20/baseline-prod.json --device office-pc \
//          backups/2026-10-20/schema.sql backups/2026-10-20/data.sql backups/2026-10-20/cloud-export.sql
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return null;
  const [v] = args.splice(i, 2).slice(1);
  return v;
};
const out = opt("out") ?? "manifest.json";
const baselinePath = opt("baseline");
const device = opt("device") ?? null;
const schemaVersion = opt("schema-version") ?? "v1-json-sync";
if (!args.length) {
  console.error("usage: manifest.mjs --out manifest.json [--baseline baseline.json] [--device id] files...");
  process.exit(2);
}
const files = args.map((path) => {
  const buf = readFileSync(path);
  return {
    file: basename(path),
    bytes: statSync(path).size,
    sha256: createHash("sha256").update(buf).digest("hex"),
  };
});
const baseline = baselinePath ? JSON.parse(readFileSync(baselinePath, "utf8")) : null;
const manifest = {
  format: "vattavada-migration-backup-manifest",
  version: 1,
  exported_at: new Date().toISOString(),
  schema_version: schemaVersion,
  device_id: device,
  files,
  row_counts: baseline?.by_entity ?? null,
  totals_paise: baseline?.totals_paise_by_business_month ?? null,
};
writeFileSync(out, JSON.stringify(manifest, null, 2));
console.log(`wrote ${out} (${files.length} files)`);
