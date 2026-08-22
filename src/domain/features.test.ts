import { describe, expect, it } from "vitest";
import { createSeedState } from "./seed";
import { AppService, MemorySupabaseAdapter } from "./service";
import { backupCsvFiles, backupToJson, parseBackupJson } from "./backup";
import { cloudDumpToSql } from "./cloud-backup";
import { normalizeState } from "@/db/persist";
import { isListedOrder } from "@/domain/bill";
import { productMatchesQuery, productMatchesSelectedTag, publicMenuItems } from "@/marketing/menu";

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
  it("cancels and soft-deletes an open order locally without syncing each line", () => {
    const s = svc();
    const order = s.startOrder({ business_id: "biz-rest", table_id: "table-4" });
    s.addOrderItem(order.id, "p-tea", 2);
    expect(s.state.syncQueue.some((q) => q.entity_type === "order" || q.entity_type === "order_item")).toBe(false);
    s.deleteOrder(order.id);
    const gone = s.state.orders.find((o) => o.id === order.id)!;
    expect(gone.status).toBe("CANCELLED");
    expect(gone.deleted_at).toBeTruthy();
    expect(s.state.tables.find((t) => t.id === "table-4")?.status).toBe("AVAILABLE");
    expect(s.state.syncQueue.some((q) => q.entity_id === order.id)).toBe(false);
  });

  it("queues a bill for sync once and hides empty tickets from the order list", () => {
    const s = svc();
    const empty = s.startOrder({ business_id: "biz-rest" });
    expect(isListedOrder(s.state, empty)).toBe(false);
    const order = s.startOrder({ business_id: "biz-rest" });
    s.addOrderItem(order.id, "p-tea", 1);
    expect(isListedOrder(s.state, order)).toBe(true);
    expect(s.state.syncQueue.filter((q) => q.entity_type === "invoice")).toHaveLength(0);
    s.generateBill({
      orderId: order.id,
      payments: [{ method: "CASH", amount_paise: s.orderTotals(order.id).total_paise }],
    });
    expect(s.state.syncQueue.some((q) => q.entity_type === "invoice")).toBe(true);
    expect(s.state.syncQueue.some((q) => q.entity_type === "payment")).toBe(true);
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

  it("omits tax from bills when collection is disabled", () => {
    const s = svc();
    const order = s.startOrder({ business_id: "biz-rest" });
    s.addOrderItem(order.id, "p-tea", 2);
    const withTax = s.orderTotals(order.id);
    expect(withTax.tax_paise).toBeGreaterThan(0);
    s.setTaxEnabled(false);
    const without = s.orderTotals(order.id);
    expect(without.tax_paise).toBe(0);
    expect(without.total_paise).toBe(without.subtotal_paise);
    const bill = s.generateBill({
      orderId: order.id,
      payments: [{ method: "CASH", amount_paise: without.total_paise }],
    });
    expect(bill.tax_paise).toBe(0);
    expect(bill.total_paise).toBe(without.subtotal_paise);
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

describe("local backup", () => {
  it("round-trips JSON and includes invoice CSV", () => {
    const s = svc();
    const json = backupToJson(s.state);
    const restored = parseBackupJson(json);
    expect(restored.businesses.map((b) => b.code)).toEqual(["BUS001", "BUS002", "BUS003"]);
    expect(restored.invoices.length).toBe(s.state.invoices.length);
    const csvs = backupCsvFiles(s.state);
    expect(csvs.some((f) => f.name === "invoices.csv" && f.body.includes("invoice_number"))).toBe(true);
  });
});

describe("cloud SQL backup", () => {
  it("emits a self-contained upsert script that escapes quotes", () => {
    const sql = cloudDumpToSql({
      exportedAt: "2026-08-21T06:00:00.000Z",
      schemaSql: "create table if not exists public.sync_records (entity_id text);",
      businesses: [{ id: "biz-rest", code: "BUS003", name: "G.V Cloudy Kitchen", type: "RESTAURANT", email: "a@b.c" }],
      syncRecords: [
        {
          entity_type: "invoice",
          entity_id: "inv-1",
          operation: "CREATE",
          payload: { notes: "It's paid", name: "O'Brien" },
          device_id: "dev-1",
          updated_at: "2026-08-21T06:00:00.000Z",
        },
      ],
    });
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("COMMIT;");
    expect(sql).toContain("create table if not exists public.sync_records");
    expect(sql).toContain("on conflict (entity_type, entity_id) do update");
    expect(sql).toContain("It''s paid");
    expect(sql).toContain("O''Brien");
    expect(sql).toContain("biz-rest");
  });
});

describe("menu tags and visibility", () => {
  it("seeds title-case names and searchable tags", () => {
    const s = svc();
    expect(s.state.products.find((p) => p.id === "p-dosa")?.name).toBe("Masala Dosa");
    expect(s.state.products.find((p) => p.id === "p-chicken-biryani")?.name).toBe("Chicken Biryani");
    const rice = s.state.products.find((p) => p.id === "p-chicken-rice");
    expect(rice?.tags).toEqual(expect.arrayContaining(["chinese", "lunch", "dinner", "chicken"]));
    expect(productMatchesQuery(rice!, "chinese")).toBe(true);
    expect(productMatchesQuery(rice!, "lunk")).toBe(true);
    expect(productMatchesSelectedTag(rice!, "chinese")).toBe(true);
    expect(productMatchesSelectedTag(rice!, "breakfast")).toBe(false);
    expect(productMatchesSelectedTag(rice!, null)).toBe(true);
  });

  it("hides inactive products from the public menu", () => {
    const s = svc();
    s.updateProduct("p-dosa", { active: false });
    const restaurant = s.state.businesses.find((b) => b.type === "RESTAURANT")!;
    const items = publicMenuItems(s.state.products, restaurant.id);
    expect(items.find((p) => p.id === "p-dosa")).toBeUndefined();
    expect(items.find((p) => p.id === "p-idly")).toBeTruthy();
  });
});

describe("cross-device sync ids", () => {
  it("remints duplicate sequential order ids in local state", () => {
    const state = createSeedState("DEVICE-RESTAURANT-TABLET-01");
    const clone = structuredClone(state.orders[0]);
    clone.updated_at = "2026-08-19T18:00:00.000Z";
    clone.guest_name = "Second colliding ticket";
    clone.id = "rec-1-DEVICE-RESTAURANT-TABLET-01";
    state.orders[0].id = "rec-1-DEVICE-RESTAURANT-TABLET-01";
    state.orders[0].updated_at = "2026-08-19T17:00:00.000Z";
    state.orders.push(clone);
    const next = normalizeState(state);
    const ids = next.orders.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id === "rec-1-DEVICE-RESTAURANT-TABLET-01").length).toBe(1);
  });

  it("does not reset a saved product price from the seed catalog", () => {
    const state = createSeedState();
    const parotta = state.products.find((p) => p.id === "p-parotta")!;
    parotta.price_paise = 2000;
    parotta.updated_at = "2026-08-21T00:00:00.000Z";
    const next = normalizeState(state);
    expect(next.products.find((p) => p.id === "p-parotta")?.price_paise).toBe(2000);
    expect(next.expenses).toEqual([]);
    expect(next.ledger).toEqual([]);
    expect(next.invoices).toEqual([]);
    expect(next.bookings).toEqual([]);
  });
  it("does not reuse sequential ids across devices and pulls remote orders", async () => {
    const cloud = new MemorySupabaseAdapter();
    const a = new AppService(createSeedState("dev-aaa-aaaaaaaa"), () => new Date("2026-08-19T16:00:00.000Z"));
    const b = new AppService(createSeedState("dev-bbb-bbbbbbbb"), () => new Date("2026-08-19T16:00:00.000Z"));
    a.login("admin", "admin123");
    b.login("admin", "admin123");
    const o1 = a.startOrder({ business_id: "biz-rest" });
    a.addOrderItem(o1.id, "p-tea", 2);
    const o2 = b.startOrder({ business_id: "biz-rest" });
    expect(o1.id).not.toBe(o2.id);
    expect(o1.id).not.toBe("rec-1-DEVICE-RESTAURANT-TABLET-01");
    const bill = a.generateBill({
      orderId: o1.id,
      payments: [{ method: "CASH", amount_paise: a.orderTotals(o1.id).total_paise }],
    });
    await a.processSyncQueue(cloud);
    const pulled = await b.pullFromRemote(cloud);
    expect(pulled).toBeGreaterThan(0);
    expect(b.state.invoices.some((i) => i.id === bill.id)).toBe(true);
    expect(b.state.orders.some((o) => o.id === o1.id)).toBe(true);
    expect(b.state.orderItems.some((i) => i.order_id === o1.id && i.product_id === "p-tea" && i.qty === 2)).toBe(true);
  });

  it("pulls a product price change onto another device", async () => {
    const cloud = new MemorySupabaseAdapter();
    const a = new AppService(createSeedState("dev-a"), () => new Date("2026-08-21T10:00:00.000Z"));
    const b = new AppService(createSeedState("dev-b"), () => new Date("2026-08-21T10:00:00.000Z"));
    a.login("admin", "admin123");
    b.login("admin", "admin123");
    expect(b.state.products.find((p) => p.id === "p-parotta")?.price_paise).toBe(1500);
    a.updateProduct("p-parotta", { price_paise: 2000 });
    await a.processSyncQueue(cloud);
    await b.pullFromRemote(cloud, { full: true });
    expect(b.state.products.find((p) => p.id === "p-parotta")?.price_paise).toBe(2000);
  });
});

describe("stay CRUD", () => {
  it("links a guest and room through booking, check-in, and checkout", () => {
    const s = svc();
    const guest = s.createCustomer({ name: "Meera Nair", phone: "9000000101" });
    const room = s.createRoom({
      business_id: "biz-stay-b",
      number: "210",
      name: "Mist 210",
      capacity: 2,
      base_price_paise: 280000,
    });
    const booking = s.createBooking({
      business_id: "biz-stay-b",
      customer_id: guest.id,
      room_id: room.id,
      check_in: "2026-08-25",
      check_out: "2026-08-28",
      adults: 2,
      children: 0,
      rate_paise: 280000,
    });
    expect(s.state.rooms.find((r) => r.id === room.id)?.status).toBe("RESERVED");
    expect(() =>
      s.createBooking({
        business_id: "biz-stay-b",
        customer_id: guest.id,
        room_id: room.id,
        check_in: "2026-08-26",
        check_out: "2026-08-29",
        adults: 1,
        children: 0,
        rate_paise: 280000,
      }),
    ).toThrow(/already booked/);
    s.updateBooking(booking.id, { check_out: "2026-08-27", rate_paise: 300000 });
    expect(s.state.bookings.find((b) => b.id === booking.id)?.rate_paise).toBe(300000);
    expect(s.state.bookings.find((b) => b.id === booking.id)?.total_paise).toBe(600000);
    expect(() => s.updateBooking(booking.id, { check_out: "2026-08-28" })).toThrow(/shortened/);
    s.updateBooking(booking.id, { total_paise: 500000 });
    expect(s.state.bookings.find((b) => b.id === booking.id)?.total_paise).toBe(500000);
    expect(s.state.bookings.find((b) => b.id === booking.id)?.check_out).toBe("2026-08-27");
    s.checkIn(booking.id);
    expect(s.state.rooms.find((r) => r.id === room.id)?.status).toBe("OCCUPIED");
    expect(() => s.deleteCustomer(guest.id)).toThrow(/active booking/);
    expect(() => s.deleteRoom(room.id)).toThrow(/active booking/);
    s.checkOut(booking.id, { food_paise: 12000 });
    expect(s.state.rooms.find((r) => r.id === room.id)?.status).toBe("CLEANING");
    s.updateRoom(room.id, { status: "AVAILABLE" });
    expect(s.state.rooms.find((r) => r.id === room.id)?.status).toBe("AVAILABLE");
    s.deleteCustomer(guest.id);
    expect(s.state.customers.find((c) => c.id === guest.id)?.deleted_at).toBeTruthy();
  });

  it("cancels a reservation and frees the room", () => {
    const s = svc();
    const booking = s.createBooking({
      business_id: "biz-stay-a",
      customer_id: "cust-1",
      room_id: "r-104",
      check_in: "2026-08-25",
      check_out: "2026-08-26",
      adults: 1,
      children: 0,
      rate_paise: 450000,
    });
    expect(s.state.rooms.find((r) => r.id === "r-104")?.status).toBe("RESERVED");
    s.cancelBooking(booking.id);
    expect(s.state.bookings.find((b) => b.id === booking.id)?.status).toBe("CANCELLED");
    expect(s.state.rooms.find((r) => r.id === "r-104")?.status).toBe("AVAILABLE");
  });
});

describe("POS cancel and edit", () => {
  it("cancels an in-progress ticket and lets staff add to a held ticket", () => {
    const s = svc();
    const order = s.startOrder({ business_id: "biz-rest", table_id: "table-4" });
    s.addOrderItem(order.id, "p-tea", 2);
    s.deleteOrder(order.id);
    expect(s.state.orders.find((o) => o.id === order.id)?.status).toBe("CANCELLED");
    expect(s.state.orders.find((o) => o.id === order.id)?.deleted_at).toBeTruthy();
    s.addOrderItem("ord-held", "p-idly", 1);
    expect(s.state.orders.find((o) => o.id === "ord-held")?.status).toBe("IN_PROGRESS");
    s.updateOrderGuest("ord-held", { guest_name: "Meera", guest_phone: "9000000099" });
    expect(s.state.orders.find((o) => o.id === "ord-held")?.guest_name).toBe("Meera");
  });
});
