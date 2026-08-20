"use client";

import { Screen } from "@/ui/Screen";
import { Money } from "@/ui/Shell";
import { useApp } from "@/ui/AppProvider";
import { StatusBadge } from "@/ui/status-badge";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function TablesPage() {
  const { service, refresh } = useApp();
  const router = useRouter();
  const restaurant = service.state.businesses.find((b) => b.type === "RESTAURANT")!;
  return (
    <Screen title="Tables" description="Occupied tables keep the live ticket. Tap an empty table to start a bill.">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {service.state.tables.filter((t) => t.business_id === restaurant.id).map((t) => {
          const order = t.current_order_id ? service.state.orders.find((o) => o.id === t.current_order_id && !o.deleted_at) : null;
          const items = order ? service.state.orderItems.filter((i) => i.order_id === order.id && !i.deleted_at) : [];
          const total = order ? service.orderTotals(order.id).total_paise : 0;
          return (
            <Card key={t.id}>
              <CardHeader className="flex-row items-start justify-between">
                <div>
                  <CardTitle>{t.name}</CardTitle>
                  <StatusBadge value={t.status} />
                </div>
              </CardHeader>
              <CardContent>
                {order ? (
                  <>
                    <p className="mb-2 text-xs text-muted-foreground">
                      {order.guest_name || "Walk-in"} {order.guest_phone} {order.room_number && `· Rm ${order.room_number}`}
                    </p>
                    <ul className="text-sm">
                      {items.map((i) => (
                        <li key={i.id}>{i.qty} × {i.name}</li>
                      ))}
                      <li className="mt-2 font-medium">Total <Money paise={total} /></li>
                    </ul>
                    <Button className="mt-3 w-full" variant="outline" onClick={() => router.push(`/pos?order=${order.id}`)}>
                      Continue bill
                    </Button>
                  </>
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => {
                      try {
                        const o = service.startOrder({ business_id: restaurant.id, table_id: t.id });
                        refresh();
                        router.push(`/pos?order=${o.id}`);
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Could not open table");
                      }
                    }}
                  >
                    New order
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </Screen>
  );
}
