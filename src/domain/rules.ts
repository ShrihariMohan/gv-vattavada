import { computeInvoiceSnapshot, type Paise, paymentStatus, subPaise } from "./money";
import { daysBetween } from "./dates";
import type {
  Booking,
  BookingStatus,
  Invoice,
  InvoiceType,
  OrderStatus,
  PaymentMethod,
  Role,
  RoomStatus,
  SyncOperation,
  SyncQueueItem,
  SyncStatus,
} from "./types";

export const SYNC_FLOW: Record<SyncStatus, SyncStatus[]> = {
  PENDING: ["SYNCING"],
  SYNCING: ["SYNCED", "FAILED"],
  FAILED: ["RETRY"],
  RETRY: ["SYNCING"],
  SYNCED: [],
  CONFLICT: [],
};

export function nextSyncStatus(current: SyncStatus, event: "start" | "success" | "fail" | "retry"): SyncStatus {
  if (event === "start") {
    if (current === "PENDING" || current === "RETRY") return "SYNCING";
  }
  if (event === "success" && current === "SYNCING") return "SYNCED";
  if (event === "fail" && current === "SYNCING") return "FAILED";
  if (event === "retry" && current === "FAILED") return "RETRY";
  throw new Error(`Illegal sync transition ${current} + ${event}`);
}

export function orderTransitions(from: OrderStatus): OrderStatus[] {
  switch (from) {
    case "OPEN":
      return ["IN_PROGRESS", "HELD", "CANCELLED"];
    case "HELD":
      return ["OPEN", "IN_PROGRESS", "CANCELLED"];
    case "IN_PROGRESS":
      return ["COMPLETED", "HELD", "CANCELLED"];
    case "COMPLETED":
      return ["PAID", "CANCELLED"];
    case "PAID":
    case "CANCELLED":
      return [];
  }
}

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return orderTransitions(from).includes(to);
}

export function bookingTransitions(from: BookingStatus): BookingStatus[] {
  switch (from) {
    case "ENQUIRY":
      return ["RESERVED", "CANCELLED"];
    case "RESERVED":
      return ["CHECKED_IN", "CANCELLED", "NO_SHOW"];
    case "CHECKED_IN":
      return ["CHECKED_OUT"];
    case "CHECKED_OUT":
    case "CANCELLED":
    case "NO_SHOW":
      return [];
  }
}

export function roomStatusForBooking(status: BookingStatus): RoomStatus | null {
  if (status === "RESERVED") return "RESERVED";
  if (status === "CHECKED_IN") return "OCCUPIED";
  if (status === "CHECKED_OUT" || status === "CANCELLED" || status === "NO_SHOW") return "AVAILABLE";
  return null;
}

export function invoicePrefix(type: InvoiceType): "RES" | "STAY" {
  return type === "RESTAURANT" ? "RES" : "STAY";
}

export function formatInvoiceNumber(prefix: "RES" | "STAY", year: number, seq: number): string {
  return `${prefix}-${year}-${seq.toString().padStart(6, "0")}`;
}

export function nextInvoiceNumber(prefix: "RES" | "STAY", year: number, lastSeq: number): { number: string; seq: number } {
  const seq = lastSeq + 1;
  return { number: formatInvoiceNumber(prefix, year, seq), seq };
}

export function syncQueueDependencyOrder(items: SyncQueueItem[]): SyncQueueItem[] {
  const rank: Record<SyncOperation, number> = { CREATE: 0, UPDATE: 1, DELETE: 2 };
  const entityRank: Record<string, number> = {
    customer: 0,
    product: 1,
    order: 2,
    order_item: 3,
    booking: 2,
    invoice: 4,
    invoice_item: 5,
    payment: 6,
    expense: 6,
    daily_closing: 7,
  };
  return [...items].sort((a, b) => {
    const oa = rank[a.operation];
    const ob = rank[b.operation];
    if (oa !== ob) return oa - ob;
    const ea = entityRank[a.entity_type] ?? 50;
    const eb = entityRank[b.entity_type] ?? 50;
    if (ea !== eb) return a.operation === "DELETE" ? eb - ea : ea - eb;
    return a.created_at.localeCompare(b.created_at);
  });
}

export function can(role: Role, action: Permission): boolean {
  if (role === "ADMIN") return true;
  const allowed = ROLE_ACTIONS[role];
  return allowed.has(action);
}

export type Permission =
  | "pos.use"
  | "pos.create_bill"
  | "products.view"
  | "products.edit"
  | "sales.view"
  | "bookings.manage"
  | "expenses.manage"
  | "reports.view"
  | "invoices.view"
  | "invoices.modify_old"
  | "invoices.delete"
  | "analytics.financial"
  | "users.manage"
  | "settings.manage"
  | "conflicts.resolve"
  | "day.close";

