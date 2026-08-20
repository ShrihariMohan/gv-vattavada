import { describe, expect, it } from "vitest";
import { addDays, businessDateInKolkata, daysBetween } from "./dates";
import {
  addPaise,
  assertPaise,
  computeInvoiceSnapshot,
  formatINR,
  rupeesToPaise,
  taxOn,
} from "./money";
import {
  adr,
  can,
  csvEscape,
  detectConflict,
  financialRecordStatus,
  foodCostPct,
  formatInvoiceNumber,
  KEYBOARD_SHORTCUTS,
  lastWriteWinsAllowed,
  matchesPhone,
  nextInvoiceNumber,
  nextSyncStatus,
  occupancyRate,
  orderTransitions,
  PAYMENT_METHODS,
  PRODUCT_CATEGORIES,
  reportFormats,
  revpar,
  splitPaymentsValid,
  syncQueueDependencyOrder,
  thermalWidthChars,
  wrapInvoiceLines,
} from "./rules";
import { createSeedState } from "./seed";
import { AppService, invoicePrintModel, MemorySupabaseAdapter } from "./service";
import { billFromOrder } from "./bill";
import type { SyncQueueItem } from "./types";

function svc(iso = "2026-08-19T16:00:00.000Z") {
  const state = createSeedState();
  const s = new AppService(state, () => new Date(iso));
  s.login("admin", "admin123");
  s.setOnline(false);
  return s;
}

describe("R56 money in paise", () => {
  it("never stores floating totals", () => {
    expect(() => assertPaise(10.1)).toThrow();
    expect(rupeesToPaise(100.5)).toBe(10050);
    expect(addPaise(1010, 2020)).toBe(3030);
    expect(taxOn(10000, 500)).toBe(500);
    const snap = computeInvoiceSnapshot(
      [
        { qty: 2, unit_price_paise: 1500, tax_bps: 500 },
        { qty: 1, unit_price_paise: 18000, tax_bps: 500 },
        { qty: 2, unit_price_paise: 2000, tax_bps: 500 },
      ],
      0,
      0,
    );
    expect(snap.subtotal_paise).toBe(25000);
    expect(Number.isInteger(snap.total_paise)).toBe(true);
    expect(formatINR(29400)).toBe("₹294.00");
  });
});

describe("R15 invoice numbers", () => {
  it("formats restaurant and stay sequences without server autoincrement", () => {
    expect(formatInvoiceNumber("RES", 2026, 1)).toBe("RES-2026-000001");
    expect(nextInvoiceNumber("STAY", 2026, 0).number).toBe("STAY-2026-000001");
    const s = svc();
    const order = s.startOrder({ business_id: "biz-rest", table_id: "table-4" });
    s.addOrderItem(order.id, "p-parotta", 2);
    s.addOrderItem(order.id, "p-chicken", 1);
    s.addOrderItem(order.id, "p-tea", 2);
    const bill = s.generateBill({
      orderId: order.id,
      payments: [{ method: "CASH", amount_paise: s.orderTotals(order.id).total_paise }],
    });
    expect(bill.id.startsWith("rec-")).toBe(true);
    expect(bill.invoice_number).toMatch(/^RES-2026-\d{6}$/);
    expect(bill.sync_status).toBe("PENDING");
  });
});

describe("R2 R49 R50 offline POS bill", () => {
  it("creates a bill locally without a server", () => {
    const s = svc();
    s.setOnline(false);
    const order = s.startOrder({ business_id: "biz-rest", table_id: "table-4" });
    s.addOrderItem(order.id, "p-chicken", 2);
    s.addOrderItem(order.id, "p-parotta", 3);
    s.addOrderItem(order.id, "p-tea", 2);
    const totals = s.orderTotals(order.id);
    const bill = s.generateBill({
      orderId: order.id,
      payments: [{ method: "UPI", amount_paise: totals.total_paise }],
    });
    expect(s.state.invoices.some((i) => i.id === bill.id)).toBe(true);
    expect(s.syncIndicator().online).toBe(false);
    expect(s.syncIndicator().pending).toBeGreaterThan(0);
    expect(s.syncIndicator().syncLabel).toMatch(/pending/);
    expect(s.state.syncQueue.some((q) => q.entity_type === "invoice")).toBe(true);
  });
});

