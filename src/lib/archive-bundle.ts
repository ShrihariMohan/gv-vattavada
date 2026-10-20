/**
 * Monthly archive bundle, built entirely in the browser (no large payloads through Vercel):
 *   vbm-archive-YYYY-MM.xlsx           one sheet per table + a reconciliation sheet
 *   vbm-archive-YYYY-MM.sql            restorable INSERTs for the normalized schema
 *   vbm-archive-YYYY-MM.json           the raw rows (also what verification re-reads)
 *   vbm-archive-YYYY-MM.manifest.json  SHA-256 of the three files, counts, totals, digest
 */

export const ARCHIVE_TABLES = [
  "invoice_items",
  "payments",
  "ledger_entries",
  "expenses",
  "daily_closings",
  "shifts",
  "invoices",
  "order_items",
  "orders",
  "bookings",
] as const;
export type ArchiveTable = (typeof ARCHIVE_TABLES)[number];
export type ArchiveRows = Record<ArchiveTable, Record<string, unknown>[]>;

/** Restore order: parents before children (reverse of the purge order). */
const RESTORE_ORDER: ArchiveTable[] = [
  "bookings",
  "orders",
  "order_items",
  "invoices",
  "invoice_items",
  "payments",
  "expenses",
  "ledger_entries",
  "daily_closings",
  "shifts",
];

const MONEY_FIELD: Partial<Record<ArchiveTable, string>> = {
  invoices: "total_paise",
  bookings: "total_paise",
  payments: "amount_paise",
  expenses: "amount_paise",
  ledger_entries: "amount_paise",
  invoice_items: "amount_paise",
};

export type ArchiveDigest = Record<ArchiveTable, { count: number; total_paise: number; ids_sha256: string }>;

export type ArchiveManifest = {
  format: "vattavada-monthly-archive";
  version: 1;
  month: string;
  created_at: string;
  schema_version: string;
  files: { name: string; role: "xlsx" | "sql" | "json"; bytes: number; sha256: string }[];
  digest: ArchiveDigest;
};

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Byte-order ("C" collation) comparison, matching the SQL digest. */
function cCompare(a: string, b: string) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  const n = Math.min(ea.length, eb.length);
  for (let i = 0; i < n; i += 1) if (ea[i] !== eb[i]) return ea[i] - eb[i];
  return ea.length - eb.length;
}

/** Same algorithm as public.archive_digest(): count, money total, SHA-256 of sorted ids. */
export async function computeDigest(rows: ArchiveRows): Promise<ArchiveDigest> {
  const out = {} as ArchiveDigest;
  for (const t of ARCHIVE_TABLES) {
    const list = rows[t] ?? [];
    const field = MONEY_FIELD[t];
    const ids = list.map((r) => String(r.id)).sort(cCompare);
    out[t] = {
      count: list.length,
      total_paise: field ? list.reduce((a, r) => a + (Number(r[field]) || 0), 0) : 0,
      ids_sha256: await sha256Hex(ids.join(",")),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Minimal XLSX writer (stored ZIP + SpreadsheetML), no dependencies
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** ZIP archive with STORED entries (valid for XLSX; size is fine for one month of data). */
export function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // stored
    lv.setUint32(14, crc, true);
    lv.setUint32(18, f.data.length, true);
    lv.setUint32(22, f.data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    chunks.push(local, f.data);
    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, f.data.length, true);
    cv.setUint32(24, f.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cen.set(name, 46);
    central.push(cen);
    offset += local.length + f.data.length;
  }
  const centralSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((a, c) => a + c.length, 0));
  let p = 0;
  for (const c of all) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

function xmlEscape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

function colName(i: number) {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sheetXml(rows: Record<string, unknown>[], headerHint: string[] = []) {
  const headers = [...new Set([...headerHint, ...rows.flatMap((r) => Object.keys(r))])];
  const cell = (v: unknown, ref: string) => {
    if (v == null || v === "") return "";
    if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
    if (typeof v === "boolean") return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
    const text = typeof v === "object" ? JSON.stringify(v) : String(v);
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
  };
  const lines = [
    `<row r="1">${headers.map((h, i) => cell(h, `${colName(i)}1`)).join("")}</row>`,
    ...rows.map((r, ri) => `<row r="${ri + 2}">${headers.map((h, i) => cell(r[h], `${colName(i)}${ri + 2}`)).join("")}</row>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${lines.join("")}</sheetData></worksheet>`;
}

export function buildXlsx(sheets: { name: string; rows: Record<string, unknown>[] }[]): Uint8Array {
  const enc = new TextEncoder();
  const safe = sheets.map((s, i) => ({ ...s, name: s.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || `Sheet${i + 1}` }));
  const files = [
    {
      name: "[Content_Types].xml",
      data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${safe
        .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join("")}</Types>`),
    },
    {
      name: "_rels/.rels",
      data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    },
    {
      name: "xl/workbook.xml",
      data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${safe
        .map((s, i) => `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join("")}</sheets></workbook>`),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${safe
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join("")}</Relationships>`),
    },
    ...safe.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(sheetXml(s.rows)) })),
  ];
  return zipStore(files);
}

