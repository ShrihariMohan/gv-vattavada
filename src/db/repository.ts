import type { Booking, Expense, Invoice, InvoiceItem, LedgerEntry, Order, OrderItem, Payment } from "@/domain/types";
import { EntityDb, type ArchiveManifestRow } from "./entity-store";

/**
 * Indexed reads over the per-entity stores. Every query hits a Dexie index instead of
 * filtering whole arrays, so cost grows with the result size, not with the dataset.
 * Dates are business dates (YYYY-MM-DD, Asia/Kolkata), compared as strings.
 */
export class Repository {
  constructor(private db: EntityDb) {}

  invoicesByDate(businessId: string, from: string, to: string): Promise<Invoice[]> {
    return this.db
      .entity("invoices")
      .where("[business_id+business_date]")
      .between([businessId, from], [businessId, to], true, true)
      .filter((r) => !r.deleted_at)
      .toArray() as unknown as Promise<Invoice[]>;
  }

  invoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
    return this.db.entity("invoiceItems").where("invoice_id").equals(invoiceId).filter((r) => !r.deleted_at).toArray() as unknown as Promise<InvoiceItem[]>;
  }

  paymentsByDate(businessId: string, from: string, to: string): Promise<Payment[]> {
    return this.db
      .entity("payments")
      .where("[business_id+business_date]")
      .between([businessId, from], [businessId, to], true, true)
      .filter((r) => !r.deleted_at)
      .toArray() as unknown as Promise<Payment[]>;
  }

  paymentsForInvoice(invoiceId: string): Promise<Payment[]> {
    return this.db.entity("payments").where("invoice_id").equals(invoiceId).filter((r) => !r.deleted_at).toArray() as unknown as Promise<Payment[]>;
  }

  expensesByDate(businessId: string, from: string, to: string): Promise<Expense[]> {
    return this.db
      .entity("expenses")
      .where("[business_id+business_date]")
      .between([businessId, from], [businessId, to], true, true)
      .filter((r) => !r.deleted_at)
      .toArray() as unknown as Promise<Expense[]>;
  }

  ledgerByDate(businessId: string, from: string, to: string): Promise<LedgerEntry[]> {
    return this.db
      .entity("ledger")
      .where("[business_id+business_date]")
      .between([businessId, from], [businessId, to], true, true)
      .filter((r) => !r.deleted_at)
      .toArray() as unknown as Promise<LedgerEntry[]>;
  }

  ordersByStatus(businessId: string, status: Order["status"]): Promise<Order[]> {
    return this.db
      .entity("orders")
      .where("[business_id+status]")
      .equals([businessId, status])
      .filter((r) => !r.deleted_at)
      .toArray() as unknown as Promise<Order[]>;
  }

  orderItems(orderId: string): Promise<OrderItem[]> {
    return this.db.entity("orderItems").where("order_id").equals(orderId).filter((r) => !r.deleted_at).toArray() as unknown as Promise<OrderItem[]>;
  }

  /** Bookings overlapping [from, to) for one property. */
  bookingsOverlapping(businessId: string, from: string, to: string): Promise<Booking[]> {
    return this.db
      .entity("bookings")
      .where("[business_id+check_in]")
      .between([businessId, ""], [businessId, to], true, false)
      .filter((r) => !r.deleted_at && String(r.check_out) > from)
      .toArray() as unknown as Promise<Booking[]>;
  }

  async pendingOutbox(): Promise<number> {
    return this.db.outbox.filter((q) => !q.synced_at).count();
  }

  archiveManifests(): Promise<ArchiveManifestRow[]> {
    return this.db.archive_manifests.orderBy("month").reverse().toArray();
  }

  saveArchiveManifest(row: ArchiveManifestRow) {
    return this.db.archive_manifests.put(row);
  }
}
