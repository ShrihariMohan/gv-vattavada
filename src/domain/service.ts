import { addDays, businessDateInKolkata, daysBetween, eachDate, monthKey, nowUtc, yearInKolkata, yearKey } from "./dates";
import {
  addPaise,
  computeInvoiceSnapshot,
  formatINR,
  paymentStatus,
  type Paise,
} from "./money";
import {
  assertMutableFinancial,
  bookingTotals,
  can,
  canTransitionOrder,
  detectConflict,
  financialRecordStatus,
  formatInvoiceNumber,
  hashPasswordSync,
  invoicePrefix,
  isDayClosed,
  lastWriteWinsAllowed,
  matchesPhone,
  nextInvoiceNumber,
  nextSyncStatus,
  occupancyRate,
  adr,
  revpar,
  profit,
  roomStatusForBooking,
  stayIncomeBreakdown,
  syncQueueDependencyOrder,
  verifyPassword,
  type Permission,
} from "./rules";
import type {
  AppState,
  AuditLog,
  Booking,
  Business,
  ConflictRecord,
  Customer,
  DailyClosing,
  EntityType,
  Expense,
  Invoice,
  InvoiceItem,
  LedgerEntry,
  Order,
  OrderItem,
  OrderStatus,
  Payment,
  PaymentMethod,
  Product,
  RestaurantTable,
  Role,
  Room,
  RoomType,
  Shift,
  SyncMeta,
  SyncQueueItem,
  User,
} from "./types";

export function emptyState(deviceId: string): AppState {
  return {
    businesses: [],
    users: [],
    devices: [],
    customers: [],
    roomTypes: [],
    rooms: [],
    bookings: [],
    productCategories: [],
    products: [],
    tables: [],
    orders: [],
    orderItems: [],
    invoices: [],
    invoiceItems: [],
    payments: [],
    expenseCategories: [],
    expenses: [],
    ledger: [],
    dailyClosings: [],
    shifts: [],
    auditLogs: [],
    syncQueue: [],
    invoiceCounters: [],
    conflicts: [],
    lastSyncedAt: null,
    lastPulledAt: null,
    currentUserId: null,
    currentDeviceId: deviceId,
    online: true,
    tax_enabled: true,
  };
}

