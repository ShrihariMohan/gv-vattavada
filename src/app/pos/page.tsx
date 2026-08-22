"use client";

import { Screen } from "@/ui/Screen";
import { Money } from "@/ui/Shell";
import { useApp } from "@/ui/AppProvider";
import { StatusBadge } from "@/ui/status-badge";
import { formatINR } from "@/domain/money";
import { KEYBOARD_SHORTCUTS } from "@/domain/rules";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { PaymentMethod } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Minus, Plus, Receipt, Search } from "lucide-react";
import { productMatchesQuery, productMatchesSelectedTag } from "@/marketing/menu";
import { isListedOrder } from "@/domain/bill";
import { TagFilter } from "@/ui/tag-filter";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

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
  const [tag, setTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [orderId, setOrderId] = useState<string | null>(params.get("order"));
  const [discount, setDiscount] = useState(0);
  const [payOpen, setPayOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [tableId, setTableId] = useState("");
  const [billOpen, setBillOpen] = useState(false);
  const tapLock = useRef(false);

  const order = service.state.orders.find((o) => o.id === orderId && !o.deleted_at);
  const items = service.state.orderItems.filter((i) => i.order_id === orderId && !i.deleted_at);
  const qtyByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of items) map.set(i.product_id, (map.get(i.product_id) ?? 0) + i.qty);
    return map;
  }, [items]);
  const products = service.state.products.filter((p) => p.business_id === restaurant.id && p.active && !p.deleted_at);
  const q = query.trim().toLowerCase();
  const visible = products.filter((p) => productMatchesSelectedTag(p, tag) && productMatchesQuery(p, q));
  const tables = service.state.tables.filter((t) => t.business_id === restaurant.id && !t.deleted_at);
  const tickets = service.state.orders.filter(
    (o) =>
      o.business_id === restaurant.id &&
      o.status !== "PAID" &&
      o.status !== "CANCELLED" &&
      (o.id === orderId || isListedOrder(service.state, o)),
  );
  const totals = orderId ? service.orderTotals(orderId, discount) : null;
  const canEdit = order && order.status !== "PAID" && order.status !== "CANCELLED";

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
    toast.success("Ticket opened", { description: "Tap items to add. Count shows on each tile." });
    refresh();
    return o.id;
  };

  const addProduct = (productId: string) => {
    if (tapLock.current) return;
    tapLock.current = true;
    window.setTimeout(() => {
      tapLock.current = false;
    }, 280);
    try {
      let id = orderId;
      if (order?.status === "PAID" || order?.status === "CANCELLED") {
        toast.error("This ticket is closed. Open a new bill.");
        return;
      }
      if (!id) id = start();
      service.addOrderItem(id, productId, 1);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add item");
    }
  };

  const bumpQty = (productId: string, nextQty: number) => {
    const line = items.find((i) => i.product_id === productId);
    if (!line) {
      if (nextQty > 0) addProduct(productId);
      return;
    }
    try {
      service.setItemQty(line.id, nextQty);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update qty");
    }
  };

  const cancelTicket = () => {
    if (!orderId || !order) return;
    try {
      if (order.status === "PAID") throw new Error("Cannot cancel a paid order. Void the invoice.");
      service.deleteOrder(orderId);
      setOrderId(null);
      setDiscount(0);
      toast.success("Order cancelled");
      refresh();
    } catch (e) {
      try {
        service.cancelBill(orderId);
        setOrderId(null);
        setDiscount(0);
        toast.success("Order cancelled");
        refresh();
      } catch (inner) {
        toast.error(inner instanceof Error ? inner.message : e instanceof Error ? e.message : "Cancel failed");
      }
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "F1") {
        e.preventDefault();
        setNewOpen(true);
      }
      if (e.key === "F2") {
        e.preventDefault();
        document.getElementById("pos-search")?.focus();
      }
      if (e.key === "F3" && orderId && canEdit) {
        e.preventDefault();
        service.holdBill(orderId);
        refresh();
        toast.message("Held locally");
      }
      if (e.key === "F4") {
        e.preventDefault();
        if (orderId && canEdit) setPayOpen(true);
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setPayOpen(false);
        setNewOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [orderId, canEdit, refresh, service]);

  return (
    <Screen
      title="Restaurant POS"
      description="Tap a dish to add it. The number on the tile is the quantity on this ticket."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {tickets.length > 0 && (
            <select
              className="h-8 max-w-48 rounded-lg border border-input bg-background px-2 text-sm"
              value={orderId ?? ""}
              onChange={(e) => {
                setOrderId(e.target.value || null);
                setDiscount(0);
              }}
            >
              <option value="">Open tickets</option>
              {tickets.map((t) => (
                <option key={t.id} value={t.id}>
                  {(t.guest_name || "Walk-in") + (t.room_number ? ` · Rm ${t.room_number}` : "")} · {t.status}
                </option>
              ))}
            </select>
          )}
          <Button onClick={() => setNewOpen(true)}>New bill</Button>
        </div>
      }
    >
      <p className="no-print mb-3 text-xs text-muted-foreground">
        {Object.entries(KEYBOARD_SHORTCUTS).map(([k, v]) => `${k} ${v}`).join(" · ")}
      </p>

      <div className="grid gap-4 pb-24 lg:grid-cols-[minmax(0,1fr)_360px] lg:pb-0">
        <div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="pos-search"
          className="pl-8"
          placeholder="Search name or tag"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="mb-3">
        <TagFilter selected={tag} onChange={setTag} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
        {visible.map((p) => {
          const qty = qtyByProduct.get(p.id) ?? 0;
          return (
            <div
              key={p.id}
              className="relative isolate z-0 flex min-h-28 flex-col overflow-hidden rounded-xl border bg-card p-3 text-left shadow-sm ring-1 ring-foreground/5"
            >
              {qty > 0 && (
                <Badge className="pointer-events-none absolute right-2 top-2 z-10 tabular-nums" variant="default">
                  {qty}
                </Badge>
              )}
              <button
                type="button"
                className="flex flex-1 flex-col text-left"
                onClick={(e) => {
                  e.stopPropagation();
                  addProduct(p.id);
                }}
              >
                <div className="pr-8 font-medium leading-tight">{p.name}</div>
                {p.description ? <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.description}</div> : null}
                <div className="mt-auto pt-2 text-sm font-medium tabular-nums">{formatINR(p.price_paise)}</div>
              </button>
              {qty > 0 && canEdit && (
                <div className="mt-2 flex items-center gap-1">
                  <Button
                    size="icon-sm"
                    variant="outline"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      bumpQty(p.id, qty - 1);
                    }}
                  >
                    <Minus />
                  </Button>
                  <span className="w-6 text-center text-sm tabular-nums">{qty}</span>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      bumpQty(p.id, qty + 1);
                    }}
                  >
                    <Plus />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && <p className="col-span-full text-sm text-muted-foreground">No items match that search.</p>}
      </div>
        </div>

        <Card className="hidden h-fit lg:sticky lg:top-20 lg:block">
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
            <ul className="max-h-[40vh] space-y-2 overflow-auto">
              {items.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left font-medium hover:text-primary"
                    disabled={!canEdit}
                    onClick={() => bumpQty(i.product_id, i.qty + 1)}
                    title="Tap to add one more"
                  >
                    {i.name}
                  </button>
                  <span className="flex items-center gap-1">
                    <Button size="icon-sm" variant="outline" disabled={!canEdit} onClick={() => bumpQty(i.product_id, i.qty - 1)}>
                      <Minus />
                    </Button>
                    <span className="w-5 text-center tabular-nums">{i.qty}</span>
                    <Button size="icon-sm" variant="outline" disabled={!canEdit} onClick={() => bumpQty(i.product_id, i.qty + 1)}>
                      <Plus />
                    </Button>
                    <Money paise={i.unit_price_paise * i.qty} />
                  </span>
                </li>
              ))}
              {!items.length && <p className="text-sm text-muted-foreground">Tap products to add. Tap a line here to repeat it.</p>}
            </ul>
            {orderId && totals && (
              <div className="mt-4 space-y-2 border-t pt-3 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <Money paise={totals.subtotal_paise} />
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
                {service.state.tax_enabled !== false && (
                <div className="flex justify-between">
                  <span>Tax</span>
                  <Money paise={totals.tax_paise} />
                </div>
                )}
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <Money paise={totals.total_paise} />
                </div>
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                disabled={!canEdit}
                onClick={() => {
                  if (!order) return;
                  setGuestName(order.guest_name);
                  setGuestPhone(order.guest_phone);
                  setRoomNumber(order.room_number);
                  setTableId(order.table_id ?? "");
                  setEditOpen(true);
                }}
              >
                Edit
              </Button>
              <Button
                variant="outline"
                disabled={!canEdit}
                onClick={() => {
                  if (!orderId) return;
                  service.holdBill(orderId);
                  refresh();
                  toast.message("Held locally");
                }}
              >
                Hold
              </Button>
              <Button disabled={!canEdit || !items.length} onClick={() => setPayOpen(true)}>
                Pay
              </Button>
              <Button variant="destructive" disabled={!canEdit} type="button" onClick={cancelTicket}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <button
        type="button"
        className="no-print fixed bottom-20 right-4 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg lg:hidden"
        onClick={() => setBillOpen(true)}
        aria-label="Open bill"
      >
        <Receipt className="size-6" />
        {items.length > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-destructive px-1 text-center text-[11px] font-semibold leading-5 text-destructive-foreground">
            {items.reduce((a, i) => a + i.qty, 0)}
          </span>
        )}
      </button>
      <Sheet open={billOpen} onOpenChange={setBillOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto lg:hidden">
          <SheetHeader>
            <SheetTitle>Current bill</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-8">
            {order && <StatusBadge value={order.status} />}
            {order && (
              <p className="mt-2 text-xs text-muted-foreground">
                {[order.guest_name, order.guest_phone, order.room_number && `Rm ${order.room_number}`, tables.find((t) => t.id === order.table_id)?.name]
                  .filter(Boolean)
                  .join(" · ") || "Walk-in"}
              </p>
            )}
            <ul className="mt-4 max-h-[40vh] space-y-2 overflow-auto">
              {items.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">{i.name}</span>
                  <span className="flex items-center gap-1">
                    <Button size="icon-sm" variant="outline" disabled={!canEdit} onClick={() => bumpQty(i.product_id, i.qty - 1)}>
                      <Minus />
                    </Button>
                    <span className="w-5 text-center tabular-nums">{i.qty}</span>
                    <Button size="icon-sm" variant="outline" disabled={!canEdit} onClick={() => bumpQty(i.product_id, i.qty + 1)}>
                      <Plus />
                    </Button>
                    <Money paise={i.unit_price_paise * i.qty} />
                  </span>
                </li>
              ))}
              {!items.length && <p className="text-sm text-muted-foreground">Tap products to add.</p>}
            </ul>
            {orderId && totals && (
              <div className="mt-4 space-y-2 border-t pt-3 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <Money paise={totals.subtotal_paise} />
                </div>
                {service.state.tax_enabled !== false && (
                <div className="flex justify-between">
                  <span>Tax</span>
                  <Money paise={totals.tax_paise} />
                </div>
                )}
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <Money paise={totals.total_paise} />
                </div>
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                disabled={!canEdit}
                onClick={() => {
                  if (!order) return;
                  setGuestName(order.guest_name);
                  setGuestPhone(order.guest_phone);
                  setRoomNumber(order.room_number);
                  setTableId(order.table_id ?? "");
                  setBillOpen(false);
                  setEditOpen(true);
                }}
              >
                Edit
              </Button>
              <Button
                variant="outline"
                disabled={!canEdit}
                onClick={() => {
                  if (!orderId) return;
                  service.holdBill(orderId);
                  refresh();
                  toast.message("Held locally");
                }}
              >
                Hold
              </Button>
              <Button
                disabled={!canEdit || !items.length}
                onClick={() => {
                  setBillOpen(false);
                  setPayOpen(true);
                }}
              >
                Pay
              </Button>
              <Button variant="destructive" disabled={!canEdit} type="button" onClick={cancelTicket}>
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New order</DialogTitle>
          </DialogHeader>
          <GuestFields
            guestName={guestName}
            guestPhone={guestPhone}
            roomNumber={roomNumber}
            tableId={tableId}
            tables={tables}
            onName={setGuestName}
            onPhone={setGuestPhone}
            onRoom={setRoomNumber}
            onTable={setTableId}
          />
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit ticket</DialogTitle>
          </DialogHeader>
          {order && (
            <GuestFields
              guestName={guestName || order.guest_name}
              guestPhone={guestPhone || order.guest_phone}
              roomNumber={roomNumber || order.room_number}
              tableId={tableId || order.table_id || ""}
              tables={tables}
              onName={setGuestName}
              onPhone={setGuestPhone}
              onRoom={setRoomNumber}
              onTable={setTableId}
            />
          )}
          {orderId && totals && (
            <div className="grid gap-1.5">
              <Label htmlFor="discount">Discount (₹)</Label>
              <Input
                id="discount"
                type="number"
                min={0}
                step="0.01"
                value={discount / 100}
                onChange={(e) => setDiscount(Math.round(Number(e.target.value) * 100))}
              />
              <p className="text-xs text-muted-foreground">
                {service.state.tax_enabled !== false ? (
                  <>
                    Tax <Money paise={totals.tax_paise} /> · Total <Money paise={totals.total_paise} />
                  </>
                ) : (
                  <>
                    Total <Money paise={totals.total_paise} />
                  </>
                )}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                if (!orderId) return;
                try {
                  service.updateOrderGuest(orderId, {
                    guest_name: guestName || order?.guest_name,
                    guest_phone: guestPhone || order?.guest_phone,
                    room_number: roomNumber || order?.room_number,
                    table_id: tableId || null,
                  });
                  toast.success("Ticket updated");
                  setEditOpen(false);
                  refresh();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not update");
                }
              }}
            >
              Save
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
              setOrderId(null);
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

function GuestFields({
  guestName,
  guestPhone,
  roomNumber,
  tableId,
  tables,
  onName,
  onPhone,
  onRoom,
  onTable,
}: {
  guestName: string;
  guestPhone: string;
  roomNumber: string;
  tableId: string;
  tables: { id: string; name: string; status: string; current_order_id: string | null }[];
  onName: (v: string) => void;
  onPhone: (v: string) => void;
  onRoom: (v: string) => void;
  onTable: (v: string) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label>Customer name</Label>
        <Input value={guestName} onChange={(e) => onName(e.target.value)} placeholder="Walk-in or guest" />
      </div>
      <div className="grid gap-1.5">
        <Label>Phone</Label>
        <Input value={guestPhone} onChange={(e) => onPhone(e.target.value)} placeholder="9876543210" />
      </div>
      <div className="grid gap-1.5">
        <Label>Stay room number</Label>
        <Input value={roomNumber} onChange={(e) => onRoom(e.target.value)} placeholder="101" />
      </div>
      <div className="grid gap-1.5">
        <Label>Table</Label>
        <select className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm" value={tableId} onChange={(e) => onTable(e.target.value)}>
          <option value="">None / takeaway</option>
          {tables.map((t) => (
            <option key={t.id} value={t.id} disabled={t.status === "OCCUPIED" && !!t.current_order_id}>
              {t.name} · {t.status}
            </option>
          ))}
        </select>
      </div>
    </div>
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