const RESTAURANT_STAFF_ACTIONS = new Set<Permission>(["pos.use", "pos.create_bill", "products.view"]);

const STAY_STAFF_ACTIONS = new Set<Permission>(["bookings.manage", "invoices.view"]);

const RESTAURANT_MANAGER_ACTIONS = new Set<Permission>([
  ...RESTAURANT_STAFF_ACTIONS,
  "products.edit",
  "sales.view",
  "expenses.manage",
  "reports.view",
  "invoices.view",
  "analytics.financial",
  "day.close",
]);

const STAY_MANAGER_ACTIONS = new Set<Permission>([
  ...STAY_STAFF_ACTIONS,
  "sales.view",
  "expenses.manage",
  "reports.view",
  "analytics.financial",
]);

const MANAGER_ACTIONS = new Set<Permission>([
  ...RESTAURANT_MANAGER_ACTIONS,
  ...STAY_MANAGER_ACTIONS,
]);

const ROLE_ACTIONS: Record<Exclude<Role, "ADMIN">, Set<Permission>> = {
  MANAGER: MANAGER_ACTIONS,
  STAFF: RESTAURANT_STAFF_ACTIONS,
  RESTAURANT_MANAGER: RESTAURANT_MANAGER_ACTIONS,
  RESTAURANT_STAFF: RESTAURANT_STAFF_ACTIONS,
  STAY_MANAGER: STAY_MANAGER_ACTIONS,
  STAY_STAFF: STAY_STAFF_ACTIONS,
};

export function financialRecordStatus(action: "void" | "cancel" | "reverse"): "VOIDED" | "CANCELLED" | "REVERSED" {
  if (action === "void") return "VOIDED";
  if (action === "cancel") return "CANCELLED";
  return "REVERSED";
}

export function lastWriteWinsAllowed(entityType: string): boolean {
  return entityType === "product" || entityType === "business";
}

export function detectConflict(localVersion: number, remoteVersion: number, localUpdated: string, remoteUpdated: string): boolean {
  return localVersion !== remoteVersion && localUpdated !== remoteUpdated;
}

export function profit(revenuePaise: Paise, expensePaise: Paise): Paise {
  return subPaise(revenuePaise, expensePaise);
}

export function occupancyRate(soldNights: number, availableNights: number): number {
  if (availableNights <= 0) return 0;
  return soldNights / availableNights;
}

export function adr(roomRevenuePaise: Paise, soldNights: number): Paise {
  if (soldNights <= 0) return 0;
  return Math.round(roomRevenuePaise / soldNights);
}

export function revpar(roomRevenuePaise: Paise, availableNights: number): Paise {
  if (availableNights <= 0) return 0;
  return Math.round(roomRevenuePaise / availableNights);
}

export function foodCostPct(foodCostPaise: Paise, foodRevenuePaise: Paise): number {
  if (foodRevenuePaise === 0) return 0;
  return (foodCostPaise / foodRevenuePaise) * 100;
}

export function grossMargin(revenuePaise: Paise, cogsPaise: Paise): Paise {
  return subPaise(revenuePaise, cogsPaise);
}

export function bookingTotals(input: {
  nights?: number;
  check_in?: string;
  check_out?: string;
  rate_paise: Paise;
  extra_charges_paise: Paise;
  food_paise: Paise;
  extra_bed_paise: Paise;
  activities_paise: Paise;
  other_income_paise: Paise;
  discount_paise: Paise;
  tax_bps: number;
  paid_paise: Paise;
}) {
  const nights = input.nights ?? daysBetween(input.check_in!, input.check_out!);
  const room = input.rate_paise * nights;
  const snap = computeInvoiceSnapshot(
    [
      { qty: 1, unit_price_paise: room, tax_bps: input.tax_bps },
      { qty: 1, unit_price_paise: input.extra_charges_paise, tax_bps: input.tax_bps },
      { qty: 1, unit_price_paise: input.food_paise, tax_bps: input.tax_bps },
      { qty: 1, unit_price_paise: input.extra_bed_paise, tax_bps: input.tax_bps },
      { qty: 1, unit_price_paise: input.activities_paise, tax_bps: input.tax_bps },
      { qty: 1, unit_price_paise: input.other_income_paise, tax_bps: input.tax_bps },
    ].filter((l) => l.unit_price_paise > 0),
    input.discount_paise,
    input.paid_paise,
  );
  return { nights, ...snap, payment_status: paymentStatus(snap.paid_amount_paise, snap.total_paise) };
}