export function newEntityId(prefix: string, deviceId = "dev"): string {
  const rand =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${++idFallback}`;
  return `${prefix}_${deviceId.slice(0, 8)}_${rand}`;
}

let idFallback = 0;

export class AppService {
  state: AppState;
  private seq = 0;
  constructor(
    state: AppState,
    private clock: () => Date = () => new Date(),
  ) {
    this.state = state;
  }

  private now() {
    return nowUtc(this.clock);
  }

  private id(prefix = "id") {
    this.seq += 1;
    return newEntityId(prefix, this.state.currentDeviceId);
  }

  private requireUser(): User {
    const u = this.state.users.find((x) => x.id === this.state.currentUserId);
    if (!u) throw new Error("Not signed in");
    return u;
  }

  require(action: Permission) {
    const u = this.requireUser();
    if (!can(u.role, action)) throw new Error(`Forbidden: ${action}`);
    return u;
  }

  private meta() {
    const t = this.now();
    return {
      id: this.id("rec"),
      server_id: null as string | null,
      sync_status: "PENDING" as const,
      created_at: t,
      updated_at: t,
      deleted_at: null as string | null,
      device_id: this.state.currentDeviceId,
      version: 1,
    };
  }

  private stamp<T extends SyncMeta>(row: T) {
    row.updated_at = this.now();
    row.version += 1;
    row.sync_status = "PENDING";
  }

  private enqueue(entity_type: EntityType, entity_id: string, operation: SyncQueueItem["operation"], payload: unknown, depends_on: string[] = []) {
    const item: SyncQueueItem = {
      id: this.id("q"),
      entity_type,
      entity_id,
      operation,
      payload: JSON.stringify(payload),
      status: "Pending",
      retry_count: 0,
      last_error: null,
      created_at: this.now(),
      synced_at: null,
      depends_on,
    };
    this.state.syncQueue.push(item);
    return item;
  }

  private audit(action: string, entity_type: string, entity_id: string, old_value: unknown, new_value: unknown) {
    const log: AuditLog = {
      id: this.id("audit"),
      who: this.state.currentUserId ?? "system",
      action,
      entity_type,
      entity_id,
      when: this.now(),
      device_id: this.state.currentDeviceId,
      old_value: old_value == null ? null : JSON.stringify(old_value),
      new_value: new_value == null ? null : JSON.stringify(new_value),
    };
    this.state.auditLogs.push(log);
  }

  login(username: string, password: string): User {
    const user = this.state.users.find((u) => u.username === username && u.active);
    if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
      throw new Error("Invalid credentials");
    }
    this.state.currentUserId = user.id;
    this.audit("login", "user", user.id, null, { username });
    return user;
  }

  logout() {
    this.state.currentUserId = null;
  }

  setOnline(online: boolean) {
    this.state.online = online;
  }

  pendingCount() {
    return this.state.syncQueue.filter((q) => q.status !== "Failed" && !q.synced_at).length;
  }

  syncIndicator() {
    const pending = this.pendingCount();
    return {
      online: this.state.online,
      pending,
      lastSyncedAt: this.state.lastSyncedAt,
      label: this.state.online ? "Online" : "Offline",
      syncLabel: pending === 0 ? "All changes synced" : `${pending} changes pending`,
    };
  }

  private nextInv(type: "RESTAURANT" | "STAY") {
    const year = yearInKolkata(this.now());
    const prefix = invoicePrefix(type);
    const key = `${prefix}-${year}-${this.state.currentDeviceId}`;
    const row = this.state.invoiceCounters.find((c) => c.key === key);
    const last = row?.seq ?? 0;
    const { number, seq } = nextInvoiceNumber(prefix, year, last);
    if (row) row.seq = seq;
    else this.state.invoiceCounters.push({ key, seq });
    return number;
  }

  createCustomer(input: { name: string; phone: string; email?: string; address?: string; notes?: string }): Customer {
    this.requireUser();
    const c: Customer = {
      ...this.meta(),
      name: input.name,
      phone: input.phone,
      email: input.email ?? "",
      address: input.address ?? "",
      notes: input.notes ?? "",
    };
    this.state.customers.push(c);
    this.enqueue("customer", c.id, "CREATE", c);
    return c;
  }

  updateCustomer(id: string, input: { name: string; phone: string; email?: string; address?: string; notes?: string }): Customer {
    this.requireUser();
    const c = this.state.customers.find((x) => x.id === id && !x.deleted_at);
    if (!c) throw new Error("Guest not found");
    Object.assign(c, {
      name: input.name,
      phone: input.phone,
      email: input.email ?? "",
      address: input.address ?? "",
      notes: input.notes ?? "",
    });
    this.stamp(c);
    this.enqueue("customer", c.id, "UPDATE", c);
    return c;
  }

  deleteCustomer(id: string) {
    this.require("bookings.manage");
    const c = this.state.customers.find((x) => x.id === id && !x.deleted_at);
    if (!c) throw new Error("Guest not found");
    const active = this.state.bookings.some(
      (b) =>
        b.customer_id === id &&
        !b.deleted_at &&
        (b.status === "ENQUIRY" || b.status === "RESERVED" || b.status === "CHECKED_IN"),
    );
    if (active) throw new Error("Cannot delete a guest with an active booking");
    c.deleted_at = this.now();
    this.stamp(c);
    this.enqueue("customer", c.id, "DELETE", c);
  }

  startOrder(opts: {
    business_id: string;
    table_id?: string | null;
    customer_id?: string | null;
    guest_name?: string;
    guest_phone?: string;
    room_number?: string;
  }): Order {
    this.require("pos.create_bill");
    let customerId = opts.customer_id ?? null;
    const phone = (opts.guest_phone ?? "").replace(/\D/g, "");
    const roomNumber = (opts.room_number ?? "").trim();
    let guestName = (opts.guest_name ?? "").trim();
    if (phone) {
      const existing = this.state.customers.find((c) => c.phone.replace(/\D/g, "") === phone && !c.deleted_at);
      if (existing) {
        customerId = existing.id;
        if (!guestName) guestName = existing.name;
      } else {
        const created = this.createCustomer({ name: guestName || "Walk-in", phone: opts.guest_phone ?? phone });
        customerId = created.id;
      }
    }
    if (roomNumber) {
      const room = this.state.rooms.find((r) => r.number.toLowerCase() === roomNumber.toLowerCase() && !r.deleted_at);
      if (!room) throw new Error(`Room ${roomNumber} not found`);
      const booking = this.state.bookings.find(
        (b) => b.room_id === room.id && !["CANCELLED", "NO_SHOW", "CHECKED_OUT"].includes(b.status),
      );
      if (booking && !customerId) customerId = booking.customer_id;
      if (booking && !guestName) {
        guestName = this.state.customers.find((c) => c.id === booking.customer_id)?.name ?? guestName;
      }
    }
    if (opts.table_id) {
      const table = this.state.tables.find((t) => t.id === opts.table_id);
      if (!table) throw new Error("Table not found");
      if (table.status === "OCCUPIED" && table.current_order_id) {
        throw new Error("Table already has an open order");
      }
    }
    const order: Order = {
      ...this.meta(),
      business_id: opts.business_id,
      table_id: opts.table_id ?? null,
      customer_id: customerId,
      guest_name: guestName,
      guest_phone: opts.guest_phone ?? "",
      room_number: roomNumber,
      status: "OPEN",
      notes: "",
    };
    this.state.orders.push(order);
    if (opts.table_id) {
      const table = this.state.tables.find((t) => t.id === opts.table_id);
      if (table) {
        table.status = "OCCUPIED";
        table.current_order_id = order.id;
        table.updated_at = this.now();
        table.version += 1;
        table.sync_status = "PENDING";
      }
    }
    return order;
  }

  updateOrderGuest(
    orderId: string,
    patch: { guest_name?: string; guest_phone?: string; room_number?: string; table_id?: string | null; customer_id?: string | null },
  ): Order {
    this.require("pos.create_bill");
    const order = this.mustOrder(orderId);
    if (order.status === "PAID" || order.status === "CANCELLED") throw new Error("Order is closed");
    if (patch.guest_name !== undefined) order.guest_name = patch.guest_name;
    if (patch.guest_phone !== undefined) order.guest_phone = patch.guest_phone;
    if (patch.room_number !== undefined) {
      if (patch.room_number) {
        const room = this.state.rooms.find((r) => r.number.toLowerCase() === patch.room_number!.toLowerCase());
        if (!room) throw new Error(`Room ${patch.room_number} not found`);
      }
      order.room_number = patch.room_number;
    }
    if (patch.customer_id !== undefined) order.customer_id = patch.customer_id;
    if (patch.table_id !== undefined && patch.table_id !== order.table_id) {
      if (order.table_id) this.releaseTable(order.table_id);
      order.table_id = patch.table_id;
      if (patch.table_id) {
        const table = this.state.tables.find((t) => t.id === patch.table_id);
        if (!table) throw new Error("Table not found");
        if (table.current_order_id && table.current_order_id !== order.id) throw new Error("Table already has an open order");
        table.status = "OCCUPIED";
        table.current_order_id = order.id;
      }
    }
    if (patch.guest_phone) {
      const digits = patch.guest_phone.replace(/\D/g, "");
      const existing = this.state.customers.find((c) => c.phone.replace(/\D/g, "") === digits);
      if (existing) order.customer_id = existing.id;
    }
    order.updated_at = this.now();
    order.version += 1;
    order.sync_status = "PENDING";
    return order;
  }

  deleteOrder(orderId: string): Order {
    this.require("pos.create_bill");
    const user = this.requireUser();
    const order = this.mustOrder(orderId);
    const invoice = this.state.invoices.find((i) => i.order_id === orderId && i.status === "ISSUED");
    if (invoice) throw new Error("Cannot delete a billed order. Void the invoice first.");
    if (order.status === "PAID") throw new Error("Cannot delete a paid order");
    if ((user.role === "STAFF" || user.role === "RESTAURANT_STAFF" || user.role === "STAY_STAFF") && order.status === "COMPLETED") {
      throw new Error("Staff cannot delete completed orders");
    }
    const old = { ...order };
    if (order.status !== "CANCELLED") {
      if (order.status === "HELD") this.transitionOrder(orderId, "OPEN");
      if (this.mustOrder(orderId).status === "OPEN") this.transitionOrder(orderId, "IN_PROGRESS");
      if (this.mustOrder(orderId).status === "IN_PROGRESS") this.transitionOrder(orderId, "CANCELLED");
      else if (this.mustOrder(orderId).status === "COMPLETED") throw new Error("Cannot delete a billed order. Void the invoice first.");
    }
    const cancelled = this.mustOrder(orderId);
    cancelled.deleted_at = this.now();
    cancelled.sync_status = "PENDING";
    for (const item of this.state.orderItems.filter((i) => i.order_id === orderId && !i.deleted_at)) {
      item.deleted_at = this.now();
      item.sync_status = "PENDING";
    }
    this.audit("order.delete", "order", cancelled.id, old, { deleted_at: cancelled.deleted_at });
    return cancelled;
  }

  createProduct(input: {
    business_id: string;
    category_id: string;
    name: string;
    price_paise: number;
    tax_bps: number;
    unit?: string;
    sku?: string;
    description?: string;
    image_url?: string;
    tags?: string[];
    display_order?: number;
  }): Product {
    this.require("products.edit");
    if (input.price_paise < 0 || !Number.isInteger(input.price_paise)) throw new Error("Price must be integer paise");
    const product: Product = {
      ...this.meta(),
      business_id: input.business_id,
      category_id: input.category_id,
      name: input.name.trim(),
      price_paise: input.price_paise,
      tax_bps: input.tax_bps,
      unit: input.unit ?? "pc",
      sku: input.sku?.trim() || input.name.trim().toUpperCase().replace(/\s+/g, "-"),
      description: input.description?.trim() ?? "",
      image_url: input.image_url?.trim() ?? "",
      tags: input.tags ?? [],
      active: true,
      display_order: input.display_order ?? this.state.products.length,
    };
    if (!product.name) throw new Error("Name is required");
    this.state.products.push(product);
    this.enqueue("product", product.id, "CREATE", product);
    this.audit("product.create", "product", product.id, null, product);
    return product;
  }

  updateProduct(
    productId: string,
    patch: Partial<Pick<Product, "name" | "price_paise" | "tax_bps" | "unit" | "sku" | "description" | "image_url" | "tags" | "active" | "category_id" | "display_order">>,
  ): Product {
    this.require("products.edit");
    const product = this.state.products.find((p) => p.id === productId);
    if (!product) throw new Error("Product not found");
    const old = { ...product };
    if (patch.price_paise !== undefined && (!Number.isInteger(patch.price_paise) || patch.price_paise < 0)) {
      throw new Error("Price must be integer paise");
    }
    Object.assign(product, patch);
    product.updated_at = this.now();
    product.version += 1;
    product.sync_status = "PENDING";
    this.enqueue("product", product.id, "UPDATE", product);
    this.audit("product.update", "product", product.id, old, product);
    return product;
  }

  setTaxEnabled(enabled: boolean) {
    this.require("products.edit");
    this.state.tax_enabled = enabled;
    this.audit("settings.tax", "product", "tax_enabled", !enabled, enabled);
  }

  private taxBps(bps: number) {
    return this.state.tax_enabled === false ? 0 : bps;
  }

  updateDailyClosing(closingId: string, actualCashPaise: number): DailyClosing {
    this.require("day.close");
    const closing = this.state.dailyClosings.find((c) => c.id === closingId);
    if (!closing) throw new Error("Closing not found");
    if (!Number.isInteger(actualCashPaise) || actualCashPaise < 0) throw new Error("Actual cash must be integer paise");
    const old = { ...closing };
    closing.actual_cash_paise = actualCashPaise;
    closing.difference_paise = actualCashPaise - closing.expected_cash_paise;
    closing.updated_at = this.now();
    closing.version += 1;
    closing.sync_status = "PENDING";
    this.enqueue("daily_closing", closing.id, "UPDATE", closing);
    this.audit("daily_closing.update", "daily_closing", closing.id, old, closing);
    return closing;
  }

  reopenDay(closingId: string, reason = "Manager reopened the day"): DailyClosing {
    this.require("day.close");
    const closing = this.state.dailyClosings.find((c) => c.id === closingId);
    if (!closing) throw new Error("Closing not found");
    if ((closing.status ?? "CLOSED") === "REOPENED") throw new Error("Day is already open");
    const old = { ...closing };
    closing.status = "REOPENED";
    closing.reopened_at = this.now();
    closing.reopen_reason = reason;
    closing.updated_at = this.now();
    closing.version += 1;
    closing.sync_status = "PENDING";
    this.enqueue("daily_closing", closing.id, "UPDATE", closing);
    this.audit("daily_closing.reopen", "daily_closing", closing.id, old, closing);
    return closing;
  }

  addOrderItem(orderId: string, productId: string, qty = 1): OrderItem {
    this.require("pos.create_bill");
    const order = this.mustOrder(orderId);
    if (order.status === "PAID" || order.status === "CANCELLED") throw new Error("Order is closed");
    if (order.status === "HELD") this.transitionOrder(orderId, "OPEN");
    const product = this.state.products.find((p) => p.id === productId && p.active);
    if (!product) throw new Error("Product not found");
    const existing = this.state.orderItems.find((i) => i.order_id === orderId && i.product_id === productId && !i.deleted_at);
    if (existing) {
      existing.qty += qty;
      existing.updated_at = this.now();
      existing.version += 1;
      existing.sync_status = "PENDING";
      return existing;
    }
    const item: OrderItem = {
      ...this.meta(),
      order_id: orderId,
      product_id: productId,
      name: product.name,
      qty,
      unit_price_paise: product.price_paise,
      tax_bps: product.tax_bps,
    };
    this.state.orderItems.push(item);
    if (order.status === "OPEN") this.transitionOrder(orderId, "IN_PROGRESS");
    return item;
  }

  setItemQty(itemId: string, qty: number) {
    this.require("pos.create_bill");
    const item = this.state.orderItems.find((i) => i.id === itemId);
    if (!item) throw new Error("Item not found");
    if (qty <= 0) {
      item.deleted_at = this.now();
      item.sync_status = "PENDING";
      return item;
    }
    item.qty = qty;
    item.updated_at = this.now();
    item.sync_status = "PENDING";
    return item;
  }

  transitionOrder(orderId: string, to: OrderStatus) {
    const order = this.mustOrder(orderId);
    if (!canTransitionOrder(order.status, to)) throw new Error(`Cannot move order ${order.status} → ${to}`);
    const old = order.status;
    order.status = to;
    order.updated_at = this.now();
    order.sync_status = "PENDING";
    this.audit("order.status", "order", order.id, old, to);
    if (to === "CANCELLED" && order.table_id) this.releaseTable(order.table_id);
    return order;
  }

  holdBill(orderId: string) {
    return this.transitionOrder(orderId, "HELD");
  }

  resumeBill(orderId: string) {
    return this.transitionOrder(orderId, "OPEN");
  }

  cancelBill(orderId: string) {
    const order = this.mustOrder(orderId);
    if (order.status === "PAID") throw new Error("Cannot cancel a paid order. Void the invoice first.");
    if (order.status === "CANCELLED") return order;
    return this.transitionOrder(orderId, "CANCELLED");
  }

  replaceState(next: AppState) {
    this.state = next;
  }

  orderTotals(orderId: string, discountPaise: Paise = 0) {
    const items = this.state.orderItems.filter((i) => i.order_id === orderId && !i.deleted_at);
    return computeInvoiceSnapshot(
      items.map((i) => ({ qty: i.qty, unit_price_paise: i.unit_price_paise, tax_bps: this.taxBps(i.tax_bps) })),
      discountPaise,
      0,
    );
  }

  generateBill(opts: {
    orderId: string;
    discount_paise?: number;
    payments: { method: PaymentMethod; amount_paise: number }[];
    customer_id?: string | null;
  }): Invoice {
    this.require("pos.create_bill");
    const order = this.mustOrder(opts.orderId);
    const closed = isDayClosed(this.state.dailyClosings, order.business_id, businessDateInKolkata(this.now()));
    assertMutableFinancial({ dayClosed: closed, role: this.requireUser().role, correctionProcess: false });
    const items = this.state.orderItems.filter((i) => i.order_id === order.id && !i.deleted_at);
    if (!items.length) throw new Error("Cannot bill an empty order");
    const snap = computeInvoiceSnapshot(
      items.map((i) => ({ qty: i.qty, unit_price_paise: i.unit_price_paise, tax_bps: this.taxBps(i.tax_bps) })),
      opts.discount_paise ?? 0,
      opts.payments.reduce((a, p) => a + p.amount_paise, 0),
    );
    const invoice: Invoice = {
      ...this.meta(),
      business_id: order.business_id,
      customer_id: opts.customer_id ?? order.customer_id,
      order_id: order.id,
      booking_id: null,
      invoice_number: this.nextInv("RESTAURANT"),
      invoice_type: "RESTAURANT",
      business_date: businessDateInKolkata(this.now()),
      ...snap,
      payment_status: paymentStatus(snap.paid_amount_paise, snap.total_paise),
      status: "ISSUED",
      notes: snap.paid_amount_paise < snap.total_paise ? "Partial payment" : "",
    };
    this.state.invoices.push(invoice);
    this.enqueue("invoice", invoice.id, "CREATE", invoice);
    const invItems: InvoiceItem[] = items.map((i) => ({
      ...this.meta(),
      invoice_id: invoice.id,
      name: i.name,
      qty: i.qty,
      unit_price_paise: i.unit_price_paise,
      amount_paise: i.unit_price_paise * i.qty,
    }));
    for (const ii of invItems) {
      this.state.invoiceItems.push(ii);
      this.enqueue("invoice_item", ii.id, "CREATE", ii);
    }
    for (const p of opts.payments) {
      this.recordPayment({
        business_id: order.business_id,
        invoice_id: invoice.id,
        customer_id: invoice.customer_id,
        amount_paise: p.amount_paise,
        method: p.method,
      });
    }
    this.pushLedger({
      business_id: order.business_id,
      type: "SALE",
      amount_paise: snap.total_paise,
      description: `Invoice ${invoice.invoice_number}`,
      ref_id: invoice.id,
      ref_type: "invoice",
    });
    const advance = (toPaid: boolean) => {
      const current = this.mustOrder(order.id);
      if (current.status === "OPEN" || current.status === "HELD") {
        this.transitionOrder(order.id, "IN_PROGRESS");
      }
      if (this.mustOrder(order.id).status === "IN_PROGRESS") this.transitionOrder(order.id, "COMPLETED");
      if (toPaid && this.mustOrder(order.id).status === "COMPLETED") this.transitionOrder(order.id, "PAID");
    };
    if (snap.balance_amount_paise === 0) {
      advance(true);
      if (order.table_id) this.releaseTable(order.table_id);
    } else {
      advance(false);
    }
    this.audit("invoice.create", "invoice", invoice.id, null, invoice);
    this.enqueue("order", order.id, "UPDATE", this.mustOrder(order.id));
    for (const line of items) this.enqueue("order_item", line.id, "UPDATE", line);
    return invoice;
  }

  recordPayment(input: {
    business_id: string;
    invoice_id?: string | null;
    booking_id?: string | null;
    customer_id?: string | null;
    amount_paise: number;
    method: PaymentMethod;
    notes?: string;
  }): Payment {
    this.requireUser();
    const payment: Payment = {
      ...this.meta(),
      business_id: input.business_id,
      invoice_id: input.invoice_id ?? null,
      booking_id: input.booking_id ?? null,
      customer_id: input.customer_id ?? null,
      amount_paise: input.amount_paise,
      method: input.method,
      business_date: businessDateInKolkata(this.now()),
      notes: input.notes ?? "",
    };
    this.state.payments.push(payment);
    this.enqueue("payment", payment.id, "CREATE", payment);
    this.pushLedger({
      business_id: input.business_id,
      type: "PAYMENT",
      amount_paise: input.amount_paise,
      description: `${input.method} payment`,
      ref_id: payment.id,
      ref_type: "payment",
    });
    if (input.invoice_id) {
      const inv = this.state.invoices.find((i) => i.id === input.invoice_id)!;
      const paid = this.state.payments.filter((p) => p.invoice_id === inv.id && !p.deleted_at).reduce((a, p) => a + p.amount_paise, 0);
      inv.paid_amount_paise = Math.min(paid, inv.total_paise);
      inv.balance_amount_paise = inv.total_paise - inv.paid_amount_paise;
      inv.payment_status = paymentStatus(inv.paid_amount_paise, inv.total_paise);
      inv.updated_at = this.now();
    }
    if (input.booking_id) {
      const b = this.state.bookings.find((x) => x.id === input.booking_id)!;
      b.paid_paise = this.state.payments.filter((p) => p.booking_id === b.id && !p.deleted_at).reduce((a, p) => a + p.amount_paise, 0);
      b.balance_paise = b.total_paise - b.paid_paise;
      b.updated_at = this.now();
    }
    return payment;
  }

  voidInvoice(invoiceId: string, reason: string) {
    const user = this.require("invoices.modify_old");
    const inv = this.state.invoices.find((i) => i.id === invoiceId);
    if (!inv) throw new Error("Invoice not found");
    const old = { ...inv };
    inv.status = financialRecordStatus("void");
    inv.updated_at = this.now();
    inv.sync_status = "PENDING";
    this.enqueue("invoice", inv.id, "UPDATE", inv);
    this.audit("invoice.void", "invoice", inv.id, old, { status: inv.status, reason, who: user.username });
    return inv;
  }

  createBooking(input: {
    business_id: string;
    customer_id: string;
    room_id: string;
    check_in: string;
    check_out: string;
    adults: number;
    children: number;
    rate_paise: number;
    extra_charges_paise?: number;
    discount_paise?: number;
    tax_bps?: number;
    paid_paise?: number;
    payment_method?: PaymentMethod;
  }): Booking {
    this.require("bookings.manage");
    const customer = this.state.customers.find((c) => c.id === input.customer_id && !c.deleted_at);
    if (!customer) throw new Error("Guest not found");
    const room = this.state.rooms.find((r) => r.id === input.room_id && !r.deleted_at);
    if (!room) throw new Error("Room not found");
    if (room.business_id !== input.business_id) throw new Error("Room belongs to another property");
    this.assertRoomFree(input.room_id, input.check_in, input.check_out);
    const totals = bookingTotals({
      check_in: input.check_in,
      check_out: input.check_out,
      rate_paise: input.rate_paise,
      extra_charges_paise: input.extra_charges_paise ?? 0,
      food_paise: 0,
      extra_bed_paise: 0,
      activities_paise: 0,
      other_income_paise: 0,
      discount_paise: input.discount_paise ?? 0,
      tax_bps: input.tax_bps ?? 0,
      paid_paise: input.paid_paise ?? 0,
    });
    const booking: Booking = {
      ...this.meta(),
      business_id: input.business_id,
      customer_id: input.customer_id,
      room_id: input.room_id,
      check_in: input.check_in,
      check_out: input.check_out,
      adults: input.adults,
      children: input.children,
      rate_paise: input.rate_paise,
      extra_charges_paise: input.extra_charges_paise ?? 0,
      food_paise: 0,
      extra_bed_paise: 0,
      activities_paise: 0,
      other_income_paise: 0,
      discount_paise: totals.discount_paise,
      tax_paise: totals.tax_paise,
      total_paise: totals.total_paise,
      paid_paise: totals.paid_amount_paise,
      balance_paise: totals.balance_amount_paise,
      status: "RESERVED",
      notes: "",
    };
    this.state.bookings.push(booking);
    this.setRoomStatus(input.room_id, "RESERVED");
    this.enqueue("booking", booking.id, "CREATE", booking);
    if ((input.paid_paise ?? 0) > 0) {
      this.recordPayment({
        business_id: input.business_id,
        booking_id: booking.id,
        customer_id: input.customer_id,
        amount_paise: input.paid_paise!,
        method: input.payment_method ?? "UPI",
      });
    }
    return booking;
  }

  updateBooking(
    id: string,
    input: {
      customer_id?: string;
      room_id?: string;
      check_in?: string;
      check_out?: string;
      adults?: number;
      children?: number;
      rate_paise?: number;
      total_paise?: number;
      notes?: string;
    },
  ): Booking {
    this.require("bookings.manage");
    const b = this.mustBooking(id);
    if (b.status === "CHECKED_OUT" || b.status === "CANCELLED" || b.status === "NO_SHOW") {
      throw new Error("Cannot edit a completed or cancelled booking");
    }
    const customerId = input.customer_id ?? b.customer_id;
    if (!this.state.customers.some((c) => c.id === customerId && !c.deleted_at)) {
      throw new Error("Guest not found");
    }
    const roomId = input.room_id ?? b.room_id;
    const room = this.state.rooms.find((r) => r.id === roomId && !r.deleted_at);
    if (!room) throw new Error("Room not found");
    if (room.business_id !== b.business_id) throw new Error("Room belongs to another property");
    const checkInAt = input.check_in ?? b.check_in;
    const checkOutAt = input.check_out ?? b.check_out;
    const oldNights = daysBetween(b.check_in, b.check_out);
    const newNights = daysBetween(checkInAt, checkOutAt);
    if (newNights > oldNights) throw new Error("Stay can only be shortened, not extended");
    this.assertRoomFree(roomId, checkInAt, checkOutAt, b.id);
    const oldRoomId = b.room_id;
    b.customer_id = customerId;
    b.room_id = roomId;
    b.check_in = checkInAt;
    b.check_out = checkOutAt;
    b.adults = input.adults ?? b.adults;
    b.children = input.children ?? b.children;
    b.rate_paise = input.rate_paise ?? b.rate_paise;
    b.notes = input.notes ?? b.notes;
    if (input.total_paise !== undefined) {
      if (!Number.isInteger(input.total_paise) || input.total_paise < 0) throw new Error("Total must be integer paise");
      if (input.total_paise < b.paid_paise) throw new Error("Total cannot be less than amount already paid");
      const roomCharge = b.rate_paise * newNights;
      const locked = b.food_paise + b.extra_bed_paise + b.activities_paise;
      const floor = roomCharge + locked;
      if (input.total_paise <= floor) {
        b.extra_charges_paise = 0;
        b.other_income_paise = 0;
        b.discount_paise = floor - input.total_paise;
      } else {
        b.discount_paise = 0;
        b.other_income_paise = 0;
        b.extra_charges_paise = input.total_paise - floor;
      }
      b.tax_paise = 0;
      b.total_paise = input.total_paise;
      b.balance_paise = input.total_paise - b.paid_paise;
    } else {
      const totals = bookingTotals({
        check_in: b.check_in,
        check_out: b.check_out,
        rate_paise: b.rate_paise,
        extra_charges_paise: b.extra_charges_paise,
        food_paise: b.food_paise,
        extra_bed_paise: b.extra_bed_paise,
        activities_paise: b.activities_paise,
        other_income_paise: b.other_income_paise,
        discount_paise: b.discount_paise,
        tax_bps: 0,
        paid_paise: b.paid_paise,
      });
      b.tax_paise = totals.tax_paise;
      b.total_paise = totals.total_paise;
      b.balance_paise = totals.balance_amount_paise;
    }
    this.stamp(b);
    if (oldRoomId !== roomId) {
      this.refreshRoomOccupancy(oldRoomId);
      const next = roomStatusForBooking(b.status);
      if (next) this.setRoomStatus(roomId, next);
    }
    this.enqueue("booking", b.id, "UPDATE", b);
    return b;
  }

  cancelBooking(id: string): Booking {
    this.require("bookings.manage");
    const b = this.mustBooking(id);
    if (b.status === "CHECKED_OUT") throw new Error("Cannot cancel a completed stay");
    if (b.status === "CANCELLED") return b;
    b.status = "CANCELLED";
    this.stamp(b);
    this.refreshRoomOccupancy(b.room_id);
    this.enqueue("booking", b.id, "UPDATE", b);
    return b;
  }

  deleteBooking(id: string) {
    this.require("bookings.manage");
    const b = this.mustBooking(id);
    if (b.status === "CHECKED_IN") throw new Error("Check out or cancel this booking before deleting it");
    b.deleted_at = this.now();
    this.stamp(b);
    this.refreshRoomOccupancy(b.room_id);
    this.enqueue("booking", b.id, "DELETE", b);
  }

  checkIn(bookingId: string) {
    this.require("bookings.manage");
    const b = this.mustBooking(bookingId);
    if (b.status !== "RESERVED" && b.status !== "ENQUIRY") throw new Error("Cannot check in");
    if (b.status === "ENQUIRY") b.status = "RESERVED";
    b.status = "CHECKED_IN";
    this.stamp(b);
    this.setRoomStatus(b.room_id, roomStatusForBooking("CHECKED_IN")!);
    this.enqueue("booking", b.id, "UPDATE", b);
    return b;
  }

  checkOut(bookingId: string, extras?: { food_paise?: number; extra_bed_paise?: number; extra_charges_paise?: number }) {
    this.require("bookings.manage");
    const b = this.mustBooking(bookingId);
    if (b.status !== "CHECKED_IN") throw new Error("Not checked in");
    if (extras?.food_paise) b.food_paise += extras.food_paise;
    if (extras?.extra_bed_paise) b.extra_bed_paise += extras.extra_bed_paise;
    if (extras?.extra_charges_paise) b.extra_charges_paise += extras.extra_charges_paise;
    const totals = bookingTotals({
      check_in: b.check_in,
      check_out: b.check_out,
      rate_paise: b.rate_paise,
      extra_charges_paise: b.extra_charges_paise,
      food_paise: b.food_paise,
      extra_bed_paise: b.extra_bed_paise,
      activities_paise: b.activities_paise,
      other_income_paise: b.other_income_paise,
      discount_paise: b.discount_paise,
      tax_bps: 0,
      paid_paise: b.paid_paise,
    });
    b.tax_paise = totals.tax_paise;
    b.total_paise = totals.total_paise;
    b.balance_paise = totals.balance_amount_paise;
    b.status = "CHECKED_OUT";
    this.stamp(b);
    this.setRoomStatus(b.room_id, "CLEANING");
    this.enqueue("booking", b.id, "UPDATE", b);
    this.pushLedger({
      business_id: b.business_id,
      type: "BOOKING",
      amount_paise: b.total_paise,
      description: `Stay ${b.id}`,
      ref_id: b.id,
      ref_type: "booking",
    });
    return b;
  }

  generateStayInvoice(bookingId: string): Invoice {
    this.require("invoices.view");
    const b = this.mustBooking(bookingId);
    const nights = daysBetween(b.check_in, b.check_out);
    const lines = [
      { name: `Room ${nights} night(s)`, qty: nights, unit_price_paise: b.rate_paise, amount_paise: b.rate_paise * nights },
    ];
    if (b.food_paise) lines.push({ name: "Food", qty: 1, unit_price_paise: b.food_paise, amount_paise: b.food_paise });
    if (b.extra_bed_paise) lines.push({ name: "Extra bed", qty: 1, unit_price_paise: b.extra_bed_paise, amount_paise: b.extra_bed_paise });
    if (b.extra_charges_paise) lines.push({ name: "Extra charges", qty: 1, unit_price_paise: b.extra_charges_paise, amount_paise: b.extra_charges_paise });
    const lineSum = lines.reduce((a, l) => a + l.amount_paise, 0);
    let discount = b.discount_paise;
    if (lineSum > b.total_paise) discount = lineSum - b.total_paise;
    else if (lineSum < b.total_paise) {
      lines.push({
        name: "Adjustment",
        qty: 1,
        unit_price_paise: b.total_paise - lineSum,
        amount_paise: b.total_paise - lineSum,
      });
      discount = 0;
    }
    const snap = computeInvoiceSnapshot(
      lines.map((l) => ({ qty: l.qty, unit_price_paise: l.unit_price_paise, tax_bps: 0 })),
      discount,
      b.paid_paise,
    );
    const invoice: Invoice = {
      ...this.meta(),
      business_id: b.business_id,
      customer_id: b.customer_id,
      order_id: null,
      booking_id: b.id,
      invoice_number: this.nextInv("STAY"),
      invoice_type: "STAY",
      business_date: businessDateInKolkata(this.now()),
      ...snap,
      payment_status: paymentStatus(snap.paid_amount_paise, snap.total_paise),
      status: "ISSUED",
      notes: "",
    };
    this.state.invoices.push(invoice);
    this.enqueue("invoice", invoice.id, "CREATE", invoice);
    for (const l of lines) {
      const ii: InvoiceItem = { ...this.meta(), invoice_id: invoice.id, name: l.name, qty: l.qty, unit_price_paise: l.unit_price_paise, amount_paise: l.amount_paise };
      this.state.invoiceItems.push(ii);
      this.enqueue("invoice_item", ii.id, "CREATE", ii);
    }
    return invoice;
  }

  createRoom(input: {
    business_id: string;
    number: string;
    name?: string;
    capacity: number;
    base_price_paise: number;
    room_type_id?: string;
  }): Room {
    this.require("bookings.manage");
    const biz = this.state.businesses.find((b) => b.id === input.business_id);
    if (!biz || biz.type !== "STAY") throw new Error("Pick a stay property");
    const number = input.number.trim();
    if (!number) throw new Error("Room number is required");
    if (this.state.rooms.some((r) => !r.deleted_at && r.business_id === input.business_id && r.number === number)) {
      throw new Error("That room number already exists");
    }
    const typeId = input.room_type_id || this.defaultRoomType(input.business_id).id;
    const r: Room = {
      ...this.meta(),
      business_id: input.business_id,
      room_type_id: typeId,
      number,
      name: (input.name ?? "").trim() || number,
      capacity: input.capacity,
      base_price_paise: input.base_price_paise,
      status: "AVAILABLE",
    };
    this.state.rooms.push(r);
    this.enqueue("room", r.id, "CREATE", r);
    return r;
  }

  updateRoom(
    id: string,
    input: {
      number?: string;
      name?: string;
      capacity?: number;
      base_price_paise?: number;
      room_type_id?: string;
      status?: Room["status"];
    },
  ): Room {
    this.require("bookings.manage");
    const r = this.state.rooms.find((x) => x.id === id && !x.deleted_at);
    if (!r) throw new Error("Room not found");
    if (input.number && input.number !== r.number) {
      if (this.state.rooms.some((x) => !x.deleted_at && x.business_id === r.business_id && x.number === input.number)) {
        throw new Error("That room number already exists");
      }
    }
    Object.assign(r, {
      number: input.number?.trim() || r.number,
      name: input.name !== undefined ? input.name.trim() || r.number : r.name,
      capacity: input.capacity ?? r.capacity,
      base_price_paise: input.base_price_paise ?? r.base_price_paise,
      room_type_id: input.room_type_id ?? r.room_type_id,
    });
    if (input.status) r.status = input.status;
    this.stamp(r);
    this.enqueue("room", r.id, "UPDATE", r);
    return r;
  }

  deleteRoom(id: string) {
    this.require("bookings.manage");
    const r = this.state.rooms.find((x) => x.id === id && !x.deleted_at);
    if (!r) throw new Error("Room not found");
    const active = this.state.bookings.some(
      (b) =>
        b.room_id === id &&
        !b.deleted_at &&
        (b.status === "ENQUIRY" || b.status === "RESERVED" || b.status === "CHECKED_IN"),
    );
    if (active) throw new Error("Cannot delete a room with an active booking");
    r.deleted_at = this.now();
    this.stamp(r);
    this.enqueue("room", r.id, "DELETE", r);
  }

  createExpense(input: {
    business_id: string;
    category: string;
    amount_paise: number;
    payment_method: PaymentMethod;
    description: string;
    vendor?: string;
  }): Expense {
    this.require("expenses.manage");
    const e: Expense = {
      ...this.meta(),
      business_id: input.business_id,
      category: input.category,
      amount_paise: input.amount_paise,
      payment_method: input.payment_method,
      business_date: businessDateInKolkata(this.now()),
      description: input.description,
      vendor: input.vendor ?? "",
      attachment: null,
    };
    this.state.expenses.push(e);
    this.enqueue("expense", e.id, "CREATE", e);
    this.pushLedger({
      business_id: e.business_id,
      type: "EXPENSE",
      amount_paise: -e.amount_paise,
      description: e.description,
      ref_id: e.id,
      ref_type: "expense",
    });
    return e;
  }

  closeDay(businessId: string, actualCashPaise: number): DailyClosing {
    this.require("day.close");
    const date = businessDateInKolkata(this.now());
    if (isDayClosed(this.state.dailyClosings, businessId, date)) throw new Error("Already closed");
    const sales = this.state.payments.filter((p) => p.business_id === businessId && p.business_date === date && !p.deleted_at);
    const cash = sales.filter((p) => p.method === "CASH").reduce((a, p) => a + p.amount_paise, 0);
    const upi = sales.filter((p) => p.method === "UPI").reduce((a, p) => a + p.amount_paise, 0);
    const card = sales.filter((p) => p.method === "CARD").reduce((a, p) => a + p.amount_paise, 0);
    const closing: DailyClosing = {
      ...this.meta(),
      business_id: businessId,
      business_date: date,
      cash_sales_paise: cash,
      upi_sales_paise: upi,
      card_sales_paise: card,
      expected_cash_paise: cash,
      actual_cash_paise: actualCashPaise,
      difference_paise: actualCashPaise - cash,
      closed_by: this.requireUser().id,
      status: "CLOSED",
      reopened_at: null,
      reopen_reason: "",
    };
    this.state.dailyClosings.push(closing);
    this.enqueue("daily_closing", closing.id, "CREATE", closing);
    return closing;
  }

  openShift(businessId: string, name: string, openingCash: number): Shift {
    this.require("day.close");
    const s: Shift = {
      ...this.meta(),
      business_id: businessId,
      name,
      opened_at: this.now(),
      closed_at: null,
      opening_cash_paise: openingCash,
      sales_paise: 0,
      expenses_paise: 0,
      closing_cash_paise: null,
      difference_paise: null,
    };
    this.state.shifts.push(s);
    this.enqueue("shift", s.id, "CREATE", s);
    return s;
  }

  closeShift(shiftId: string, closingCash: number): Shift {
    const s = this.state.shifts.find((x) => x.id === shiftId);
    if (!s) throw new Error("Shift not found");
    const date = businessDateInKolkata(s.opened_at);
    const sales = this.state.payments
      .filter((p) => p.business_id === s.business_id && p.business_date === date)
      .reduce((a, p) => a + p.amount_paise, 0);
    const expenses = this.state.expenses
      .filter((e) => e.business_id === s.business_id && e.business_date === date)
      .reduce((a, e) => a + e.amount_paise, 0);
    s.sales_paise = sales;
    s.expenses_paise = expenses;
    s.closing_cash_paise = closingCash;
    s.closed_at = this.now();
    s.difference_paise = closingCash - (s.opening_cash_paise + sales - expenses);
    this.enqueue("shift", s.id, "UPDATE", s);
    return s;
  }

  search(query: string) {
    const q = query.trim().toLowerCase();
    const customers = this.state.customers.filter(
      (c) => c.name.toLowerCase().includes(q) || matchesPhone(query, c.phone) || c.email.toLowerCase().includes(q),
    );
    const invoices = this.state.invoices.filter(
      (i) => i.invoice_number.toLowerCase().includes(q) || customers.some((c) => c.id === i.customer_id),
    );
    const bookings = this.state.bookings.filter((b) => customers.some((c) => c.id === b.customer_id) || b.id.toLowerCase().includes(q));
    const rooms = this.state.rooms.filter((r) => r.number.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
    const payments = this.state.payments.filter((p) => customers.some((c) => c.id === p.customer_id) || p.id.toLowerCase().includes(q));
    return { customers, invoices, bookings, rooms, payments };
  }

  customerLedger(customerId: string) {
    const charges = this.state.invoices.filter((i) => i.customer_id === customerId && i.status === "ISSUED").reduce((a, i) => a + i.total_paise, 0);
    const paid = this.state.payments.filter((p) => p.customer_id === customerId).reduce((a, p) => a + p.amount_paise, 0);
    return { total_charges_paise: charges, total_paid_paise: paid, outstanding_paise: charges - paid };
  }

  dashboard() {
    const today = businessDateInKolkata(this.now());
    const month = monthKey(today);
    const year = yearKey(today);
    const issued = this.state.invoices.filter((i) => i.status === "ISSUED");
    const revenueToday = issued.filter((i) => i.business_date === today).reduce((a, i) => a + i.total_paise, 0);
    const revenueMonth = issued.filter((i) => monthKey(i.business_date) === month).reduce((a, i) => a + i.total_paise, 0);
    const byBusiness = this.state.businesses.map((b) => {
      const inv = issued.filter((i) => i.business_id === b.id);
      const expenses = this.state.expenses.filter((e) => e.business_id === b.id);
      const todayR = inv.filter((i) => i.business_date === today).reduce((a, i) => a + i.total_paise, 0);
      const monthR = inv.filter((i) => monthKey(i.business_date) === month).reduce((a, i) => a + i.total_paise, 0);
      const yearR = inv.filter((i) => yearKey(i.business_date) === year).reduce((a, i) => a + i.total_paise, 0);
      const revenue = inv.reduce((a, i) => a + i.total_paise, 0);
      const expense = expenses.reduce((a, e) => a + e.amount_paise, 0);
      return {
        business: b,
        today: todayR,
        month: monthR,
        year: yearR,
        revenue,
        expenses: expense,
        profit: profit(revenue, expense),
        transactions: inv.length,
        avg: inv.length ? Math.round(revenue / inv.length) : 0,
      };
    });
    const restaurant = byBusiness.filter((x) => x.business.type === "RESTAURANT").reduce((a, x) => a + x.month, 0);
    const stay = byBusiness.filter((x) => x.business.type === "STAY").reduce((a, x) => a + x.month, 0);
    return { today: revenueToday, month: revenueMonth, restaurant, stay, byBusiness, todayDate: today };
  }

  analytics(from: string, to: string, businessId?: string) {
    const issued = this.state.invoices.filter(
      (i) =>
        !i.deleted_at &&
        i.status === "ISSUED" &&
        i.business_date >= from &&
        i.business_date <= to &&
        (!businessId || i.business_id === businessId),
    );
    const invoicedBookings = new Set(this.state.invoices.filter((i) => i.booking_id && !i.deleted_at && i.status === "ISSUED").map((i) => i.booking_id));
    const stayRevenue = this.state.bookings
      .filter(
        (b) =>
          !b.deleted_at &&
          b.status === "CHECKED_OUT" &&
          b.check_out >= from &&
          b.check_out <= to &&
          (!businessId || b.business_id === businessId) &&
          !invoicedBookings.has(b.id),
      )
      .reduce((a, b) => a + b.total_paise, 0);
    const expenses = this.state.expenses.filter(
      (e) => !e.deleted_at && e.business_date >= from && e.business_date <= to && (!businessId || e.business_id === businessId),
    );
    const revenue = issued.reduce((a, i) => a + i.total_paise, 0) + stayRevenue;
    const expense = expenses.reduce((a, e) => a + e.amount_paise, 0);
    const byDate: Record<string, number> = {};
    const byMonth: Record<string, number> = {};
    const byYear: Record<string, number> = {};
    for (const i of issued) {
      byDate[i.business_date] = (byDate[i.business_date] ?? 0) + i.total_paise;
      byMonth[monthKey(i.business_date)] = (byMonth[monthKey(i.business_date)] ?? 0) + i.total_paise;
      byYear[yearKey(i.business_date)] = (byYear[yearKey(i.business_date)] ?? 0) + i.total_paise;
    }
    const stayRows = this.state.bookings.filter(
      (b) =>
        !b.deleted_at &&
        b.status === "CHECKED_OUT" &&
        b.check_out >= from &&
        b.check_out <= to &&
        (!businessId || b.business_id === businessId) &&
        !invoicedBookings.has(b.id),
    );
    for (const b of stayRows) {
      byDate[b.check_out] = (byDate[b.check_out] ?? 0) + b.total_paise;
      byMonth[monthKey(b.check_out)] = (byMonth[monthKey(b.check_out)] ?? 0) + b.total_paise;
      byYear[yearKey(b.check_out)] = (byYear[yearKey(b.check_out)] ?? 0) + b.total_paise;
    }
    return {
      revenue,
      expenses: expense,
      profit: profit(revenue, expense),
      transactions: issued.length + stayRows.length,
      byDate,
      byMonth,
      byYear,
    };
  }

  restaurantAnalytics(businessId: string, from: string, to: string) {
    const invoices = this.state.invoices.filter(
      (i) => i.business_id === businessId && i.invoice_type === "RESTAURANT" && i.business_date >= from && i.business_date <= to,
    );
    const issued = invoices.filter((i) => i.status === "ISSUED");
    const cancelled = invoices.filter((i) => i.status === "CANCELLED" || i.status === "VOIDED");
    const items = this.state.invoiceItems.filter((ii) => issued.some((i) => i.id === ii.invoice_id));
    const productSales: Record<string, { name: string; qty: number; amount: number }> = {};
    for (const it of items) {
      productSales[it.name] = productSales[it.name] ?? { name: it.name, qty: 0, amount: 0 };
      productSales[it.name].qty += it.qty;
      productSales[it.name].amount += it.amount_paise;
    }
    const top = Object.values(productSales).sort((a, b) => b.qty - a.qty).slice(0, 10);
    const payments = this.state.payments.filter((p) => issued.some((i) => i.id === p.invoice_id));
    const byMethod: Record<string, number> = {};
    const byHour: Record<number, number> = {};
    for (const p of payments) byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount_paise;
    for (const i of issued) {
      const h = new Date(i.created_at).getUTCHours();
      byHour[h] = (byHour[h] ?? 0) + i.total_paise;
    }
    const sales = issued.reduce((a, i) => a + i.total_paise, 0);
    const discounts = issued.reduce((a, i) => a + i.discount_paise, 0);
    const tax = issued.reduce((a, i) => a + i.tax_paise, 0);
    return {
      total_sales: sales,
      bills: issued.length,
      average_bill: issued.length ? Math.round(sales / issued.length) : 0,
      top_products: top,
      discounts,
      tax,
      cancelled: cancelled.length,
      by_payment: byMethod,
      by_hour: byHour,
    };
  }

  stayAnalytics(businessId: string, from: string, to: string) {
    const rooms = this.state.rooms.filter((r) => r.business_id === businessId);
    const bookings = this.state.bookings.filter((b) => b.business_id === businessId && !["CANCELLED"].includes(b.status));
    const dates = eachDate(from, to);
    const availableNights = rooms.length * dates.length;
    let sold = 0;
    const perRoom: Record<string, number> = {};
    for (const r of rooms) perRoom[r.id] = 0;
    for (const b of bookings) {
      if (b.status === "NO_SHOW") continue;
      for (const d of dates) {
        if (d >= b.check_in && d < b.check_out) {
          sold += 1;
          perRoom[b.room_id] = (perRoom[b.room_id] ?? 0) + 1;
        }
      }
    }
    const roomRevenue = bookings.reduce((a, b) => a + b.rate_paise * daysBetween(b.check_in, b.check_out), 0);
    const checkIns = bookings.filter((b) => b.status === "CHECKED_IN" || b.status === "CHECKED_OUT").length;
    const checkOuts = bookings.filter((b) => b.status === "CHECKED_OUT").length;
    const cancellations = this.state.bookings.filter((b) => b.business_id === businessId && b.status === "CANCELLED").length;
    const noShows = this.state.bookings.filter((b) => b.business_id === businessId && b.status === "NO_SHOW").length;
    const durations = bookings.filter((b) => ["CHECKED_OUT", "CHECKED_IN", "RESERVED"].includes(b.status)).map((b) => daysBetween(b.check_in, b.check_out));
    const avgStay = durations.length ? durations.reduce((a, n) => a + n, 0) / durations.length : 0;
    return {
      occupancy: occupancyRate(sold, availableNights),
      room_revenue: roomRevenue,
      adr: adr(roomRevenue, sold),
      revpar: revpar(roomRevenue, availableNights),
      bookings: bookings.length,
      check_ins: checkIns,
      check_outs: checkOuts,
      cancellations,
      no_shows: noShows,
      revenue_per_room: perRoom,
      average_stay: avgStay,
      sold_nights: sold,
      available_nights: availableNights,
    };
  }

  calendar(businessId: string, from: string, to: string) {
    const rooms = this.state.rooms.filter((r) => r.business_id === businessId && !r.deleted_at);
    const dates = eachDate(from, to);
    return rooms.map((room) => ({
      room,
      days: dates.map((d) => {
        const booking = this.state.bookings.find(
          (b) =>
            b.room_id === room.id &&
            !b.deleted_at &&
            d >= b.check_in &&
            d < b.check_out &&
            !["CANCELLED", "NO_SHOW"].includes(b.status),
        );
        return { date: d, booking };
      }),
    }));
  }

  notifications() {
    const today = businessDateInKolkata(this.now());
    return {
      checkouts: this.state.bookings.filter((b) => b.check_out === today && b.status === "CHECKED_IN"),
      pendingPayments: this.state.invoices.filter((i) => i.status === "ISSUED" && i.balance_amount_paise > 0),
      unsynced: this.pendingCount(),
      upcoming: this.state.bookings.filter((b) => b.check_in > today && b.status === "RESERVED"),
    };
  }

  private collectionFor(type: EntityType): { id: string }[] | null {
    const collections: Record<EntityType, { id: string }[]> = {
      business: this.state.businesses,
      customer: this.state.customers,
      product: this.state.products,
      invoice: this.state.invoices,
      invoice_item: this.state.invoiceItems,
      payment: this.state.payments,
      booking: this.state.bookings,
      expense: this.state.expenses,
      order: this.state.orders,
      order_item: this.state.orderItems,
      room: this.state.rooms,
      table: this.state.tables,
      shift: this.state.shifts,
      daily_closing: this.state.dailyClosings,
      user: this.state.users,
    };
    return collections[type] ?? null;
  }

  applyRemoteRecords(records: RemoteSyncRecord[]): number {
    if (!records.length) return 0;
    let applied = 0;
    const pending = new Set(
      this.state.syncQueue.filter((q) => !q.synced_at).map((q) => `${q.entity_type}:${q.entity_id}`),
    );
    let latest = this.state.lastPulledAt;
    for (const rec of records) {
      if (rec.updated_at && (!latest || rec.updated_at > latest)) latest = rec.updated_at;
      if (pending.has(`${rec.entity_type}:${rec.entity_id}`)) continue;
      if (rec.entity_type === "user") continue;
      const col = this.collectionFor(rec.entity_type);
      if (!col) continue;
      let payload: Record<string, unknown> | null = null;
      if (rec.payload && typeof rec.payload === "object" && !Array.isArray(rec.payload)) {
        payload = rec.payload as Record<string, unknown>;
      } else if (typeof rec.payload === "string") {
        try {
          payload = JSON.parse(rec.payload) as Record<string, unknown>;
        } catch {
          payload = null;
        }
      }
      if (rec.operation === "DELETE") {
        const row = col.find((x) => x.id === rec.entity_id) as { deleted_at?: string | null; sync_status?: string } | undefined;
        if (row) {
          row.deleted_at = (payload?.deleted_at as string | undefined) ?? this.now();
          row.sync_status = "SYNCED";
          applied += 1;
        }
        continue;
      }
      if (!payload || typeof payload.id !== "string") continue;
      if (payload.notes === "seed") continue;
      const idx = col.findIndex((x) => x.id === payload!.id);
      const remoteUpdated = String(payload.updated_at ?? rec.updated_at ?? "");
      if (idx >= 0) {
        const local = col[idx] as { updated_at?: string };
        const localUpdated = String(local.updated_at ?? "");
        if (localUpdated && remoteUpdated && localUpdated > remoteUpdated) continue;
        col[idx] = { ...col[idx], ...payload, sync_status: "SYNCED" } as unknown as { id: string };
      } else {
        col.push({ ...payload, sync_status: "SYNCED" } as unknown as { id: string });
      }
      applied += 1;
    }
    if (latest) this.state.lastPulledAt = latest;
    this.state.lastSyncedAt = this.now();
    return applied;
  }

  async pullFromRemote(adapter: SyncAdapter, opts?: { full?: boolean }): Promise<number> {
    if (!adapter.pull) return 0;
    const records = await adapter.pull(opts?.full ? null : this.state.lastPulledAt);
    return this.applyRemoteRecords(records);
  }

  async processSyncQueue(adapter: SyncAdapter) {
    const ordered = syncQueueDependencyOrder(this.state.syncQueue.filter((q) => !q.synced_at && q.status !== "Failed"));
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const item of ordered) {
      item.status = "Syncing";
      try {
        const remote = await Promise.resolve(adapter.push(item));
        if (remote.conflict) {
          this.state.conflicts.push({
            id: this.id("conflict"),
            entity_type: item.entity_type,
            entity_id: item.entity_id,
            local_payload: item.payload,
            remote_payload: remote.remote_payload ?? "",
            resolved: false,
            created_at: this.now(),
          });
          this.markEntity(item.entity_type, item.entity_id, "CONFLICT");
          item.status = "Failed";
          item.last_error = "CONFLICT";
          results.push({ id: item.id, ok: false, error: "CONFLICT" });
          continue;
        }
        item.status = "Pending";
        item.synced_at = this.now();
        this.markEntity(item.entity_type, item.entity_id, "SYNCED", remote.server_id);
        results.push({ id: item.id, ok: true });
      } catch (e) {
        item.status = "Failed";
        item.retry_count += 1;
        item.last_error = e instanceof Error ? e.message : String(e);
        this.markEntity(item.entity_type, item.entity_id, "FAILED");
        results.push({ id: item.id, ok: false, error: item.last_error });
      }
    }
    if (results.every((r) => r.ok) && ordered.length) this.state.lastSyncedAt = this.now();
    return results;
  }

  retryFailed() {
    for (const q of this.state.syncQueue.filter((x) => x.status === "Failed" && x.last_error !== "CONFLICT")) {
      q.status = "Pending";
      this.markEntity(q.entity_type, q.entity_id, nextSyncStatus("FAILED", "retry"));
    }
  }

  resolveConflict(conflictId: string, use: "local" | "remote") {
    this.require("conflicts.resolve");
    const c = this.state.conflicts.find((x) => x.id === conflictId);
    if (!c) throw new Error("Conflict not found");
    c.resolved = true;
    if (use === "local") {
      this.enqueue(c.entity_type, c.entity_id, "UPDATE", JSON.parse(c.local_payload));
      this.markEntity(c.entity_type, c.entity_id, "PENDING");
    } else {
      this.markEntity(c.entity_type, c.entity_id, "SYNCED");
    }
    return c;
  }

  noteRemoteEdit(entityType: EntityType, entityId: string, localVersion: number, remoteVersion: number, localUpdated: string, remoteUpdated: string, localPayload: string, remotePayload: string) {
    if (lastWriteWinsAllowed(entityType)) return "lww";
    if (detectConflict(localVersion, remoteVersion, localUpdated, remoteUpdated)) {
      this.state.conflicts.push({
        id: this.id("conflict"),
        entity_type: entityType,
        entity_id: entityId,
        local_payload: localPayload,
        remote_payload: remotePayload,
        resolved: false,
        created_at: this.now(),
      });
      this.markEntity(entityType, entityId, "CONFLICT");
      return "conflict";
    }
    return "ok";
  }

  private markEntity(type: EntityType, id: string, status: AppState["invoices"][0]["sync_status"], server_id?: string | null) {
    const collections: Record<string, { id: string; sync_status: string; server_id: string | null }[]> = {
      invoice: this.state.invoices,
      invoice_item: this.state.invoiceItems,
      payment: this.state.payments,
      booking: this.state.bookings,
      expense: this.state.expenses,
      order: this.state.orders,
      order_item: this.state.orderItems,
      customer: this.state.customers,
      product: this.state.products,
      room: this.state.rooms,
      table: this.state.tables,
      daily_closing: this.state.dailyClosings,
    };
    const row = collections[type]?.find((x) => x.id === id);
    if (row) {
      row.sync_status = status;
      if (server_id) row.server_id = server_id;
    }
  }

  private pushLedger(input: Omit<LedgerEntry, keyof ReturnType<AppService["meta"]> | "business_date"> & { amount_paise: number }) {
    const e: LedgerEntry = {
      ...this.meta(),
      business_id: input.business_id,
      type: input.type,
      amount_paise: input.amount_paise,
      business_date: businessDateInKolkata(this.now()),
      description: input.description,
      ref_id: input.ref_id,
      ref_type: input.ref_type,
    };
    this.state.ledger.push(e);
  }

  private releaseTable(tableId: string) {
    const table = this.state.tables.find((t) => t.id === tableId);
    if (table) {
      table.status = "AVAILABLE";
      table.current_order_id = null;
    }
  }

  private defaultRoomType(businessId: string): RoomType {
    const existing = this.state.roomTypes.find((t) => t.business_id === businessId);
    if (existing) return existing;
    const t: RoomType = {
      id: this.id("rt"),
      business_id: businessId,
      name: "Standard",
      capacity: 2,
      base_price_paise: 250000,
    };
    this.state.roomTypes.push(t);
    return t;
  }

  private assertRoomFree(roomId: string, checkIn: string, checkOut: string, exceptBookingId?: string) {
    const clash = this.state.bookings.find(
      (x) =>
        x.room_id === roomId &&
        x.id !== exceptBookingId &&
        !x.deleted_at &&
        !["CANCELLED", "NO_SHOW", "CHECKED_OUT"].includes(x.status) &&
        checkIn < x.check_out &&
        x.check_in < checkOut,
    );
    if (clash) throw new Error("Room is already booked for those dates");
  }

  private refreshRoomOccupancy(roomId: string) {
    const live = this.state.bookings.find(
      (b) =>
        b.room_id === roomId &&
        !b.deleted_at &&
        (b.status === "CHECKED_IN" || b.status === "RESERVED" || b.status === "ENQUIRY"),
    );
    if (live?.status === "CHECKED_IN") this.setRoomStatus(roomId, "OCCUPIED");
    else if (live) this.setRoomStatus(roomId, "RESERVED");
    else this.setRoomStatus(roomId, "AVAILABLE");
  }

  private setRoomStatus(roomId: string, status: Room["status"]) {
    const room = this.state.rooms.find((r) => r.id === roomId && !r.deleted_at);
    if (!room || room.status === status) return;
    room.status = status;
    this.stamp(room);
    this.enqueue("room", room.id, "UPDATE", room);
  }

  private mustOrder(id: string): Order {
    const o = this.state.orders.find((x) => x.id === id);
    if (!o) throw new Error("Order not found");
    return o;
  }

  private mustBooking(id: string): Booking {
    const b = this.state.bookings.find((x) => x.id === id && !x.deleted_at);
    if (!b) throw new Error("Booking not found");
    return b;
  }
}

export interface RemoteSyncRecord {
  entity_type: EntityType;
  entity_id: string;
  operation: string;
  payload: unknown;
  updated_at?: string;
}

export interface SyncPushResult {
  server_id?: string;
  conflict?: boolean;
  remote_payload?: string;
}

export interface SyncAdapter {
  push(item: SyncQueueItem): SyncPushResult | Promise<SyncPushResult>;
  pull?(since: string | null): RemoteSyncRecord[] | Promise<RemoteSyncRecord[]>;
}

export class MemorySupabaseAdapter implements SyncAdapter {
  server = new Map<string, RemoteSyncRecord>();
  failNext = false;
  conflictNext = false;
  push(item: SyncQueueItem) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("network");
    }
    if (this.conflictNext) {
      this.conflictNext = false;
      return { conflict: true, remote_payload: '{"edited":true}' };
    }
    const server_id = `srv-${item.entity_id}`;
    let payload: unknown = item.payload;
    try {
      payload = JSON.parse(item.payload);
    } catch {
      payload = item.payload;
    }
    this.server.set(`${item.entity_type}:${item.entity_id}`, {
      entity_type: item.entity_type,
      entity_id: item.entity_id,
      operation: item.operation,
      payload,
      updated_at: new Date().toISOString(),
    });
    return { server_id };
  }
  pull(since: string | null) {
    return [...this.server.values()].filter((r) => !since || (r.updated_at && r.updated_at > since));
  }
}

export class HttpSyncAdapter implements SyncAdapter {
  async push(item: SyncQueueItem): Promise<SyncPushResult> {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [item] }),
    });
    if (!res.ok) throw new Error(`sync http ${res.status}`);
    const data = (await res.json()) as {
      results?: { entity_id?: string; server_id?: string; status?: string; remote_payload?: string }[];
    };
    const row = data.results?.[0];
    if (row?.status === "CONFLICT") {
      return { conflict: true, remote_payload: row.remote_payload ?? "" };
    }
    if (row?.status === "FAILED") throw new Error(row.remote_payload || "sync failed");
    return { server_id: row?.server_id ?? `srv-${item.entity_id}` };
  }

  async pull(since: string | null): Promise<RemoteSyncRecord[]> {
    const url = since ? `/api/sync?since=${encodeURIComponent(since)}` : "/api/sync";
    const res = await fetch(url);
    if (!res.ok) throw new Error(`sync pull http ${res.status}`);
    const data = (await res.json()) as { records?: RemoteSyncRecord[] };
    return data.records ?? [];
  }
}

export function createDefaultSyncAdapter(): SyncAdapter {
  if (typeof window !== "undefined") return new HttpSyncAdapter();
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_SYNC_ENABLED === "true") {
    return new HttpSyncAdapter();
  }
  return new MemorySupabaseAdapter();
}

import { billFromInvoice } from "./bill";

export function invoicePrintModel(state: AppState, invoiceId: string) {
  const invoice = state.invoices.find((i) => i.id === invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  const business = state.businesses.find((b) => b.id === invoice.business_id);
  const bill = billFromInvoice(state, invoiceId);
  return {
    logo: business?.logo_url ?? null,
    businessName: bill.businessName,
    address: bill.address,
    phone: bill.phone,
    gstin: bill.gstin,
    invoiceNo: bill.docNo,
    date: bill.date,
    customer: bill.customer,
    items: bill.items,
    subtotal: bill.subtotal,
    discount: bill.discount,
    tax: bill.tax,
    total: bill.total,
    paymentMethod: bill.paymentMethod,
    paymentStatus: bill.paymentStatus,
    thankYou: "Thank you",
  };
}

export { formatInvoiceNumber, hashPasswordSync };
