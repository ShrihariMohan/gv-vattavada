import { describe, expect, it } from "vitest";
import { createSeedState } from "./seed";
import { AppService, MemorySupabaseAdapter } from "./service";
import { syncQueueDependencyOrder } from "./rules";
import type { SyncQueueItem } from "./types";

function svc(iso = "2026-08-19T16:00:00.000Z") {
  const s = new AppService(createSeedState(), () => new Date(iso));
  s.login("admin", "admin123");
  s.setOnline(false);
  return s;
}

describe("order guest / phone / room", () => {
  it("links an existing customer by phone and a stay room", () => {
    const s = svc();
    const order = s.startOrder({
      business_id: "biz-rest",
      table_id: "table-4",
      guest_name: "",
      guest_phone: "9876543210",
      room_number: "101",
    });
    expect(order.customer_id).toBe("cust-1");
    expect(order.guest_name).toBe("Arun Kumar");
    expect(order.room_number).toBe("101");
    expect(order.guest_phone).toBe("9876543210");
  });

  it("creates a customer for a new phone and rejects unknown rooms", () => {
    const s = svc();
    const order = s.startOrder({
      business_id: "biz-rest",
      guest_name: "Nisha",
      guest_phone: "9000000001",
    });
    expect(s.state.customers.some((c) => c.phone.includes("9000000001"))).toBe(true);
    expect(order.customer_id).toBeTruthy();
    expect(() => s.startOrder({ business_id: "biz-rest", room_number: "999" })).toThrow(/not found/);
  });

  it("does not start a second order on an occupied table", () => {
    const s = svc();
    expect(() => s.startOrder({ business_id: "biz-rest", table_id: "table-2" })).toThrow(/already has an open order/);
  });
});

describe("order delete", () => {
  it("cancels and soft-deletes an open order and queues item deletes first", () => {
    const s = svc();
    const order = s.startOrder({ business_id: "biz-rest", table_id: "table-4" });
    s.addOrderItem(order.id, "p-tea", 2);
    s.deleteOrder(order.id);
    const gone = s.state.orders.find((o) => o.id === order.id)!;
    expect(gone.status).toBe("CANCELLED");
    expect(gone.deleted_at).toBeTruthy();
    expect(s.state.tables.find((t) => t.id === "table-4")?.status).toBe("AVAILABLE");
    const pending = s.state.syncQueue.filter((q) => q.entity_id === order.id || q.payload.includes(order.id));
    const ordered = syncQueueDependencyOrder(
      s.state.syncQueue.filter((q) => q.operation === "DELETE") as SyncQueueItem[],
    );
    const types = ordered.map((q) => q.entity_type);
    expect(types.indexOf("order_item")).toBeLessThan(types.indexOf("order"));
  });

  it("refuses to delete a billed order", () => {
    const s = svc();
    const order = s.startOrder({ business_id: "biz-rest" });
    s.addOrderItem(order.id, "p-tea", 1);
    s.generateBill({
      orderId: order.id,
      payments: [{ method: "CASH", amount_paise: s.orderTotals(order.id).total_paise }],
    });
    expect(() => s.deleteOrder(order.id)).toThrow(/Void the invoice/);
  });
});

