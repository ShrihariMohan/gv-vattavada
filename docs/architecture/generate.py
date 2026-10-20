#!/usr/bin/env python3
"""
Generates the architecture diagrams from one layout spec:

  docs/architecture/overview.excalidraw   open at https://excalidraw.com (File -> Open)
  docs/architecture/overview.svg          preview rendered on GitHub
  docs/architecture/flows.excalidraw
  docs/architecture/flows.svg

Run:  python3 docs/architecture/generate.py
Edit the diagrams either here (then regenerate) or directly in Excalidraw.
"""
import json
import os
import random
from html import escape

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_SIZE = 16
LINE_H = 1.25
CHAR_W = 0.56  # average glyph width / font size for Helvetica-like fonts

PALETTE = {
    "device": ("#1971c2", "#e7f5ff"),
    "storage": ("#2f9e44", "#ebfbee"),
    "server": ("#e8590c", "#fff4e6"),
    "db": ("#6741d9", "#f3f0ff"),
    "legacy": ("#868e96", "#f1f3f5"),
    "admin": ("#c2255c", "#fff0f6"),
    "note": ("#495057", "#fff9db"),
    "frame": ("#343a40", "transparent"),
    "step": ("#1971c2", "#ffffff"),
    "ok": ("#2f9e44", "#ebfbee"),
    "warn": ("#e03131", "#fff5f5"),
}


