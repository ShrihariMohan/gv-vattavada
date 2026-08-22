import { computeInvoiceSnapshot, formatINR } from "@/domain/money";
import type { AppState } from "@/domain/types";

export type BillLine = { name: string; qty: number; amount: string };

export type BillView = {
  kind: "INVOICE" | "BILL";
  businessName: string;
  address: string;
  phone: string;
  email: string;
  gstin: string | null;
  docNo: string;
  date: string;
  customer: string;
  guestPhone: string;
  room: string;
  table: string;
  items: BillLine[];
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  paymentMethod: string;
  paymentStatus: string;
  footerLines: string[];
};

function footerFor(businessName: string, address: string, phone: string): string[] {
  return [
    "Thank you. Please visit again.",
    businessName,
    address,
    phone,
    "This is a computer-generated bill.",
  ];
}

export function billFromInvoice(state: AppState, invoiceId: string): BillView {
  const invoice = state.invoices.find((i) => i.id === invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  const business = state.businesses.find((b) => b.id === invoice.business_id);
  if (!business) throw new Error("Business not found");
  const customer = state.customers.find((c) => c.id === invoice.customer_id);
  const order = invoice.order_id ? state.orders.find((o) => o.id === invoice.order_id) : undefined;
  const table = order?.table_id ? state.tables.find((t) => t.id === order.table_id) : undefined;
  const items = state.invoiceItems.filter((i) => i.invoice_id === invoiceId);
  const payments = state.payments.filter((p) => p.invoice_id === invoiceId && !p.deleted_at);
  return {
    kind: "INVOICE",
    businessName: business.name,
    address: business.address,
    phone: business.phone,
    email: business.email,
    gstin: business.gstin,
    docNo: invoice.invoice_number,
    date: invoice.business_date,
    customer: customer?.name || order?.guest_name || "Walk-in",
    guestPhone: order?.guest_phone || customer?.phone || "",
    room: order?.room_number || "",
    table: table?.name || "",
    items: items.map((i) => ({ name: i.name, qty: i.qty, amount: formatINR(i.amount_paise) })),
    subtotal: formatINR(invoice.subtotal_paise),
    discount: formatINR(invoice.discount_paise),
    tax: formatINR(invoice.tax_paise),
    total: formatINR(invoice.total_paise),
    paymentMethod: payments.map((p) => p.method).join(" + ") || "UNPAID",
    paymentStatus: invoice.payment_status,
    footerLines: footerFor(business.name, business.address, business.phone),
  };
}

export function billFromOrder(state: AppState, orderId: string, discountPaise = 0): BillView {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) throw new Error("Order not found");
  const business = state.businesses.find((b) => b.id === order.business_id);
  if (!business) throw new Error("Business not found");
  const items = state.orderItems.filter((i) => i.order_id === orderId && !i.deleted_at);
  const taxBps = (bps: number) => (state.tax_enabled === false ? 0 : bps);
  const snap = computeInvoiceSnapshot(
    items.map((i) => ({ qty: i.qty, unit_price_paise: i.unit_price_paise, tax_bps: taxBps(i.tax_bps) })),
    discountPaise,
    0,
  );
  const customer = state.customers.find((c) => c.id === order.customer_id);
  const table = order.table_id ? state.tables.find((t) => t.id === order.table_id) : undefined;
  const invoice = state.invoices.find((i) => i.order_id === orderId && i.status === "ISSUED");
  if (invoice) return billFromInvoice(state, invoice.id);
  return {
    kind: "BILL",
    businessName: business.name,
    address: business.address,
    phone: business.phone,
    email: business.email,
    gstin: business.gstin,
    docNo: `KOT-${order.id.slice(-8).toUpperCase()}`,
    date: order.created_at.slice(0, 10),
    customer: order.guest_name || customer?.name || "Walk-in",
    guestPhone: order.guest_phone || customer?.phone || "",
    room: order.room_number || "",
    table: table?.name || "",
    items: items.map((i) => ({
      name: i.name,
      qty: i.qty,
      amount: formatINR(i.unit_price_paise * i.qty),
    })),
    subtotal: formatINR(snap.subtotal_paise),
    discount: formatINR(snap.discount_paise),
    tax: formatINR(snap.tax_paise),
    total: formatINR(snap.total_paise),
    paymentMethod: "UNPAID",
    paymentStatus: order.status,
    footerLines: footerFor(business.name, business.address, business.phone),
  };
}

export function invoiceForOrder(state: AppState, orderId: string) {
  return state.invoices.find((i) => i.order_id === orderId && !i.deleted_at) ?? null;
}

export function orderChargePaise(state: AppState, orderId: string): number {
  const items = state.orderItems.filter((i) => i.order_id === orderId && !i.deleted_at);
  const taxBps = (bps: number) => (state.tax_enabled === false ? 0 : bps);
  return computeInvoiceSnapshot(
    items.map((i) => ({ qty: i.qty, unit_price_paise: i.unit_price_paise, tax_bps: taxBps(i.tax_bps) })),
    0,
    0,
  ).total_paise;
}

/** Open tickets and billed sales with a real total. Empty POS taps stay off the list. */
export function isListedOrder(state: AppState, order: { id: string; deleted_at: string | null; status: string }): boolean {
  if (order.deleted_at || order.status === "CANCELLED") return false;
  return orderChargePaise(state, order.id) > 0;
}