export function stayIncomeBreakdown(booking: Pick<Booking, "rate_paise" | "check_in" | "check_out" | "food_paise" | "extra_bed_paise" | "activities_paise" | "other_income_paise">) {
  const nights = daysBetween(booking.check_in, booking.check_out);
  return {
    room_revenue: booking.rate_paise * nights,
    food_revenue: booking.food_paise,
    extra_bed: booking.extra_bed_paise,
    activities: booking.activities_paise,
    other: booking.other_income_paise,
  };
}

export const RESTAURANT_EXPENSE_CATEGORIES = [
  "Vegetables",
  "Meat",
  "Milk",
  "Gas",
  "Electricity",
  "Staff",
  "Supplies",
  "Maintenance",
  "Other",
] as const;

export const GLOBAL_EXPENSE_CATEGORIES = [
  "Rent",
  "Electricity",
  "Water",
  "Internet",
  "Salary",
  "Food Supplies",
  "Maintenance",
  "Transportation",
  "Marketing",
  "Other",
] as const;

export const STAY_EXPENSE_CATEGORIES = [
  "Electricity",
  "Water",
  "Cleaning",
  "Staff",
  "Maintenance",
  "Supplies",
  "Food",
  "Other",
] as const;

export const PRODUCT_CATEGORIES = [
  "Breakfast",
  "Lunch",
  "Dinner",
  "Beverages",
  "Snacks",
  "Main Course",
  "Desserts",
] as const;

export const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"];

export const KEYBOARD_SHORTCUTS = {
  F1: "New Bill",
  F2: "Search",
  F3: "Hold",
  F4: "Payment",
  F5: "Print",
  Escape: "Cancel",
} as const;

export function isDayClosed(
  closings: { business_id: string; business_date: string; status?: "CLOSED" | "REOPENED"; deleted_at?: string | null }[],
  businessId: string,
  date: string,
): boolean {
  return closings.some(
    (c) =>
      c.business_id === businessId &&
      c.business_date === date &&
      (c.status ?? "CLOSED") === "CLOSED" &&
      !c.deleted_at,
  );
}

export function assertMutableFinancial(opts: {
  invoice?: Invoice;
  dayClosed: boolean;
  role: Role;
  correctionProcess: boolean;
}) {
  if (opts.invoice && (opts.invoice.status === "VOIDED" || opts.invoice.status === "CANCELLED" || opts.invoice.status === "REVERSED")) {
    throw new Error("Financial record is locked");
  }
  if (opts.dayClosed && !opts.correctionProcess) {
    throw new Error("Day is closed; use an explicit correction process");
  }
  if (opts.invoice && !can(opts.role, "invoices.modify_old") && opts.invoice.status === "ISSUED") {
    throw new Error("Staff cannot modify issued invoices");
  }
}

export function matchesPhone(query: string, phone: string): boolean {
  const q = query.replace(/\D/g, "");
  const p = phone.replace(/\D/g, "");
  return q.length >= 4 && p.includes(q);
}

export function reportFormats(): Array<"PDF" | "Excel" | "CSV" | "Print"> {
  return ["PDF", "Excel", "CSV", "Print"];
}

export function csvEscape(rows: (string | number)[][]): string {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell);
          if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        })
        .join(","),
    )
    .join("\n");
}

export function thermalWidthChars(mm: 58 | 80): number {
  return mm === 58 ? 32 : 48;
}

export function wrapInvoiceLines(
  items: { name: string; qty: number; amount: string }[],
  width: number,
): string[] {
  return items.map((i) => {
    const right = `${i.qty} ${i.amount}`;
    const leftMax = Math.max(8, width - right.length - 1);
    const name = i.name.slice(0, leftMax).padEnd(leftMax);
    return `${name} ${right}`;
  });
}

export function averageBill(totalPaise: Paise, billCount: number): Paise {
  if (billCount <= 0) return 0;
  return Math.round(totalPaise / billCount);
}

export function hourBucket(isoUtc: string, timeZone = "Asia/Kolkata"): number {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false }).format(new Date(isoUtc)),
  );
  return hour;
}

export function hashPasswordSync(password: string, salt: string): string {
  let h = 2166136261;
  const s = `${salt}:${password}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  return hashPasswordSync(password, salt) === hash;
}

export function deviceIdFromName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function splitPaymentsValid(parts: { method: PaymentMethod; amount_paise: Paise }[], total: Paise): boolean {
  const sum = parts.reduce((a, p) => a + p.amount_paise, 0);
  return sum === total && parts.every((p) => p.amount_paise > 0);
}

export function roomsOverlap(aIn: string, aOut: string, bIn: string, bOut: string): boolean {
  return aIn < bOut && bIn < aOut;
}