describe("R6 R7 sync engine", () => {
  it("PENDING → SYNCING → SYNCED and FAILED → RETRY", () => {
    expect(nextSyncStatus("PENDING", "start")).toBe("SYNCING");
    expect(nextSyncStatus("SYNCING", "success")).toBe("SYNCED");
    expect(nextSyncStatus("SYNCING", "fail")).toBe("FAILED");
    expect(nextSyncStatus("FAILED", "retry")).toBe("RETRY");
    const items: SyncQueueItem[] = [
      { id: "3", entity_type: "payment", entity_id: "p", operation: "CREATE", payload: "{}", status: "Pending", retry_count: 0, last_error: null, created_at: "3", synced_at: null, depends_on: [] },
      { id: "1", entity_type: "invoice", entity_id: "i", operation: "CREATE", payload: "{}", status: "Pending", retry_count: 0, last_error: null, created_at: "1", synced_at: null, depends_on: [] },
      { id: "2", entity_type: "invoice_item", entity_id: "ii", operation: "CREATE", payload: "{}", status: "Pending", retry_count: 0, last_error: null, created_at: "2", synced_at: null, depends_on: [] },
    ];
    expect(syncQueueDependencyOrder(items).map((i) => i.entity_type)).toEqual(["invoice", "invoice_item", "payment"]);
  });

  it("syncs queue to adapter and retries failures", async () => {
    const s = svc();
    const order = s.startOrder({ business_id: "biz-rest" });
    s.addOrderItem(order.id, "p-tea", 1);
    s.generateBill({
      orderId: order.id,
      payments: [{ method: "CASH", amount_paise: s.orderTotals(order.id).total_paise }],
    });
    const adapter = new MemorySupabaseAdapter();
    adapter.failNext = true;
    const first = await s.processSyncQueue(adapter);
    expect(first.some((r) => !r.ok)).toBe(true);
    s.retryFailed();
    const second = await s.processSyncQueue(adapter);
    expect(second.every((r) => r.ok)).toBe(true);
    expect(s.state.invoices.filter((i) => i.invoice_type === "RESTAURANT" && i.notes !== "seed").every((i) => i.sync_status === "SYNCED")).toBe(true);
  });
});

describe("R8 businesses", () => {
  it("seeds three businesses with codes", () => {
    const s = svc();
    expect(s.state.businesses.map((b) => b.code)).toEqual(["BUS001", "BUS002", "BUS003"]);
    expect(s.state.businesses.map((b) => b.name)).toEqual([
      "G.V Royal Residency",
      "G.V Cloudy Glenn Resort",
      "G.V Cloudy Kitchen",
    ]);
    expect(s.state.businesses.filter((b) => b.type === "STAY")).toHaveLength(2);
    expect(s.state.businesses.filter((b) => b.type === "RESTAURANT")).toHaveLength(1);
  });
});

describe("R9 R10 dashboard and comparison", () => {
  it("splits stay vs restaurant revenue", () => {
    const s = svc();
    const d = s.dashboard();
    expect(d.byBusiness).toHaveLength(3);
    expect(d.restaurant).toBeGreaterThan(0);
    expect(d.stay).toBeGreaterThan(0);
    expect(d.today).toBeGreaterThan(0);
  });
});

