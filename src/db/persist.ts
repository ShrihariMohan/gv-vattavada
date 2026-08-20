import Dexie, { type Table } from "dexie";
import { createSeedState } from "@/domain/seed";
import { newEntityId } from "@/domain/service";
import type { AppState, Role } from "@/domain/types";

class LocalDb extends Dexie {
  snapshots!: Table<{ id: string; state: AppState }>;
  constructor() {
    super("vattavada-business-manager");
    this.version(1).stores({ snapshots: "id" });
  }
}

const db = typeof indexedDB === "undefined" ? null : new LocalDb();

export async function loadState(): Promise<AppState | null> {
  if (!db) return null;
  const row = await db.snapshots.get("primary");
  return row?.state ? normalizeState(row.state) : null;
}

export function normalizeState(state: AppState): AppState {
  for (const o of state.orders) {
    o.guest_name ??= "";
    o.guest_phone ??= "";
    o.room_number ??= "";
  }
  const contacts: Record<string, { name: string; email: string; address: string; phone: string }> = {
    "biz-stay-a": {
      name: "G.V Royal Residency",
      email: "stay@royalresidency.local",
      address: "Koviloor Bus Stand, Munnar, Idukki, Kerala 685505",
      phone: "+91 86089 33892, +91 88382 67578",
    },
    "biz-stay-b": {
      name: "G.V Cloudy Glenn Resort",
      email: "stay@cloudyglenn.local",
      address: "Vattavada, Munnar, Idukki, Kerala 685505",
      phone: "+91 86089 33892, +91 88382 67578",
    },
    "biz-rest": {
      name: "G.V Cloudy Kitchen",
      email: "hello@cloudykitchen.local",
      address: "Urkadu, Vattavada, Munnar, Idukki, Kerala 685505",
      phone: "+91 86089 33892, +91 87545 04478, +91 88382 67578",
    },
  };
  for (const b of state.businesses) {
    const next = contacts[b.id];
    if (next) Object.assign(b, next);
  }
  for (const p of state.products) {
    p.description ??= "";
    p.image_url ??= "";
    p.tags ??= [];
  }
  const seeded = createSeedState(state.currentDeviceId);
  for (const cat of seeded.productCategories) {
    if (!state.productCategories.some((c) => c.id === cat.id)) state.productCategories.push(cat);
  }
  for (const p of seeded.products) {
    const existing = state.products.find((x) => x.id === p.id);
    if (!existing) state.products.push(p);
    else {
      existing.name = p.name;
      existing.price_paise = p.price_paise;
      existing.category_id = p.category_id;
      existing.description = p.description;
      existing.image_url = p.image_url;
      existing.tags = [...p.tags];
      existing.tax_bps = p.tax_bps;
    }
  }
  for (const c of state.dailyClosings) {
    c.status ??= "CLOSED";
    c.reopened_at ??= null;
    c.reopen_reason ??= "";
  }
  const known: Role[] = [
    "ADMIN",
    "MANAGER",
    "STAFF",
    "RESTAURANT_MANAGER",
    "RESTAURANT_STAFF",
    "STAY_MANAGER",
    "STAY_STAFF",
  ];
  for (const u of state.users) {
    if (!known.includes(u.role)) u.role = "STAFF";
  }
  const extraUsers = createSeedState(state.currentDeviceId).users;
  for (const u of extraUsers) {
    if (!state.users.some((x) => x.username === u.username)) state.users.push(u);
  }
  state.lastPulledAt ??= null;
  remintDuplicateIds(state);
  return state;
}

/** Old sequential ids (`rec-1-DEVICE-…`) collided after reload; keep one row per id. */
function remintDuplicateIds(state: AppState) {
  const device = state.currentDeviceId || "dev";
  keepNewestAndRemint(state.orders, "ord", device);
  keepNewestAndRemint(state.orderItems, "oi", device);
  keepNewestAndRemint(state.invoices, "inv", device);
  keepNewestAndRemint(state.invoiceItems, "ii", device);
  keepNewestAndRemint(state.payments, "pay", device);
  keepNewestAndRemint(state.customers, "cust", device);
  keepNewestAndRemint(state.bookings, "bk", device);
}

function keepNewestAndRemint<T extends { id: string; updated_at?: string; created_at?: string }>(
  rows: T[],
  prefix: string,
  deviceId: string,
) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const list = groups.get(row.id) ?? [];
    list.push(row);
    groups.set(row.id, list);
  }
  for (const [, group] of groups) {
    if (group.length < 2) continue;
    const ranked = group.slice().sort((a, b) => {
      const ta = a.updated_at || a.created_at || "";
      const tb = b.updated_at || b.created_at || "";
      return tb.localeCompare(ta);
    });
    ranked.forEach((row, i) => {
      if (i === 0) return;
      row.id = newEntityId(prefix, deviceId);
    });
  }
}

export async function saveState(state: AppState): Promise<void> {
  if (!db) return;
  await db.snapshots.put({ id: "primary", state });
}
