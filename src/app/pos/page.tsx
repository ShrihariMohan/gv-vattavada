"use client";

import { Screen } from "@/ui/Screen";
import { Money } from "@/ui/Shell";
import { useApp } from "@/ui/AppProvider";
import { StatusBadge } from "@/ui/status-badge";
import { formatINR } from "@/domain/money";
import { KEYBOARD_SHORTCUTS } from "@/domain/rules";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { PaymentMethod } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";

export default function PosPage() {
  return (
    <Suspense fallback={<Screen title="Restaurant POS"><p className="text-muted-foreground">Loading POS…</p></Screen>}>
      <PosInner />
    </Suspense>
  );
}

function PosInner() {
  const { service, refresh } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const restaurant = service.state.businesses.find((b) => b.type === "RESTAURANT")!;
  const [category, setCategory] = useState<string>("all");
  const [orderId, setOrderId] = useState<string | null>(params.get("order"));
  const [discount, setDiscount] = useState(0);
  const [payOpen, setPayOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [tableId, setTableId] = useState("");

  const order = service.state.orders.find((o) => o.id === orderId && !o.deleted_at);
  const items = service.state.orderItems.filter((i) => i.order_id === orderId && !i.deleted_at);
  const products = service.state.products.filter((p) => p.business_id === restaurant.id && p.active);
  const cats = service.state.productCategories.filter((c) => c.business_id === restaurant.id);
  const visible = products.filter((p) => category === "all" || p.category_id === category);
  const tables = service.state.tables.filter((t) => t.business_id === restaurant.id);

  const start = (opts?: { table_id?: string | null }) => {
    const o = service.startOrder({
      business_id: restaurant.id,
      table_id: opts?.table_id ?? (tableId || null),
      guest_name: guestName,
      guest_phone: guestPhone,
      room_number: roomNumber,
    });
    setOrderId(o.id);
    setDiscount(0);
    setNewOpen(false);
    toast.success("Saved locally", { description: service.pendingCount() ? "Sync pending" : "Ready" });
    refresh();
    return o.id;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F1") {
        e.preventDefault();
        setNewOpen(true);
      }
      if (e.key === "F2") {
        e.preventDefault();
        router.push("/search");
      }
      if (e.key === "F3" && orderId) {
        e.preventDefault();
        service.holdBill(orderId);
        refresh();
      }
      if (e.key === "F4") {
        e.preventDefault();
        setPayOpen(true);
      }
      if (e.key === "F5" && order?.status === "PAID") {
        e.preventDefault();
        window.print();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (orderId && order && order.status !== "PAID") service.cancelBill(orderId);
        setPayOpen(false);
        refresh();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [orderId, order?.status, refresh, router, service]);

  return (
    <Screen
      title="Restaurant POS"
      description="Tablet-first billing. Guest, phone, and room are saved with the order."
      actions={<Button onClick={() => setNewOpen(true)}>New bill</Button>}
    >
      <p className="mb-4 text-xs text-muted-foreground">
        {Object.entries(KEYBOARD_SHORTCUTS).map(([k, v]) => `${k} ${v}`).join(" · ")}
      </p>
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            <Button size="sm" variant={category === "all" ? "default" : "outline"} onClick={() => setCategory("all")}>
              All
            </Button>
            {cats.map((c) => (
              <Button key={c.id} size="sm" variant={category === c.id ? "default" : "outline"} onClick={() => setCategory(c.id)}>
                {c.name}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {visible.map((p) => (
              <button
                key={p.id}
                type="button"
                className="min-h-24 rounded-xl border bg-card p-3 text-left shadow-sm ring-1 ring-foreground/5 transition hover:ring-primary/30 active:scale-[0.99]"
                onClick={() => {
                  try {
                    let id = orderId;
                    if (!id) id = start();
                    service.addOrderItem(id, p.id, 1);
                    refresh();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Could not add item");
                  }
                }}
              >
                <div className="font-medium">{p.name}</div>
                <div className="text-sm text-muted-foreground">{formatINR(p.price_paise)}</div>
              </button>
            ))}
          </div>
        </div>
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Current bill</CardTitle>
              {order && <StatusBadge value={order.status} />}
            </div>
            {order && (
              <p className="text-xs text-muted-foreground">
                {[order.guest_name, order.guest_phone, order.room_number && `Rm ${order.room_number}`, tables.find((t) => t.id === order.table_id)?.name]
                  .filter(Boolean)
                  .join(" · ") || "Walk-in"}
              </p>
            )}
          </CardHeader>
          <CardContent className="pt-4">
            <ul className="space-y-2">
              {items.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{i.name}</span>
                  <span className="flex items-center gap-1">
                    <Button size="icon-sm" variant="outline" onClick={() => { service.setItemQty(i.id, i.qty - 1); refresh(); }}>
                      <Minus />
                    </Button>
                    <span className="w-5 text-center">{i.qty}</span>
                    <Button size="icon-sm" variant="outline" onClick={() => { service.setItemQty(i.id, i.qty + 1); refresh(); }}>
                      <Plus />
                    </Button>
                    <Money paise={i.unit_price_paise * i.qty} />
                  </span>
                </li>
              ))}
              {!items.length && <p className="text-sm text-muted-foreground">Tap products to add.</p>}
            </ul>
            {orderId && (
              <div className="mt-4 space-y-2 border-t pt-3 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <Money paise={service.orderTotals(orderId, discount).subtotal_paise} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="discount">Discount (₹)</Label>
                  <Input
                    id="discount"
                    className="w-24"
                    type="number"
                    min={0}
                    step="0.01"
                    value={discount / 100}
                    onChange={(e) => setDiscount(Math.round(Number(e.target.value) * 100))}
                  />
                </div>
                <div className="flex justify-between">
                  <span>Tax</span>
                  <Money paise={service.orderTotals(orderId, discount).tax_paise} />
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <Money paise={service.orderTotals(orderId, discount).total_paise} />
                </div>
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" disabled={!orderId} onClick={() => orderId && (service.holdBill(orderId), refresh(), toast.message("Held locally"))}>
                Hold
              </Button>
              <Button disabled={!orderId} onClick={() => setPayOpen(true)}>
                Pay
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                Print
              </Button>
              <Button variant="destructive" disabled={!orderId} onClick={() => orderId && (service.cancelBill(orderId), refresh())}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New order</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Customer name</Label>
              <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Walk-in or guest" />
            </div>
            <div className="grid gap-1.5">
              <Label>Phone</Label>
              <Input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="9876543210" />
            </div>
            <div className="grid gap-1.5">
              <Label>Stay room number</Label>
              <Input value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} placeholder="101" />
            </div>
            <div className="grid gap-1.5">
              <Label>Table</Label>
              <select className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm" value={tableId} onChange={(e) => setTableId(e.target.value)}>
                <option value="">None / takeaway</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id} disabled={t.status === "OCCUPIED" && !!t.current_order_id}>
                    {t.name} · {t.status}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              Back
            </Button>
            <Button
              onClick={() => {
                try {
                  start();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not start order");
                }
              }}
            >
              Start order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {payOpen && orderId && (
        <PayDialog
          total={service.orderTotals(orderId, discount).total_paise}
          onClose={() => setPayOpen(false)}
          onPay={(parts) => {
            try {
              const bill = service.generateBill({
                orderId,
                discount_paise: discount,
                payments: parts,
                customer_id: order?.customer_id,
              });
              toast.success(`Saved locally · ${bill.invoice_number}`, {
                description: service.state.online ? "Syncing…" : "Sync pending",
              });
              setPayOpen(false);
              refresh();
              router.push(`/invoices/${bill.id}`);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed");
            }
          }}
        />
      )}
    </Screen>
  );
}

function PayDialog({
  total,
  onClose,
  onPay,
}: {
  total: number;
  onClose: () => void;
  onPay: (parts: { method: PaymentMethod; amount_paise: number }[]) => void;
}) {
  const [cash, setCash] = useState(total);
  const [upi, setUpi] = useState(0);
  const [card, setCard] = useState(0);
  const parts = useMemo(() => {
    const p: { method: PaymentMethod; amount_paise: number }[] = [];
    if (cash) p.push({ method: "CASH", amount_paise: cash });
    if (upi) p.push({ method: "UPI", amount_paise: upi });
    if (card) p.push({ method: "CARD", amount_paise: card });
    return p;
  }, [cash, upi, card]);
  const sum = cash + upi + card;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Payment · {formatINR(total)}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Cash (paise)</Label>
            <Input type="number" value={cash} onChange={(e) => setCash(Number(e.target.value))} />
          </div>
          <div className="grid gap-1.5">
            <Label>UPI (paise)</Label>
            <Input type="number" value={upi} onChange={(e) => setUpi(Number(e.target.value))} />
          </div>
          <div className="grid gap-1.5">
            <Label>Card (paise)</Label>
            <Input type="number" value={card} onChange={(e) => setCard(Number(e.target.value))} />
          </div>
          <Badge variant={sum === total ? "secondary" : "destructive"}>{sum === total ? "Split matches total" : `Difference ${formatINR(sum - total)}`}</Badge>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Back
          </Button>
          <Button disabled={sum !== total || !parts.length} onClick={() => onPay(parts)}>
            Generate bill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