describe("R11-R17 restaurant POS", () => {
  it("supports hold, resume, cancel, tax, discount, split pay, tables, lifecycle", () => {
    expect(PRODUCT_CATEGORIES).toContain("Breakfast");
    const s = svc();
    expect(s.state.products.find((p) => p.id === "p-idly")?.price_paise).toBe(5000);
    expect(s.state.products.filter((p) => p.business_id === "biz-rest").length).toBeGreaterThan(40);
    const tables = s.state.tables;
    expect(tables.find((t) => t.name === "Table 1")?.status).toBe("AVAILABLE");
    expect(tables.find((t) => t.name === "Table 5")?.status).toBe("RESERVED");
    const order = s.startOrder({ business_id: "biz-rest", table_id: "table-1" });
    expect(s.state.tables.find((t) => t.id === "table-1")?.status).toBe("OCCUPIED");
    s.addOrderItem(order.id, "p-parotta", 4);
    s.holdBill(order.id);
    expect(s.state.orders.find((o) => o.id === order.id)?.status).toBe("HELD");
    s.resumeBill(order.id);
    s.addOrderItem(order.id, "p-tea", 1);
    const emptyish = s.startOrder({ business_id: "biz-rest" });
    s.cancelBill(emptyish.id);
    expect(s.state.orders.find((o) => o.id === emptyish.id)?.status).toBe("CANCELLED");
    expect(orderTransitions("OPEN")).toContain("IN_PROGRESS");
    const totals = s.orderTotals(order.id, 100);
    const bill = s.generateBill({
      orderId: order.id,
      discount_paise: 100,
      payments: [
        { method: "CASH", amount_paise: 5000 },
        { method: "UPI", amount_paise: totals.total_paise - 5000 },
      ],
    });
    expect(bill.discount_paise).toBe(100);
    expect(bill.tax_paise).toBeGreaterThan(0);
    expect(splitPaymentsValid(
      [
        { method: "CASH", amount_paise: 5000 },
        { method: "UPI", amount_paise: bill.total_paise - 5000 },
      ],
      bill.total_paise,
    )).toBe(true);
    expect(bill.payment_status).toBe("PAID");
    expect(["PAID"]).toContain(s.state.orders.find((o) => o.id === order.id)?.status);
  });
});

describe("R19-R25 stays", () => {
  it("books, checks in/out, invoices, and income split", () => {
    const s = svc();
    const booking = s.createBooking({
      business_id: "biz-stay-a",
      customer_id: "cust-1",
      room_id: "r-102",
      check_in: "2026-08-21",
      check_out: "2026-08-23",
      adults: 2,
      children: 0,
      rate_paise: 350000,
      paid_paise: 200000,
      payment_method: "UPI",
    });
    expect(booking.status).toBe("RESERVED");
    s.checkIn(booking.id);
    expect(s.state.rooms.find((r) => r.id === "r-102")?.status).toBe("OCCUPIED");
    s.checkOut(booking.id, { food_paise: 80000, extra_bed_paise: 50000 });
    expect(s.state.bookings.find((b) => b.id === booking.id)?.status).toBe("CHECKED_OUT");
    const inv = s.generateStayInvoice(booking.id);
    expect(inv.invoice_number).toMatch(/^STAY-2026-/);
    expect(s.state.invoiceItems.filter((i) => i.invoice_id === inv.id).some((i) => i.name === "Food")).toBe(true);
    const cal = s.calendar("biz-stay-a", "2026-08-19", "2026-08-22");
    expect(cal[0].days.length).toBe(4);
  });
});

describe("R26 R27 R28 finance", () => {
  it("distinguishes revenue expenses profit and writes a ledger", () => {
    const s = svc();
    s.createExpense({
      business_id: "biz-rest",
      category: "Gas",
      amount_paise: 50000,
      payment_method: "CASH",
      description: "Cylinder",
    });
    const a = s.analytics("2026-08-01", "2026-08-19", "biz-rest");
    expect(a.revenue).toBeGreaterThan(a.expenses);
    expect(a.profit).toBe(a.revenue - a.expenses);
    expect(s.state.ledger.some((l) => l.type === "EXPENSE" && l.amount_paise < 0)).toBe(true);
    expect(s.state.ledger.some((l) => l.type === "SALE" && l.amount_paise > 0)).toBe(true);
  });
});

