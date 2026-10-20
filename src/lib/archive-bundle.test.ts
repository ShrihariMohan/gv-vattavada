import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  ARCHIVE_TABLES,
  buildArchiveBundle,
  buildSqlDump,
  computeDigest,
  crc32,
  verifyUploadedBundle,
  type ArchiveRows,
} from "./archive-bundle";

function rows(): ArchiveRows {
  const empty = Object.fromEntries(ARCHIVE_TABLES.map((t) => [t, []])) as unknown as ArchiveRows;
  return {
    ...empty,
    invoices: [
      { id: "i_b", business_id: "biz-rest", total_paise: 900, business_date: "2026-07-02", notes: "it's \"quoted\"" },
      { id: "i_a", business_id: "biz-rest", total_paise: 6000, business_date: "2026-07-01", extra: { k: 1 } },
    ],
    invoice_items: [{ id: "ii_1", invoice_id: "i_a", name: "Tea <hot> & co", qty: 3, amount_paise: 6000 }],
    payments: [{ id: "p_1", invoice_id: "i_a", amount_paise: 6000, method: "CASH", business_date: "2026-07-01" }],
  };
}

describe("Phase 6: archive bundle", () => {
  it("computes a stable digest independent of row order", async () => {
    const a = rows();
    const b = rows();
    b.invoices.reverse();
    expect(await computeDigest(a)).toEqual(await computeDigest(b));
    expect((await computeDigest(a)).invoices).toMatchObject({ count: 2, total_paise: 6900 });
  });

  it("writes a valid zip container (CRC-32 reference value)", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("verifies an untouched re-upload and rejects a tampered one", async () => {
    const bundle = await buildArchiveBundle("2026-07", rows());
    const files = bundle.files.map((f) => ({ name: f.name, data: f.data }));
    const ok = await verifyUploadedBundle(files, "2026-07");
    expect(ok.ok).toBe(true);

    const tampered = files.map((f) => (f.name.endsWith(".sql") ? { ...f, data: new TextEncoder().encode("drop table x;") } : f));
    const bad = await verifyUploadedBundle(tampered, "2026-07");
    expect(bad.ok).toBe(false);

    const wrongMonth = await verifyUploadedBundle(files, "2026-06");
    expect(wrongMonth.ok).toBe(false);
    const noManifest = await verifyUploadedBundle(files.filter((f) => !f.name.endsWith(".manifest.json")), "2026-07");
    expect(noManifest.ok).toBe(false);
  });

  it("escapes values in the SQL dump", () => {
    const sql = buildSqlDump("2026-07", rows(), "now");
    expect(sql).toContain(`'it''s "quoted"'`);
    expect(sql).toContain(`'{"k":1}'`);
    expect(sql.indexOf("public.invoices")).toBeLessThan(sql.indexOf("public.invoice_items"));
  });
});

/**
 * Cross-implementation check against the real SQL functions. Runs when PG_TEST_URL points at
 * a database prepared by scripts/migration/test-sql.sh (month 2026-07 must still be live).
 */
const PG = process.env.PG_TEST_URL;
describe.skipIf(!PG)("Phase 6: browser digest == server digest", () => {
  const psql = (sql: string) => execFileSync("psql", [PG!, "-At", "-c", sql], { encoding: "utf8" }).trim();
  it("matches archive_digest() for the same month", async () => {
    const month = process.env.PG_TEST_MONTH ?? "2026-07";
    const fetched = {} as ArchiveRows;
    for (const t of ARCHIVE_TABLES) fetched[t] = JSON.parse(psql(`select public.archive_month_rows('${month}', '${t}', '', 2000)`));
    const server = JSON.parse(psql(`select public.archive_digest('${month}')`));
    expect(await computeDigest(fetched)).toEqual(server);
    const bundle = await buildArchiveBundle(month, fetched);
    expect(bundle.manifest.digest).toEqual(server);
  });
});