// ---------------------------------------------------------------------------
// SQL dump
// ---------------------------------------------------------------------------

function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "true" : "false";
  const text = typeof v === "object" ? JSON.stringify(v) : String(v);
  return `'${text.replace(/'/g, "''").replace(/\0/g, "")}'`;
}

/** Restorable into the normalized schema; ON CONFLICT DO NOTHING makes it safe to re-run. */
export type ArchiveReferences = { rooms?: Record<string, unknown>[] };

export function buildSqlDump(month: string, rows: ArchiveRows, createdAt: string, refs: ArchiveReferences = {}): string {
  const lines = [
    `-- vattavada monthly archive ${month} (normalized schema), created ${createdAt}`,
    `-- Restore: psql "$DB_URL" -v ON_ERROR_STOP=1 -f this-file.sql`,
    "begin;",
  ];
  for (const r of refs.rooms ?? []) {
    const cols = Object.keys(r);
    lines.push(
      `insert into public.rooms (${cols.map((c) => `"${c.replace(/"/g, "")}"`).join(", ")}) values (${cols
        .map((c) => sqlValue(r[c]))
        .join(", ")}) on conflict (id) do nothing;`,
    );
  }
  for (const t of RESTORE_ORDER) {
    const list = rows[t] ?? [];
    if (!list.length) continue;
    lines.push(`-- ${t}: ${list.length} rows`);
    for (const r of list) {
      const cols = Object.keys(r);
      lines.push(
        `insert into public.${t} (${cols.map((c) => `"${c.replace(/"/g, "")}"`).join(", ")}) values (${cols
          .map((c) => sqlValue(r[c]))
          .join(", ")}) on conflict (id) do nothing;`,
      );
    }
  }
  lines.push("commit;", "");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Bundle + verification
// ---------------------------------------------------------------------------

export type ArchiveBundle = {
  manifest: ArchiveManifest;
  files: { name: string; data: Uint8Array; mime: string }[];
};

export async function buildArchiveBundle(
  month: string,
  rows: ArchiveRows,
  refs: ArchiveReferences = {},
  schemaVersion = "normalized-v1",
): Promise<ArchiveBundle> {
  const createdAt = new Date().toISOString();
  const enc = new TextEncoder();
  const digest = await computeDigest(rows);
  const reconciliation = ARCHIVE_TABLES.map((t) => ({ table: t, rows: digest[t].count, total_paise: digest[t].total_paise, ids_sha256: digest[t].ids_sha256 }));
  const xlsx = buildXlsx([
    { name: "reconciliation", rows: [{ month, created_at: createdAt }, ...reconciliation] },
    { name: "bills", rows: rows.invoices },
    { name: "invoice items", rows: rows.invoice_items },
    { name: "payments", rows: rows.payments },
    { name: "expenses", rows: rows.expenses },
    { name: "bookings", rows: rows.bookings },
    { name: "ledger", rows: rows.ledger_entries },
    { name: "orders", rows: rows.orders },
    { name: "order items", rows: rows.order_items },
    { name: "daily closings", rows: rows.daily_closings },
    { name: "shifts", rows: rows.shifts },
  ]);
  const sql = enc.encode(buildSqlDump(month, rows, createdAt, refs));
  const json = enc.encode(JSON.stringify({ format: "vattavada-monthly-archive-data", version: 1, month, created_at: createdAt, rows, references: refs }));
  const base = `vbm-archive-${month}`;
  const files = [
    { name: `${base}.xlsx`, data: xlsx, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", role: "xlsx" as const },
    { name: `${base}.sql`, data: sql, mime: "application/sql", role: "sql" as const },
    { name: `${base}.json`, data: json, mime: "application/json", role: "json" as const },
  ];
  const manifest: ArchiveManifest = {
    format: "vattavada-monthly-archive",
    version: 1,
    month,
    created_at: createdAt,
    schema_version: schemaVersion,
    files: await Promise.all(files.map(async (f) => ({ name: f.name, role: f.role, bytes: f.data.length, sha256: await sha256Hex(f.data) }))),
    digest,
  };
  return {
    manifest,
    files: [
      ...files.map(({ name, data, mime }) => ({ name, data, mime })),
      { name: `${base}.manifest.json`, data: enc.encode(JSON.stringify(manifest, null, 2)), mime: "application/json" },
    ],
  };
}

export type VerifyResult = { ok: true; manifest: ArchiveManifest; digest: ArchiveDigest } | { ok: false; errors: string[] };

/**
 * Re-upload check: every file must hash to the manifest, and the data file must reproduce the
 * manifest digest. Only then is the digest sent to the server for comparison with live data.
 */
export async function verifyUploadedBundle(files: { name: string; data: Uint8Array }[], month: string): Promise<VerifyResult> {
  const errors: string[] = [];
  const manifestFile = files.find((f) => f.name.endsWith(".manifest.json"));
  if (!manifestFile) return { ok: false, errors: ["Select the .manifest.json file together with the .xlsx, .sql and .json files"] };
  let manifest: ArchiveManifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestFile.data));
  } catch {
    return { ok: false, errors: ["Manifest is not valid JSON"] };
  }
  if (manifest.format !== "vattavada-monthly-archive" || manifest.month !== month) {
    return { ok: false, errors: [`Manifest is not an archive for ${month}`] };
  }
  for (const expected of manifest.files) {
    const f = files.find((x) => x.name === expected.name) ?? files.find((x) => x.name.endsWith(`.${expected.role}`) && !x.name.endsWith(".manifest.json"));
    if (!f) {
      errors.push(`Missing ${expected.name}`);
      continue;
    }
    const hash = await sha256Hex(f.data);
    if (hash !== expected.sha256) errors.push(`${expected.name}: checksum does not match the manifest`);
    if (f.data.length !== expected.bytes) errors.push(`${expected.name}: size does not match the manifest`);
  }
  const dataFile = files.find((f) => f.name.endsWith(".json") && !f.name.endsWith(".manifest.json"));
  if (dataFile && !errors.length) {
    const parsed = JSON.parse(new TextDecoder().decode(dataFile.data)) as { rows: ArchiveRows; month: string };
    if (parsed.month !== month) errors.push("Data file is for a different month");
    const digest = await computeDigest(parsed.rows);
    if (JSON.stringify(digest) !== JSON.stringify(manifest.digest)) errors.push("Row counts/totals in the data file do not match the manifest");
    if (!errors.length) return { ok: true, manifest, digest };
  }
  return { ok: false, errors: errors.length ? errors : ["Data file missing"] };
}
