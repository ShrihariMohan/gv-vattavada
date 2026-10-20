"use client";

import { Screen } from "@/ui/Screen";
import { Money } from "@/ui/Shell";
import { useApp } from "@/ui/AppProvider";
import { StatusBadge } from "@/ui/status-badge";
import { billFromOrder, invoiceForOrder, isListedOrder } from "@/domain/bill";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { businessDateInKolkata, formatKolkata } from "@/domain/dates";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { BillActions } from "@/ui/bill-actions";
import { BillSheet } from "@/ui/bill-sheet";
import type { Order } from "@/domain/types";

type OrderSort = "recent" | "oldest" | "total-desc" | "total-asc" | "guest";
const selectClass = "h-9 rounded-lg border border-input bg-background px-2.5 text-sm";

export default function OrdersPage() {
  const { service, refresh } = useApp();
  const router = useRouter();
  const restaurant = service.state.businesses.find((b) => b.type === "RESTAURANT")!;
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [view, setView] = useState<Order | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<OrderSort>("recent");
  const q = query.trim().toLowerCase();
  const totalsByOrder = new Map(
    service.state.orders.map((order) => [order.id, service.orderTotals(order.id).total_paise]),
  );
  const totalFor = (orderId: string) => totalsByOrder.get(orderId) ?? 0;
  const orders = service.state.orders
    .filter((o) => o.business_id === restaurant.id && isListedOrder(service.state, o))
    .filter((o) => status === "all" || o.status === status)
    .filter((o) => !from || businessDateInKolkata(o.created_at) >= from)
    .filter((o) => !to || businessDateInKolkata(o.created_at) <= to)
    .filter((o) => {
      if (!q) return true;
      const table = service.state.tables.find((t) => t.id === o.table_id);
      return [o.guest_name || "Walk-in", o.guest_phone, o.room_number, table?.name, o.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    })
    .slice()
    .sort((a, b) => {
      if (sort === "oldest") return a.created_at.localeCompare(b.created_at);
      if (sort === "total-desc") return totalFor(b.id) - totalFor(a.id) || b.created_at.localeCompare(a.created_at);
      if (sort === "total-asc") return totalFor(a.id) - totalFor(b.id) || b.created_at.localeCompare(a.created_at);
      if (sort === "guest") return (a.guest_name || "Walk-in").localeCompare(b.guest_name || "Walk-in");
      return b.created_at.localeCompare(a.created_at);
    });
  const bill = useMemo(() => (view ? billFromOrder(service.state, view.id) : null), [view, service.state]);

  return (
    <Screen
      title="Orders"
      description="Held, open, and billed tickets. View, share, or print the bill. Deleting an unbilled order cancels it."
      actions={<Button onClick={() => router.push("/pos")}>Open POS</Button>}
    >
      <div className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="grid gap-1.5 lg:col-span-2">
          <Label htmlFor="order-search">Search</Label>
          <Input
            id="order-search"
            placeholder="Guest, phone, room or table…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="order-status">Status</Label>
          <select id="order-status" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            {["OPEN", "IN_PROGRESS", "HELD", "COMPLETED", "PAID", "CANCELLED"].map((value) => (
              <option key={value} value={value}>{value.replace("_", " ")}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="order-from">From</Label>
          <Input id="order-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="order-to">To</Label>
          <Input id="order-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="order-sort">Sort by</Label>
          <select id="order-sort" className={selectClass} value={sort} onChange={(e) => setSort(e.target.value as OrderSort)}>
            <option value="recent">Most recent</option>
            <option value="oldest">Oldest</option>
            <option value="total-desc">Total: high to low</option>
            <option value="total-asc">Total: low to high</option>
            <option value="guest">Guest name</option>
          </select>
        </div>
      </div>
      <Card className="py-0 print:hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Placed</TableHead>
              <TableHead>Guest</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Room</TableHead>
              <TableHead>Table</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Total</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((o, idx) => {
              const t = service.orderTotals(o.id);
              const table = service.state.tables.find((x) => x.id === o.table_id);
              const billed = invoiceForOrder(service.state, o.id);
              return (
                <TableRow key={`${o.id}-${idx}`}>
                  <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                    {formatKolkata(o.created_at)}
                  </TableCell>
                  <TableCell>{o.guest_name || "Walk-in"}</TableCell>
                  <TableCell className="tabular-nums">{o.guest_phone || "—"}</TableCell>
                  <TableCell>{o.room_number || "—"}</TableCell>
                  <TableCell>{table?.name ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge value={o.status} />
                  </TableCell>
                  <TableCell>
                    <Money paise={t.total_paise} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => setView(o)}>
                        Bill
                      </Button>
                      {billed && (
                        <Button size="sm" variant="outline" onClick={() => router.push(`/invoices/${billed.id}`)}>
                          Invoice
                        </Button>
                      )}
                      {["OPEN", "IN_PROGRESS", "HELD", "COMPLETED"].includes(o.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (o.status === "HELD") {
                              service.resumeBill(o.id);
                              refresh();
                            }
                            router.push(`/pos?order=${o.id}`);
                          }}
                        >
                          {o.status === "HELD" ? "Resume" : "Edit"}
                        </Button>
                      )}
                      {o.status !== "PAID" && (
                        <Button size="sm" variant="destructive" onClick={() => setDeleteId(o.id)}>
                          Delete
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {orders.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">No orders match these filters.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Bill{bill ? ` · ${bill.docNo}` : ""}</DialogTitle>
          </DialogHeader>
          {bill && <BillActions bill={bill} />}
        </DialogContent>
      </Dialog>
      {view && bill && (
        <div className="bill-print-only hidden print:block" aria-hidden="true">
          <BillSheet bill={bill} />
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this order?</AlertDialogTitle>
            <AlertDialogDescription>
              Unbilled orders are cancelled and removed locally, then queued for sync. Billed orders must be voided from the invoice instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!deleteId) return;
                try {
                  service.deleteOrder(deleteId);
                  toast.success("Order deleted locally", { description: "Sync will remove it when online" });
                  refresh();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not delete");
                }
                setDeleteId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Screen>
  );
}
