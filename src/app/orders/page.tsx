"use client";

import { Screen } from "@/ui/Screen";
import { Money } from "@/ui/Shell";
import { useApp } from "@/ui/AppProvider";
import { StatusBadge } from "@/ui/status-badge";
import { billFromOrder, invoiceForOrder, isListedOrder } from "@/domain/bill";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { BillActions } from "@/ui/bill-actions";
import { BillSheet } from "@/ui/bill-sheet";
import type { Order } from "@/domain/types";

export default function OrdersPage() {
  const { service, refresh } = useApp();
  const router = useRouter();
  const restaurant = service.state.businesses.find((b) => b.type === "RESTAURANT")!;
  const orders = service.state.orders
    .filter((o) => o.business_id === restaurant.id && isListedOrder(service.state, o))
    .slice()
    .reverse();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [view, setView] = useState<Order | null>(null);
  const bill = useMemo(() => (view ? billFromOrder(service.state, view.id) : null), [view, service.state]);

  return (
    <Screen
      title="Orders"
      description="Held, open, and billed tickets. View, share, or print the bill. Deleting an unbilled order cancels it."
      actions={<Button onClick={() => router.push("/pos")}>Open POS</Button>}
    >
      <Card className="py-0 print:hidden">
        <Table>
          <TableHeader>
            <TableRow>
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
        <div className="hidden print:block">
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