describe("R29-R35 analytics", () => {
  it("covers restaurant, stay occupancy, payments", () => {
    const s = svc();
    const r = s.restaurantAnalytics("biz-rest", "2026-08-01", "2026-08-19");
    expect(r.bills).toBeGreaterThan(0);
    expect(r.top_products[0].name).toBeTruthy();
    const stay = s.stayAnalytics("biz-stay-a", "2026-08-18", "2026-08-21");
    expect(stay.occupancy).toBeGreaterThan(0);
    expect(stay.adr).toBeGreaterThan(0);
    expect(stay.revpar).toBeGreaterThan(0);
    expect(occupancyRate(8, 10)).toBe(0.8);
    expect(adr(80000, 2)).toBe(40000);
    expect(revpar(80000, 4)).toBe(20000);
    expect(PAYMENT_METHODS).toEqual(["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"]);
  });
});

describe("R36-R38 invoices and print", () => {
  it("builds A4 fields and thermal layout", () => {
    const s = svc();
    const model = invoicePrintModel(s.state, "inv-hist-1");
    expect(model.businessName).toBe("G.V Cloudy Kitchen");
    expect(model.invoiceNo).toMatch(/^RES-/);
    expect(model.gstin).toBeTruthy();
    expect(model.thankYou).toBe("Thank you");
    expect(thermalWidthChars(58)).toBe(32);
    expect(thermalWidthChars(80)).toBe(48);
    const lines = wrapInvoiceLines([{ name: "Parotta", qty: 2, amount: "₹30.00" }], 32);
    expect(lines[0].length).toBeLessThanOrEqual(33);
  });
});

describe("order bill view", () => {
  it("builds a kitchen ticket from an open order", () => {
    const s = svc();
    const order = s.startOrder({ business_id: "biz-rest", guest_name: "Meera" });
    s.addOrderItem(order.id, "p-tea", 2);
    const bill = billFromOrder(s.state, order.id);
    expect(bill.kind).toBe("BILL");
    expect(bill.customer).toBe("Meera");
    expect(bill.items.some((i) => i.name === "Tea" && i.qty === 2)).toBe(true);
    expect(bill.footerLines.some((l) => /computer-generated/i.test(l))).toBe(true);
  });
});

describe("R39-R41 customers", () => {
  it("searches by phone and computes outstanding", () => {
    expect(matchesPhone("9876543210", "9876543210")).toBe(true);
    const s = svc();
    const found = s.search("9876543210");
    expect(found.customers[0].name).toBe("Arun Kumar");
    expect(found.invoices.length).toBeGreaterThan(0);
    expect(found.bookings.length).toBeGreaterThan(0);
    const led = s.customerLedger("cust-1");
    expect(led.outstanding_paise).toBeGreaterThan(0);
  });
});

describe("R42-R43 closing and shifts", () => {
  it("closes the day and a shift", () => {
    const s = svc();
    const close = s.closeDay("biz-rest", 137550);
    expect(close.expected_cash_paise).toBe(0);
    expect(close.upi_sales_paise).toBeGreaterThan(0);
    const shift = s.openShift("biz-rest", "Morning Shift", 100000);
    const ended = s.closeShift(shift.id, 90000);
    expect(ended.closed_at).toBeTruthy();
    expect(() =>
      s.generateBill({
        orderId: s.startOrder({ business_id: "biz-rest" }).id,
        payments: [],
      }),
    ).toThrow(/Day is closed/);
    s.reopenDay(close.id, "Forgot a table");
    expect(close.status).toBe("REOPENED");
    const order = s.startOrder({ business_id: "biz-rest" });
    s.addOrderItem(order.id, "p-tea", 1);
    const bill = s.generateBill({
      orderId: order.id,
      payments: [{ method: "CASH", amount_paise: s.orderTotals(order.id).total_paise }],
    });
    expect(bill.status).toBe("ISSUED");
  });
});