describe("products and closing edits", () => {
  it("creates and edits products without changing in-progress line prices", () => {
    const s = svc();
    const p = s.createProduct({
      business_id: "biz-rest",
      category_id: "cat-3",
      name: "Filter Coffee",
      price_paise: 2500,
      tax_bps: 500,
    });
    const order = s.startOrder({ business_id: "biz-rest" });
    const item = s.addOrderItem(order.id, p.id, 1);
    s.updateProduct(p.id, { price_paise: 4000, name: "Filter Coffee Large" });
    expect(item.unit_price_paise).toBe(2500);
    expect(s.state.products.find((x) => x.id === p.id)?.price_paise).toBe(4000);
    expect(s.state.products.find((x) => x.id === p.id)?.sync_status).toBe("PENDING");
  });

  it("staff cannot edit products", () => {
    const s = svc();
    s.logout();
    s.login("staff", "staff123");
    expect(() =>
      s.createProduct({ business_id: "biz-rest", category_id: "cat-3", name: "X", price_paise: 100, tax_bps: 0 }),
    ).toThrow(/Forbidden/);
  });

  it("edits a daily closing as a correction and syncs UPDATE after CREATE", async () => {
    const s = svc();
    const close = s.closeDay("biz-rest", 10000);
    const edited = s.updateDailyClosing(close.id, 12000);
    expect(edited.actual_cash_paise).toBe(12000);
    expect(edited.difference_paise).toBe(12000 - close.expected_cash_paise);
    const ops = s.state.syncQueue.filter((q) => q.entity_type === "daily_closing").map((q) => q.operation);
    expect(ops).toEqual(["CREATE", "UPDATE"]);
    const adapter = new MemorySupabaseAdapter();
    s.setOnline(true);
    const result = await s.processSyncQueue(adapter);
    expect(result.every((r) => r.ok)).toBe(true);
    expect(s.state.dailyClosings.find((c) => c.id === close.id)?.sync_status).toBe("SYNCED");
  });

  it("reopens a closed day and syncs UPDATE", async () => {
    const s = svc();
    const close = s.closeDay("biz-rest", 10000);
    const opened = s.reopenDay(close.id, "Late walk-in");
    expect(opened.status).toBe("REOPENED");
    expect(s.state.dailyClosings.find((c) => c.id === close.id)?.status).toBe("REOPENED");
    const adapter = new MemorySupabaseAdapter();
    expect((await s.processSyncQueue(adapter)).every((r) => r.ok)).toBe(true);
  });
});

describe("R77 stay vs restaurant roles", () => {
  it("blocks kitchen staff from bookings and stay staff from POS", () => {
    const s = svc();
    s.logout();
    s.login("stay.staff", "sstaff123");
    expect(() => s.startOrder({ business_id: "biz-rest" })).toThrow(/Forbidden/);
    s.logout();
    s.login("kitchen.staff", "kstaff123");
    expect(() =>
      s.createBooking({
        business_id: "biz-stay-a",
        customer_id: "cust-1",
        room_id: "r-104",
        check_in: "2026-08-25",
        check_out: "2026-08-26",
        adults: 1,
        children: 0,
        rate_paise: 350000,
      }),
    ).toThrow(/Forbidden/);
  });
});

describe("sync edge cases", () => {
  it("keeps later queue items when an earlier push fails", async () => {
    const s = svc();
    s.createProduct({
      business_id: "biz-rest",
      category_id: "cat-3",
      name: "Buttermilk",
      price_paise: 3000,
      tax_bps: 500,
    });
    const adapter = new MemorySupabaseAdapter();
    adapter.failNext = true;
    const first = await s.processSyncQueue(adapter);
    expect(first.some((r) => !r.ok)).toBe(true);
    expect(s.state.products.find((p) => p.name === "Buttermilk")?.sync_status).toBe("FAILED");
    s.retryFailed();
    expect((await s.processSyncQueue(adapter)).every((r) => r.ok)).toBe(true);
  });

  it("records a conflict instead of overwriting financial records", async () => {
    const s = svc();
    const order = s.startOrder({ business_id: "biz-rest" });
    s.addOrderItem(order.id, "p-tea", 1);
    s.generateBill({
      orderId: order.id,
      payments: [{ method: "UPI", amount_paise: s.orderTotals(order.id).total_paise }],
    });
    const adapter = new MemorySupabaseAdapter();
    adapter.conflictNext = true;
    const result = await s.processSyncQueue(adapter);
    expect(result.some((r) => r.error === "CONFLICT")).toBe(true);
    expect(s.state.conflicts.length).toBeGreaterThan(0);
  });
});
