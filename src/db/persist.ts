import Dexie, { type Table } from "dexie";
import type { AppState } from "@/domain/types";

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
  const names: Record<string, { name: string; email: string }> = {
    "biz-stay-a": { name: "Royal Residency", email: "stay@royalresidency.local" },
    "biz-stay-b": { name: "Cloudy Glenn Resort", email: "stay@cloudyglenn.local" },
    "biz-rest": { name: "Cloudy Kitchen", email: "hello@cloudykitchen.local" },
  };
  for (const b of state.businesses) {
    const next = names[b.id];
    if (next) {
      b.name = next.name;
      b.email = next.email;
    }
  }
  return state;
}

export async function saveState(state: AppState): Promise<void> {
  if (!db) return;
  await db.snapshots.put({ id: "primary", state });
}