describe("R44-R46 users audit permissions", () => {
  it("hashes passwords and enforces roles", () => {
    const s = svc();
    expect(s.state.users[0].password_hash).not.toBe("admin123");
    expect(can("STAFF", "analytics.financial")).toBe(false);
    expect(can("STAFF", "pos.create_bill")).toBe(true);
    expect(can("MANAGER", "reports.view")).toBe(true);
    expect(can("RESTAURANT_STAFF", "bookings.manage")).toBe(false);
    expect(can("STAY_STAFF", "pos.use")).toBe(false);
    expect(can("STAY_MANAGER", "bookings.manage")).toBe(true);
    expect(can("RESTAURANT_MANAGER", "day.close")).toBe(true);
    expect(can("STAY_MANAGER", "pos.use")).toBe(false);
    s.logout();
    s.login("staff", "staff123");
    expect(() => s.createExpense({ business_id: "biz-rest", category: "Gas", amount_paise: 1, payment_method: "CASH", description: "x" })).toThrow(/Forbidden/);
    const order = s.startOrder({ business_id: "biz-rest" });
    s.addOrderItem(order.id, "p-tea", 1);
    const bill = s.generateBill({
      orderId: order.id,
      payments: [{ method: "CASH", amount_paise: s.orderTotals(order.id).total_paise }],
    });
    expect(() => s.voidInvoice(bill.id, "nope")).toThrow(/Forbidden/);
  });

  it("voids instead of deleting", () => {
    const s = svc();
    const v = s.voidInvoice("inv-hist-1", "correction");
    expect(v.status).toBe(financialRecordStatus("void"));
    expect(s.state.auditLogs.some((a) => a.action === "invoice.void")).toBe(true);
  });
});

describe("R47 R48 devices and conflicts", () => {
  it("tags device ids and flags conflicts without silent overwrite", () => {
    const s = svc();
    expect(s.state.currentDeviceId).toBe("DEVICE-RESTAURANT-TABLET-01");
    expect(lastWriteWinsAllowed("product")).toBe(true);
    expect(lastWriteWinsAllowed("invoice")).toBe(false);
    expect(detectConflict(1, 2, "a", "b")).toBe(true);
    const result = s.noteRemoteEdit("booking", "bk-1", 1, 2, "t1", "t2", "{}", '{"x":1}');
    expect(result).toBe("conflict");
    expect(s.state.conflicts[0].resolved).toBe(false);
    s.resolveConflict(s.state.conflicts[0].id, "local");
    expect(s.state.conflicts[0].resolved).toBe(true);
  });
});

describe("R57 dates", () => {
  it("stores UTC and uses Kolkata business dates", () => {
    expect(businessDateInKolkata("2026-08-19T16:00:00.000Z")).toBe("2026-08-19");
    expect(daysBetween("2026-08-19", "2026-08-21")).toBe(2);
    expect(addDays("2026-08-19", 1)).toBe("2026-08-20");
  });
});

describe("R62 shortcuts R63 search R66 R67 later metrics R68 reports", () => {
  it("exposes shortcuts, reports, food cost, occupancy trio", () => {
    expect(KEYBOARD_SHORTCUTS.F1).toBe("New Bill");
    expect(KEYBOARD_SHORTCUTS.Escape).toBe("Cancel");
    expect(reportFormats()).toEqual(["PDF", "Excel", "CSV", "Print"]);
    expect(csvEscape([["a", "b,c"]])).toContain('"b,c"');
    expect(foodCostPct(600, 1500)).toBe(40);
  });
});

describe("R45 login", () => {
  it("rejects bad passwords", () => {
    const state = createSeedState();
    const s = new AppService(state, () => new Date("2026-08-19T16:00:00.000Z"));
    expect(() => s.login("admin", "wrong")).toThrow();
  });
});
