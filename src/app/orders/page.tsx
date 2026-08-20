"use client";

import { Screen } from "@/ui/Screen";
import { Money } from "@/ui/Shell";
import { useApp } from "@/ui/AppProvider";
import { StatusBadge } from "@/ui/status-badge";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
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
import { useState } from "react";

export default function OrdersPage() {
  const { service, refresh } = useApp();
  const router = useRouter();
  const restaurant = service.state.businesses.find((b) => b.type === "RESTAURANT")!;
  const orders = service.state.orders.filter((o) => o.business_id === restaurant.id && !o.deleted_at).slice().reverse();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  return (
    <Screen
      title="Orders"
      description="Held, open, and billed tickets. Deleting an unbilled order cancels it and queues a sync delete."
      actions={<Button onClick={() => router.push("/pos")}>Open POS</Button>}
    >
      <Card className="py-0">
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
            {orders.map((o) => {
              const t = service.orderTotals(o.id);
              const table = service.state.tables.find((x) => x.id === o.table_id);
              return (
                <TableRow key={o.id}>
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
                    {o.status === "HELD" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mr-1"
                        onClick={() => {
                          service.resumeBill(o.id);
                          refresh();
                        router.push(`/pos?order=${o.id}`);
                        }}
                      >
                        Resume
                      </Button>
                    )}
                    {o.status !== "PAID" && (
                      <Button size="sm" variant="destructive" onClick={() => setDeleteId(o.id)}>
                        Delete
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
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