class Diagram:
    def __init__(self, name):
        self.name = name
        self.elements = []
        self.svg = []
        self.rng = random.Random(name)
        self.max_x = 0
        self.max_y = 0

    # -- primitives ---------------------------------------------------------
    def _id(self, prefix):
        return f"{prefix}-{len(self.elements)}-{self.rng.randrange(1 << 30):x}"

    def _base(self, kind, x, y, w, h, stroke, bg, **extra):
        el = {
            "id": self._id(kind),
            "type": kind,
            "x": x, "y": y, "width": w, "height": h,
            "angle": 0,
            "strokeColor": stroke,
            "backgroundColor": bg,
            "fillStyle": "solid",
            "strokeWidth": 2,
            "strokeStyle": "solid",
            "roughness": 0,
            "opacity": 100,
            "groupIds": [],
            "frameId": None,
            "roundness": {"type": 3} if kind in ("rectangle",) else None,
            "strokeSharpness": "round" if kind == "rectangle" else "sharp",
            "seed": self.rng.randrange(1 << 31),
            "version": 1,
            "versionNonce": self.rng.randrange(1 << 31),
            "isDeleted": False,
            "boundElements": [],
            "updated": 1792500000000,
            "link": None,
            "locked": False,
        }
        el.update(extra)
        self.elements.append(el)
        if kind != "arrow":
            self.max_x = max(self.max_x, x + w)
            self.max_y = max(self.max_y, y + h)
        return el

    def text(self, x, y, txt, size=FONT_SIZE, color="#1e1e1e", align="left", container=None, w=None, bold=False, title_color=None):
        lines = txt.split("\n")
        width = w or max(len(l) for l in lines) * size * CHAR_W
        height = len(lines) * size * LINE_H
        el = self._base(
            "text", x, y, width, height, color, "transparent",
            text=txt, originalText=txt, fontSize=size, fontFamily=2,
            textAlign=align, verticalAlign="middle" if container else "top",
            containerId=container["id"] if container else None,
            lineHeight=LINE_H, autoResize=True,
            baseline=round(size * 0.9 + (len(lines) - 1) * size * LINE_H),
        )
        el["roundness"] = None
        if container:
            container["boundElements"].append({"type": "text", "id": el["id"]})
        anchor = {"left": "start", "center": "middle", "right": "end"}[align]
        tx = {"left": x, "center": x + width / 2, "right": x + width}[align]
        for i, line in enumerate(lines):
            ty = y + size * (i + 0.85) * LINE_H - size * 0.15
            is_title = title_color is not None and i == 0
            weight = ' font-weight="bold"' if (bold or is_title) else ""
            fill = title_color if is_title else color
            self.svg.append(
                f'<text x="{tx:.1f}" y="{ty:.1f}" font-size="{size}" fill="{fill}" text-anchor="{anchor}"{weight}>{escape(line)}</text>'
            )
        return el

    def box(self, x, y, w, txt, kind="step", h=None, size=FONT_SIZE, align="center", shape="rectangle", dashed=False, title=None):
        stroke, bg = PALETTE[kind]
        lines = txt.split("\n")
        if title:
            lines = [title] + lines
        content_h = len(lines) * size * LINE_H
        h = h or content_h + 24
        el = self._base(shape, x, y, w, h, stroke, bg, strokeStyle="dashed" if dashed else "solid")
        if shape == "diamond":
            pts = f"{x + w / 2},{y} {x + w},{y + h / 2} {x + w / 2},{y + h} {x},{y + h / 2}"
            self.svg.append(f'<polygon points="{pts}" fill="{bg}" stroke="{stroke}" stroke-width="2"/>')
        else:
            dash = ' stroke-dasharray="8 6"' if dashed else ""
            self.svg.append(
                f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{bg}" stroke="{stroke}" stroke-width="2"{dash}/>'
            )
        body = "\n".join(lines)
        tx = x + 10 if align == "left" else x
        tw = w - 20 if align == "left" else w
        ty = y + (h - content_h) / 2
        t = self.text(tx, ty, body, size=size, align=align, container=el, w=tw, title_color=stroke if title else None)
        el["_text"] = t
        return el

    def frame(self, x, y, w, h, label, kind="frame"):
        stroke, _ = PALETTE[kind]
        el = self._base("rectangle", x, y, w, h, stroke, "transparent", strokeStyle="dashed", strokeWidth=2)
        el["roundness"] = None
        el["strokeSharpness"] = "sharp"
        self.svg.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="none" stroke="{stroke}" stroke-width="2" stroke-dasharray="10 8"/>'
        )
        self.text(x + 16, y + 10, label, size=20, color=stroke, bold=True)
        return el

    def arrow(self, a, b, label=None, side=("bottom", "top"), dashed=False, color="#495057", via=None, label_at=0.5, both=False, label_seg=None):
        def anchor(el, s):
            x, y, w, h = el["x"], el["y"], el["width"], el["height"]
            return {
                "top": (x + w / 2, y), "bottom": (x + w / 2, y + h),
                "left": (x, y + h / 2), "right": (x + w, y + h / 2),
            }[s] if isinstance(s, str) else (x + s[0] * w, y + s[1] * h)

        sx, sy = anchor(a, side[0])
        ex, ey = anchor(b, side[1])
        pts = [(sx, sy)] + (via or []) + [(ex, ey)]
        rel = [[px - sx, py - sy] for px, py in pts]
        xs = [p[0] for p in rel]
        ys = [p[1] for p in rel]
        el = self._base(
            "arrow", sx, sy, max(xs) - min(xs), max(ys) - min(ys), color, "transparent",
            strokeStyle="dashed" if dashed else "solid",
            points=rel, lastCommittedPoint=None,
            startBinding={"elementId": a["id"], "focus": 0, "gap": 4},
            endBinding={"elementId": b["id"], "focus": 0, "gap": 4},
            startArrowhead="arrow" if both else None, endArrowhead="arrow",
        )
        el["roundness"] = None if via else {"type": 2}
        el["strokeSharpness"] = "sharp" if via else "round"
        el["elbowed"] = False
        self.max_x = max(px for px, _ in pts)  if max(px for px, _ in pts) > self.max_x else self.max_x
        self.max_y = max(py for _, py in pts) if max(py for _, py in pts) > self.max_y else self.max_y
        a["boundElements"].append({"type": "arrow", "id": el["id"]})
        b["boundElements"].append({"type": "arrow", "id": el["id"]})
        dash = ' stroke-dasharray="8 6"' if dashed else ""
        poly = " ".join(f"{px:.1f},{py:.1f}" for px, py in pts)
        start = ' marker-start="url(#arrowS)"' if both else ""
        self.svg.append(
            f'<polyline points="{poly}" fill="none" stroke="{color}" stroke-width="2"{dash}{start} marker-end="url(#arrow)"/>'
        )
        if label:
            # place the label on the longest segment
            segs = list(zip(pts, pts[1:]))
            if label_seg is not None:
                (x1, y1), (x2, y2) = segs[label_seg]
            else:
                (x1, y1), (x2, y2) = max(segs, key=lambda s: abs(s[1][0] - s[0][0]) + abs(s[1][1] - s[0][1]))
            mx, my = x1 + (x2 - x1) * label_at, y1 + (y2 - y1) * label_at
            lines = label.split("\n")
            lw = max(len(l) for l in lines) * 13 * CHAR_W + 8
            lh = len(lines) * 13 * LINE_H + 4
            self.svg.append(f'<rect x="{mx - lw / 2:.1f}" y="{my - lh / 2:.1f}" width="{lw:.1f}" height="{lh:.1f}" fill="#ffffff" opacity="0.92"/>')
            self.text(mx - lw / 2 + 4, my - lh / 2 + 2, label, size=13, color=color, align="center", w=lw - 8)
        return el

    # -- output ------------------------------------------------------------
    def save(self):
        for el in self.elements:
            el.pop("_text", None)
        doc = {
            "type": "excalidraw",
            "version": 2,
            "source": "https://excalidraw.com",
            "elements": self.elements,
            "appState": {"gridSize": None, "viewBackgroundColor": "#ffffff"},
            "files": {},
        }
        with open(os.path.join(HERE, f"{self.name}.excalidraw"), "w") as f:
            json.dump(doc, f, indent=1)
        w, h = self.max_x + 40, self.max_y + 40
        svg = [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.0f}" height="{h:.0f}" viewBox="0 0 {w:.0f} {h:.0f}" '
            'font-family="Helvetica, Arial, sans-serif">',
            '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">'
            '<path d="M0,0 L10,5 L0,10 z" fill="#495057"/></marker>'
            '<marker id="arrowS" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">'
            '<path d="M0,0 L10,5 L0,10 z" fill="#495057"/></marker></defs>',
            f'<rect width="{w:.0f}" height="{h:.0f}" fill="#ffffff"/>',
            *self.svg,
            "</svg>",
        ]
        with open(os.path.join(HERE, f"{self.name}.svg"), "w") as f:
            f.write("\n".join(svg))
        print(f"wrote {self.name}.excalidraw and {self.name}.svg ({len(self.elements)} elements)")


