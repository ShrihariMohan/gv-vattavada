"use client";

import { Screen } from "@/ui/Screen";
import { Money } from "@/ui/Shell";
import { useApp } from "@/ui/AppProvider";
import { StatusBadge } from "@/ui/status-badge";
import { formatINR, rupeesToPaise } from "@/domain/money";
import {
  KEYBOARD_SHORTCUTS,
  MAX_KEYBOARD_RESULTS,
  pickVisibleByDigit,
  type KeyboardDigit,
} from "@/domain/rules";
import { billFromInvoice } from "@/domain/bill";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PaymentMethod } from "@/domain/types";
import { BillActions } from "@/ui/bill-actions";
import { BillSheet } from "@/ui/bill-sheet";
import { printBill } from "@/ui/share-bill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Minus, Plus, Receipt, Search } from "lucide-react";
import { productMatchesQuery, productMatchesSelectedTag } from "@/marketing/menu";
import { isListedOrder } from "@/domain/bill";
import { can, isCatalogProduct } from "@/domain/rules";
import { TagFilter } from "@/ui/tag-filter";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const PRIMARY_SHORTCUTS = ["Ctrl+K", "1-9", "Enter", "Ctrl+Enter", "Ctrl+N", "Ctrl+Shift+H", "Ctrl+P", "Escape", "Ctrl+/"] as const;
const KEY_REPEAT_MS = 200;
const DIGIT_HINT_MS = 30_000;

export default function PosPage() {
  return (
    <Suspense fallback={<Screen title="Restaurant POS"><p className="text-muted-foreground">Loading POS…</p></Screen>}>
      <PosInner />
    </Suspense>
  );
}