# =============================================================================
# 1. Overview
# =============================================================================
def overview():
    d = Diagram("overview")
    d.text(40, 20, "Vattavada Business Manager: architecture overview (normalized sync, Oct 2026)", size=26, bold=True)
    d.text(40, 58, "Offline-first PWA on every device  ->  Next.js API on Vercel (Hobby)  ->  Supabase Postgres (Free, 500 MB)", size=16, color="#495057")

    # ---------------- Device column (x 30..630) ----------------
    d.frame(30, 100, 600, 1270, "DEVICE  (PWA: POS tablet, office PC, phones)")
    pages = d.box(60, 150, 540, "POS · Orders · Invoices · Payments · Bookings · Rooms\nExpenses · Ledger · Closing · Dashboard · Reports · Settings",
                  "device", title="React pages (Next.js app router, client components)")
    provider = d.box(60, 260, 540,
                     "renders from local data at once (never waits for the cloud)\nsync loop: on open · online · every 15 s · 'Sync now' · SW message\nheader badge: Syncing… / N pending / N failed",
                     "device", title="AppProvider + Shell", align="left")
    service = d.box(60, 400, 540,
                    "in-memory AppState · domain rules · integer paise · Asia/Kolkata dates\nevery mutation -> outbox item (mutation_id = queue id)\npush: batches ≤100 / 512 KB · pull: cursor, else legacy",
                    "device", title="AppService (src/domain/service.ts)", align="left")
    persist = d.box(60, 540, 540,
                    "first launch: copy legacy snapshot -> entity stores, validate, resume\nEntityWriter: writes only changed rows · restores array order\nkill switch 'Use legacy storage' · recovery points every 15 min",
                    "storage", title="persist.ts + entity-store.ts", align="left")
    entity = d.box(60, 680, 540,
                   "customers · products · rooms · tables · bookings · orders · orderItems\ninvoices · invoiceItems · payments · expenses · ledger · dailyClosings\nshifts · auditLogs · conflicts  (indexed: business+date, parent id…)\noutbox · catalog · sync_meta (cursor, order.*) · archive_manifests",
                   "storage", title="IndexedDB  vattavada-business-manager-entities", align="left")
    legacy_idb = d.box(60, 960, 540,
                       "snapshots.primary: never cleared by the migration; persist.ts mirrors\nstate into it every 5 min for 30 days (rollback to the old client)\nsnapshots.recovery-*: 5 newest recovery points (every 15 min)",
                       "legacy", title="IndexedDB  vattavada-business-manager  (v2, legacy)", align="left")
    repo = d.box(60, 840, 260, "indexed page queries\n(invoicesByDate, paymentsByDate…)", "storage", title="repository.ts")
    d.box(340, 840, 260, "offline shell + public pages\nBackground Sync -> AppProvider", "device", title="Service worker")
    admin = d.box(60, 1100, 540,
                  "admin token (x-admin-token) · flags · backfill · reconcile · parity\nmonthly archive: download -> verify re-upload -> archive",
                  "admin", title="Settings → Data migration & archive (ADMIN)", align="left")
    bundle = d.box(60, 1220, 260, "XLSX · SQL · JSON · manifest\n(SHA-256 + digest)", "admin", title="archive-bundle.ts")
    disks = d.box(340, 1220, 260, "two copies on\nseparate disks", "note", title="Office computer")

    d.arrow(pages, provider)
    d.arrow(provider, service)
    d.arrow(service, persist)
    d.arrow(persist, entity)
    d.arrow(persist, legacy_idb, side=((1, 0.75), (1, 0.5)), via=[(615, 600), (615, 1012)], dashed=True)
    d.arrow(entity, repo, side=((0.24, 1), "top"))
    d.arrow(admin, bundle, side=((0.24, 1), "top"))
    d.arrow(bundle, disks, side=("right", "left"))

    # ---------------- Server column (x 790..1350) ----------------
    d.frame(790, 100, 560, 1270, "VERCEL  (Next.js 16 route handlers, service role key)")
    sync = d.box(820, 150, 500,
                 "GET  ?health=1      configured · cursor_sync · sql_reports\nGET  ?after=SEQ     cursor page (≤500) + next_cursor · 409 resync\nGET  ?since=TS      legacy timestamp pull (old clients)\nPOST {items[≤100]}  one transaction per batch · 413 if too big",
                 "server", title="/api/sync", align="left")
    d.box(820, 330, 500, "legacy cloud SQL dump (Phase 0 backup)", "server", title="/api/sync/export")
    migr = d.box(820, 430, 500,
                 "status · reconcile · backfill (7 s budget, resumable)\nretry-quarantine · set-flag (guards legacy_writes off)",
                 "admin", title="/api/admin/migration   (x-admin-token)", align="left")
    reports = d.box(820, 560, 500,
                    "dashboard · analytics · items · item-trends · sales-by-time\npayment-mix · reconciliation · stay   (one RPC per screen)\nused by the Dashboard when sql_reports is on",
                    "admin", title="/api/reports   (x-admin-token)", align="left")
    archive = d.box(820, 710, 500,
                    "status · rows (keyset pages) · references · digest\nverify (digest match) · archive (summaries + bounded purge)",
                    "admin", title="/api/admin/archive   (x-admin-token)", align="left")
    d.box(820, 840, 500,
          "feature flags from DB (cached 15 s)\nSYNC_FORCE_LEGACY=true -> behave like the old app\nSYNC_ADMIN_TOKEN (timing-safe compare) · request limits",
          "server", title="lib/sync-server.ts", align="left")
    d.box(820, 980, 500,
          "if the sync RPCs are missing (migrations not applied yet)\n/api/sync upserts sync_records exactly like before",
          "legacy", title="Pre-migration fallback", align="left")
    d.box(820, 1100, 500,
          "/api/sync itself has no auth (existing behaviour).\nAdd device authentication before relying on the cloud copy.",
          "warn", title="Known gap", align="left")

    # ---------------- Database column (x 1430..2090) ----------------
    d.frame(1430, 100, 660, 1270, "SUPABASE POSTGRES  (RLS on; anon/authenticated denied)")
    legacy_db = d.box(1460, 150, 600, "sync_records (entity_type, entity_id, payload JSONB)\nbusinesses", "legacy",
                      title="Legacy (kept read/write until legacy_writes = off)", align="left")
    norm = d.box(1460, 260, 600,
                 "customers · product_categories · products · restaurant_tables · rooms\nbookings · orders · order_items · invoices · invoice_items · payments\nexpenses · ledger_entries · daily_closings · shifts\n+ created/updated/deleted_at · device_id · version · extra JSONB\n+ change_seq  (trigger: advisory lock + one global sequence)\n+ FKs ON DELETE RESTRICT · partial/composite indexes",
                 "db", title="Normalized tables (text ids, paise, business dates)", align="left")
    d.box(1460, 610, 600,
          "tombstones (DELETED / ARCHIVED) · applied_mutations (idempotency)\nmigration_quarantine · migration_checkpoints · sync_devices (cursor)\nfeature_flags: dual_write · normalized_reads · sql_reports · legacy_writes\nsync_entity_map (entity -> table, apply rank, financial?)",
          "db", title="Sync bookkeeping", align="left")
    rpc = d.box(1460, 470, 600,
                "sync_apply_batch  ·  sync_apply_entity  ·  sync_quarantine / retry\nsync_pull · sync_ack_cursor · sync_backfill · sync_reconcile\nsync_flag_invoice_mismatches",
                "db", title="Sync functions (service_role only)", align="left")
    analytics = d.box(1460, 780, 600,
                      "report_dashboard · report_analytics · report_item_sales\nreport_item_trends · report_sales_by_time · report_payment_mix\nreport_reconciliation · report_stay · refresh_monthly_summaries\nmonthly_business_summary · monthly_item_summary (kept forever)",
                      "db", title="Analytics", align="left")
    arch_db = d.box(1460, 960, 600,
                    "archive_scope · archive_digest · archive_month_rows · archive_reference_rows\narchive_verify · archive_begin · archive_purge_step · archive_status\narchive_months · archive_verifications · db_size_report (300/400/500 MB)",
                    "db", title="Archive & retention (live = current + previous 2 months)", align="left")
    d.box(1460, 1120, 600,
          "supabase/migrations/2026102000{0000,0100,0200,0300,0400}_*.sql\nsupabase db push · tests: npm run test:sql",
          "note", title="Source of truth", align="left")

    # ---------------- device <-> server ----------------
    d.arrow(service, sync, side=((1, 0.3), (0, 0.3)), via=[(690, 431), (690, 195)], label="POST batch\n(mutation_id)", label_seg=1)
    d.arrow(sync, service, side=((0, 0.75), (1, 0.7)), via=[(750, 240), (750, 470)], label="cursor pages\n+ acks", label_seg=1)
    d.arrow(admin, migr, side=((1, 0.3), (0, 0.5)), via=[(700, 1117), (700, 480)], dashed=True, label="admin", label_seg=1, label_at=0.15)
    d.arrow(admin, archive, side=((1, 0.7), (0, 0.5)), via=[(740, 1140), (740, 750)], dashed=True)

    # ---------------- server <-> database ----------------
    d.arrow(sync, rpc, side=((1, 0.3), (0, 0.3)), via=[(1415, 195), (1415, 500)], label="rpc", label_seg=1, label_at=0.3)
    d.arrow(migr, rpc, side=((1, 0.4), (0, 0.6)), via=[(1400, 465), (1400, 530)])
    d.arrow(reports, analytics, side=((1, 0.4), (0, 0.4)), via=[(1385, 600), (1385, 815)])
    d.arrow(archive, arch_db, side=((1, 0.4), (0, 0.4)), via=[(1370, 740), (1370, 1000)])
    d.arrow(rpc, legacy_db, side=((1, 0.3), (1, 0.5)), via=[(2075, 500), (2075, 185)], label="same\ntransaction", label_seg=1)
    d.arrow(rpc, norm, side=((0.5, 0), (0.5, 1)))
    d.save()


# =============================================================================
# 2. Flows
# =============================================================================
def lane(d, y, title, steps, kind="step", width=250, gap=40, x0=60, alt_last=False):
    d.text(x0, y, title, size=20, bold=True, color="#343a40")
    boxes = []
    x = x0
    texts = [s if isinstance(s, str) else s[0] for s in steps]
    hmax = max(len(t.split("\n")) for t in texts) * 14 * LINE_H + 24
    for s in steps:
        txt, k = (s, kind) if isinstance(s, str) else s
        boxes.append(d.box(x, y + 36, width, txt, k, align="left", size=14, h=hmax))
        x += width + gap
    pairs = list(zip(boxes, boxes[1:]))
    for i, (a, b) in enumerate(pairs):
        alt = alt_last and i == len(pairs) - 1
        d.arrow(a, b, side=("right", "left"), dashed=alt)
    return boxes, y + 36 + hmax


def flows():
    d = Diagram("flows")
    d.text(40, 20, "Vattavada Business Manager: end-to-end flows", size=26, bold=True)
    d.text(40, 58, "Read each lane left to right. Green = data is safe/durable at that point, red = failure or guard path, dashed arrow = alternative path.", size=16, color="#495057")

    y = 110
    _, y = lane(d, y, "1. Startup and first-launch storage migration (per device)", [
        "App opens\nAppProvider.loadState()",
        "Entity stores complete?\nyes -> load rows, restore\narray order, prime writer",
        "no: read legacy snapshot\ncopy all arrays + outbox\nin ONE Dexie transaction",
        "Validate: counts · ids ·\nmoney totals · outbox\nfail -> stay on legacy",
        ("migration_complete\nlegacy kept + mirrored\nfor 30 days", "ok"),
        "Render immediately\nthen background sync\n(health -> push -> pull)",
    ])

    y += 50
    _, y = lane(d, y, "2. Write path: offline-first mutation -> cloud (push)", [
        "Staff action (bill, payment,\nexpense, booking…)\nAppService mutates state",
        ("Outbox item\nmutation_id = queue id\nsaved via EntityWriter", "ok"),
        "Batch: dependency order\n≤100 items / 512 KB\nPOST /api/sync",
        "sync_apply_batch\n(one transaction, advisory\nlock, item = savepoint)",
        "per item: replay? -> ack\nstale financial edit from\nother device -> CONFLICT",
        "dual_write: normalized row\n(+ quarantine on FK/type\nerror) + sync_records",
        ("Ack per mutation_id\nSYNCED -> prune outbox\nFAILED -> backoff retry", "ok"),
    ], width=225, gap=30)

    y += 50
    _, y = lane(d, y, "3. Read path: cursor pull (normalized_reads = on)", [
        "GET /api/sync?after=SEQ\n&limit=500&device_id",
        "sync_pull: rows with\nchange_seq > SEQ across\nall tables + ARCHIVED tombs",
        "Device applies page:\nskip pending local rows,\nkeep newer updated_at",
        "PURGE -> drop local row\nDELETE -> soft delete\nUPSERT -> insert/replace",
        ("Store syncCursor\nack recorded for device\nloop while has_more", "ok"),
        ("cursor unknown -> 409\nresync from 0 (explicit)\nflag off -> legacy pull", "warn"),
    ], alt_last=True)

    y += 50
    _, y = lane(d, y, "4. Rollout (no downtime) and rollback", [
        "Phase 0: baseline +\naudit + 3 backups +\nrestore rehearsal",
        "Phase 1: supabase db push\n(additive; flags all off)",
        "Phase 2: deploy · backfill\n· reconcile · dual_write on\n7 clean days",
        "Phase 3: canary device\n(entity stores) then all\ndevices",
        "Phase 4: normalized_reads\non · later legacy_writes\noff (guarded)",
        "Phase 5: parity check\n-> sql_reports on",
        ("Rollback any time: flags\noff or SYNC_FORCE_LEGACY\n+ previous client", "warn"),
    ], width=225, gap=30)

    y += 50
    _, y = lane(d, y, "5. Reports (server SQL, one RPC per screen)", [
        "Dashboard/Reports page\n(admin token +\nsql_reports flag)",
        "GET /api/reports\n?report=…&from&to\nvalidated params",
        "report_* function:\nlive detail for live months\nsummaries for archived",
        "Small JSON (<200 KB)\nback to the page",
        ("Otherwise: instant local\nfigures from AppState", "ok"),
    ], alt_last=True)

    y += 50
    _, y = lane(d, y, "6. Monthly archive and retention (admin, no cron)", [
        "Reminder: month older\nthan current + previous 2\n(or DB > 300/400 MB)",
        "Download: keyset pages\n-> XLSX + SQL + JSON +\nmanifest (SHA-256, digest)",
        ("Save two copies on\nseparate disks", "ok"),
        "Re-upload all 4 files:\nhashes + digest checked\nin browser",
        "archive_verify: digest ==\nlive data? store\nverification",
        "archive_begin: re-check,\nwrite monthly summaries,\nmark month archived",
        "archive_purge_step: delete\nchildren -> parents in\nbatches (carry-overs kept)",
        ("Tombstones -> devices\nPURGE · then VACUUM\nANALYZE (manual)", "ok"),
    ], width=205, gap=26)

    y += 50
    d.box(60, y, 1700,
          "Conflict rule: financial rows (invoice, invoice_item, payment, expense, ledger, daily_closing) with an older version from another device -> CONFLICT, nothing written, shown in Settings → Conflicts.\n"
          "Same device sending an older copy (late retry) -> SUPERSEDED (acked).  Catalog rows (customers, products, rooms, tables…) -> last writer wins by version, then updated_at.\n"
          "Two devices closing the same day: latest CLOSED row wins, the other points to it via superseded_by (never deleted).  Bad legacy totals are imported as-is and flagged (legacy_mismatch).",
          "note", align="left", size=14, title="Rules applied by the server")
    d.save()


if __name__ == "__main__":
    overview()
    flows()