function PosInner() {
  const { service, refresh, user } = useApp();
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
  const [invoiceId, setInvoiceId] = useState<string | null>(params.get("invoice"));
  const [helpOpen, setHelpOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const canSaveProduct = user ? can(user.role, "products.edit") : false;
  const [lastAddedProductId, setLastAddedProductId] = useState<string | null>(null);
  const [lastDigitUseAt, setLastDigitUseAt] = useState(0);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const tapLock = useRef(false);

  const order = service.state.orders.find((o) => o.id === orderId && !o.deleted_at);
  const items = service.state.orderItems.filter((i) => i.order_id === orderId && !i.deleted_at);
  const qtyByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of items) map.set(i.product_id, (map.get(i.product_id) ?? 0) + i.qty);
    return map;
  }, [items]);
  const products = service.state.products.filter(
    (p) => p.business_id === restaurant.id && p.active && isCatalogProduct(p),
  );
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
  const showIndexBadges =
    q.length > 0 || tag !== null || (lastDigitUseAt > 0 && Date.now() - lastDigitUseAt < DIGIT_HINT_MS);
  const blockingModal = payOpen || newOpen || editOpen || helpOpen || !!invoiceId || billOpen || customOpen;
  const invoiceBill = useMemo(() => {
    if (!invoiceId) return null;
    try {
      return billFromInvoice(service.state, invoiceId);
    } catch {
      return null;
    }
  }, [invoiceId, service.state]);

  const closeInvoice = useCallback(() => {
    setInvoiceId(null);
    router.replace("/pos", { scroll: false });
  }, [router]);

  const holdTicket = useCallback(() => {
    if (!orderId || !canEdit) return;
    service.holdBill(orderId);
    refresh();
    toast.message("Held locally");
  }, [orderId, canEdit, refresh, service]);

  useEffect(() => {
    const id = params.get("invoice");
    setInvoiceId(id);
  }, [params]);

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

  const flashHighlight = useCallback((productId: string) => {
    setHighlightId(productId);
    window.setTimeout(() => {
      setHighlightId((current) => (current === productId ? null : current));
    }, 1500);
  }, []);

  const keyboardAddOrIncrement = useCallback(
    (product: { id: string; name: string }) => {
      if (tapLock.current) return;
      tapLock.current = true;
      window.setTimeout(() => {
        tapLock.current = false;
      }, KEY_REPEAT_MS);
      try {
        if (order?.status === "PAID" || order?.status === "CANCELLED") {
          toast.error("This ticket is closed. Open a new bill.");
          return;
        }
        const currentQty = qtyByProduct.get(product.id) ?? 0;
        if (currentQty > 0) {
          const line = items.find((i) => i.product_id === product.id);
          if (!line) return;
          service.setItemQty(line.id, currentQty + 1);
        } else {
          let id = orderId;
          if (!id) {
            const o = service.startOrder({
              business_id: restaurant.id,
              table_id: tableId || null,
              guest_name: guestName,
              guest_phone: guestPhone,
              room_number: roomNumber,
            });
            id = o.id;
            setOrderId(o.id);
            setDiscount(0);
            setNewOpen(false);
          }
          service.addOrderItem(id, product.id, 1);
        }
        refresh();
        setLastAddedProductId(product.id);
        setLastDigitUseAt(Date.now());
        flashHighlight(product.id);
        toast.success(`${product.name} ×${currentQty + 1}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not add item");
      }
    },
    [
      flashHighlight,
      guestName,
      guestPhone,
      items,
      order?.status,
      orderId,
      qtyByProduct,
      refresh,
      restaurant.id,
      roomNumber,
      service,
      tableId,
    ],
  );

  const addProduct = (productId: string) => {
    if (tapLock.current) return;
    tapLock.current = true;
    window.setTimeout(() => {
      tapLock.current = false;
    }, KEY_REPEAT_MS);
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
    if (!lastDigitUseAt) return;
    const remaining = DIGIT_HINT_MS - (Date.now() - lastDigitUseAt);
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setLastDigitUseAt(0), remaining);
    return () => window.clearTimeout(timer);
  }, [lastDigitUseAt]);

  useEffect(() => {
    const mod = (e: KeyboardEvent) => e.metaKey || e.ctrlKey;
    const searchFocused = document.activeElement?.id === "pos-search";

    const pickByDigit = (digit: KeyboardDigit) => {
      const product = pickVisibleByDigit(visible, digit);
      if (!product) {
        toast.message(`No item ${digit}`);
        return;
      }
      keyboardAddOrIncrement(product);
    };

    const addFirstVisible = () => {
      if (!visible.length) {
        toast.message("No matching items");
        return;
      }
      keyboardAddOrIncrement(visible[0]!);
    };

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (e.key === "Escape") {
        e.preventDefault();
        if (query.trim()) {
          setQuery("");
          return;
        }
        if (helpOpen) {
          setHelpOpen(false);
          return;
        }
        if (invoiceId) {
          closeInvoice();
          return;
        }
        if (payOpen) {
          setPayOpen(false);
          return;
        }
        if (editOpen) {
          setEditOpen(false);
          return;
        }
        if (newOpen) {
          setNewOpen(false);
          return;
        }
        if (billOpen) {
          setBillOpen(false);
          return;
        }
        return;
      }

      if (searchFocused && !blockingModal && !mod(e)) {
        const digit = Number(e.key);
        if (digit >= 1 && digit <= 9) {
          e.preventDefault();
          if (!visible.length) {
            toast.message("No matching items");
            return;
          }
          pickByDigit(digit as KeyboardDigit);
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          addFirstVisible();
          return;
        }
        if ((e.key === "+" || e.key === "=") && lastAddedProductId) {
          e.preventDefault();
          const product = visible.find((p) => p.id === lastAddedProductId) ?? products.find((p) => p.id === lastAddedProductId);
          if (product) keyboardAddOrIncrement(product);
          return;
        }
        if ((e.key === "-" || e.key === "_") && lastAddedProductId && canEdit) {
          e.preventDefault();
          const qty = qtyByProduct.get(lastAddedProductId) ?? 0;
          if (qty > 0) bumpQty(lastAddedProductId, qty - 1);
          return;
        }
      }

      if (inField && !(mod(e) && e.key === "Enter")) return;

      if (e.key === "F1") {
        e.preventDefault();
        setNewOpen(true);
        return;
      }
      if (e.key === "F2") {
        e.preventDefault();
        document.getElementById("pos-search")?.focus();
        return;
      }
      if (e.key === "F3") {
        e.preventDefault();
        holdTicket();
        return;
      }
      if (e.key === "F4") {
        e.preventDefault();
        if (orderId && canEdit && items.length) setPayOpen(true);
        return;
      }

      if (!mod(e)) return;

      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        document.getElementById("pos-search")?.focus();
        return;
      }
      if (e.key === "Enter" && !payOpen) {
        e.preventDefault();
        if (orderId && canEdit && items.length) setPayOpen(true);
        return;
      }
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setNewOpen(true);
        return;
      }
      if ((e.key === "h" || e.key === "H") && e.shiftKey) {
        e.preventDefault();
        holdTicket();
        return;
      }
      if ((e.key === "p" || e.key === "P") && invoiceId) {
        e.preventDefault();
        printBill();
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        setHelpOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    orderId,
    canEdit,
    items.length,
    payOpen,
    invoiceId,
    helpOpen,
    editOpen,
    newOpen,
    billOpen,
    holdTicket,
    closeInvoice,
    query,
    visible,
    products,
    keyboardAddOrIncrement,
    lastAddedProductId,
    qtyByProduct,
    blockingModal,
  ]);

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
        {PRIMARY_SHORTCUTS.map((k) => `${k} ${KEYBOARD_SHORTCUTS[k]}`).join(" · ")}
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
      <p className="no-print mb-2 hidden text-xs text-muted-foreground sm:block">
        1–9 add · Enter first · +/− last item
      </p>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <TagFilter selected={tag} onChange={setTag} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={order?.status === "PAID" || order?.status === "CANCELLED"}
          onClick={() => {
            if (!orderId) start();
            setCustomOpen(true);
          }}
        >
          Custom item
        </Button>
      </div>

      {visible.length > MAX_KEYBOARD_RESULTS && (
        <p className="mb-2 text-xs text-muted-foreground">
          Showing {MAX_KEYBOARD_RESULTS} of {visible.length} — refine search
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
        {visible.map((p, index) => {
          const qty = qtyByProduct.get(p.id) ?? 0;
          const showIndex = showIndexBadges && index < MAX_KEYBOARD_RESULTS;
          return (
            <div
              key={p.id}
              className={cn(
                "relative flex min-h-28 flex-col overflow-hidden rounded-xl border bg-card p-3 text-left shadow-sm",
                highlightId === p.id ? "border-2 border-primary" : "border-border",
              )}
            >
              {showIndex && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-1.5 top-1.5 z-10 flex size-5 items-center justify-center rounded-sm bg-background text-[10px] font-semibold tabular-nums leading-none text-muted-foreground ring-1 ring-border"
                >
                  {index + 1}
                </span>
              )}
              {qty > 0 && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-1.5 top-1.5 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold tabular-nums leading-none text-primary-foreground"
                >
                  {qty}
                </span>
              )}
              <button
                type="button"
                className="flex flex-1 flex-col text-left"
                onClick={(e) => {
                  e.stopPropagation();
                  addProduct(p.id);
                }}
              >
                <div
                  className={cn(
                    "font-medium leading-tight",
                    (showIndex || qty > 0) && "pt-5",
                    qty > 0 && "pr-6",
                  )}
                >
                  {p.name}
                </div>
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
              <Button variant="outline" disabled={!canEdit} onClick={holdTicket}>
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
              <Button variant="outline" disabled={!canEdit} onClick={holdTicket}>
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

      <CustomItemDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        canSaveProduct={canSaveProduct}
        onAdd={({ name, priceRupees, qty, saveToCatalog }) => {
          try {
            let id = orderId;
            if (!id) id = start();
            service.addCustomOrderItem(id, {
              name,
              unit_price_paise: rupeesToPaise(priceRupees),
              qty,
              save_to_catalog: saveToCatalog,
              business_id: restaurant.id,
            });
            refresh();
            setCustomOpen(false);
            toast.success(saveToCatalog ? "Custom item added and saved to menu" : "Custom item added");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not add item");
          }
        }}
      />

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
              setInvoiceId(bill.id);
              router.replace(`/pos?invoice=${bill.id}`, { scroll: false });
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed");
            }
          }}
        />
      )}

      <Dialog open={!!invoiceId} onOpenChange={(o) => !o && closeInvoice()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invoice{invoiceBill ? ` · ${invoiceBill.docNo}` : ""}</DialogTitle>
          </DialogHeader>
          {invoiceBill ? (
            <BillActions
              bill={invoiceBill}
              variant="thermal"
              extra={
                <Button variant="outline" onClick={() => router.push(`/invoices/${invoiceId}`)}>
                  View in list
                </Button>
              }
            />
          ) : (
            <p className="text-sm text-muted-foreground">Invoice not found on this device.</p>
          )}
        </DialogContent>
      </Dialog>
      {invoiceBill && (
        <div className="bill-print-only hidden print:block" aria-hidden="true">
          <BillSheet bill={invoiceBill} variant="thermal" />
        </div>
      )}

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
          </DialogHeader>
          <ul className="space-y-1 text-sm">
            {Object.entries(KEYBOARD_SHORTCUTS).map(([k, v]) => (
              <li key={k} className="flex justify-between gap-4">
                <span className="font-mono text-muted-foreground">{k}</span>
                <span>{v}</span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
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

function CustomItemDialog({
  open,
  onOpenChange,
  canSaveProduct,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  canSaveProduct: boolean;
  onAdd: (data: { name: string; priceRupees: number; qty: number; saveToCatalog: boolean }) => void;
}) {
  const [name, setName] = useState("");
  const [priceRupees, setPriceRupees] = useState("");
  const [qty, setQty] = useState(1);
  const [saveToCatalog, setSaveToCatalog] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setName("");
          setPriceRupees("");
          setQty(1);
          setSaveToCatalog(false);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Custom line item</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Add a one-off combo or special price. Optionally save it to the menu for next time.
        </p>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="custom-name">Name</Label>
            <Input
              id="custom-name"
              placeholder="Weekend combo"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="custom-price">Price (₹)</Label>
              <Input
                id="custom-price"
                type="number"
                min={0}
                step="0.01"
                placeholder="299"
                value={priceRupees}
                onChange={(e) => setPriceRupees(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="custom-qty">Qty</Label>
              <Input
                id="custom-qty"
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </div>
          {canSaveProduct && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={saveToCatalog} onCheckedChange={(v) => setSaveToCatalog(v === true)} />
              Save to products menu
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const price = Number(priceRupees);
              if (!name.trim() || !Number.isFinite(price) || price < 0) {
                toast.error("Enter a name and valid price");
                return;
              }
              onAdd({ name: name.trim(), priceRupees: price, qty, saveToCatalog: canSaveProduct && saveToCatalog });
            }}
          >
            Add to bill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const [method, setMethod] = useState<"CASH" | "UPI">("CASH");

  const submit = () => {
    onPay([{ method, amount_paise: total }]);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== "Enter") return;
      e.preventDefault();
      submit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Take payment</DialogTitle>
        </DialogHeader>
        <div className="rounded-xl border bg-muted/40 px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">Amount due</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{formatINR(total)}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={method === "CASH" ? "default" : "outline"}
            className="h-12"
            onClick={() => setMethod("CASH")}
          >
            Cash
          </Button>
          <Button
            type="button"
            variant={method === "UPI" ? "default" : "outline"}
            className="h-12"
            onClick={() => setMethod("UPI")}
          >
            UPI
          </Button>
        </div>
        <p className="text-center text-xs text-muted-foreground">Card payments are not supported.</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Back
          </Button>
          <Button onClick={submit}>Generate bill · {method === "CASH" ? "Cash" : "UPI"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
