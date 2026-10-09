"use client";

import { Screen } from "@/ui/Screen";
import { Money } from "@/ui/Shell";
import { StatusBadge } from "@/ui/status-badge";
import { useApp } from "@/ui/AppProvider";
import { can } from "@/domain/rules";
import { daysBetween, formatKolkata } from "@/domain/dates";
import { paiseToRupees, rupeesToPaise } from "@/domain/money";
import type { Booking } from "@/domain/types";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CalendarDays, MapPin, Search, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const selectCls = "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm";

export default function BookingsPage() {
  const { service, refresh, user } = useApp();
  const searchParams = useSearchParams();
  const guestFilter = searchParams.get("guest");
  const canEdit = user ? can(user.role, "bookings.manage") : false;
  const stays = service.state.businesses.filter((b) => b.type === "STAY");
  const guests = service.state.customers.filter((c) => !c.deleted_at);
  const rooms = service.state.rooms.filter((r) => !r.deleted_at);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Booking | null>(null);
  const [propertyId, setPropertyId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [checkInFrom, setCheckInFrom] = useState("");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return service.state.bookings
      .filter((b) => !b.deleted_at)
      .filter((b) => !guestFilter || b.customer_id === guestFilter)
      .filter((b) => propertyId === "all" || b.business_id === propertyId)
      .filter((b) => statusFilter === "all" || b.status === statusFilter)
      .filter((b) => !checkInFrom || b.check_in >= checkInFrom)
      .filter((b) => {
        if (!q) return true;
        const guest = guests.find((c) => c.id === b.customer_id);
        const room = rooms.find((r) => r.id === b.room_id);
        const property = stays.find((s) => s.id === b.business_id);
        const hay = [guest?.name, guest?.phone, room?.number, room?.name, property?.name, b.notes]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .slice()
      .sort((a, b) => b.check_in.localeCompare(a.check_in));
  }, [service.state.bookings, guestFilter, propertyId, statusFilter, checkInFrom, query, guests, rooms, stays]);

  const guestName = (id: string) => guests.find((c) => c.id === id)?.name ?? "Guest";
  const roomNo = (id: string) => rooms.find((r) => r.id === id)?.number ?? "—";
  const propertyName = (id: string) => stays.find((s) => s.id === id)?.name ?? "Stay";

  return (
    <Screen
      title="Bookings"
      description="Search stays, compare dates and totals, and open front desk check-in."
      actions={
        canEdit ? (
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            New booking
          </Button>
        ) : null
      }
    >
      {guestFilter && (
        <p className="mb-3 text-sm text-muted-foreground">
          Showing stays for {guestName(guestFilter)}.{" "}
          <Link className="underline" href="/bookings">
            Show all
          </Link>
        </p>
      )}

      <div className="mb-6 overflow-hidden rounded-xl border border-[#003580]/20 bg-gradient-to-br from-[#003580]/5 to-background shadow-sm">
        <div className="border-b border-[#003580]/10 bg-[#003580] px-4 py-3 text-white">
          <p className="text-sm font-medium">Find a reservation</p>
          <p className="text-xs text-white/80">Filter by property, dates, or guest — similar to a booking search.</p>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5 lg:col-span-2">
            <Label htmlFor="booking-search" className="text-xs text-muted-foreground">
              Guest or room
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="booking-search"
                className="pl-8"
                placeholder="Name, phone, room…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Property</Label>
            <select className={selectCls} value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              <option value="all">All properties</option>
              {stays.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Check-in from</Label>
            <Input type="date" value={checkInFrom} onChange={(e) => setCheckInFrom(e.target.value)} />
          </div>
          <div className="grid gap-1.5 md:col-span-2 lg:col-span-4">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "all", label: "All" },
                { id: "RESERVED", label: "Reserved" },
                { id: "CHECKED_IN", label: "In house" },
                { id: "CHECKED_OUT", label: "Checked out" },
                { id: "CANCELLED", label: "Cancelled" },
              ].map((s) => (
                <Button
                  key={s.id}
                  type="button"
                  size="sm"
                  variant={statusFilter === s.id ? "default" : "outline"}
                  className={cn(statusFilter === s.id && s.id !== "all" && "bg-[#003580] hover:bg-[#003580]/90")}
                  onClick={() => setStatusFilter(s.id)}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="mb-3 text-sm text-muted-foreground">
        {rows.length} reservation{rows.length === 1 ? "" : "s"}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map((b) => {
          let nights = 0;
          try {
            nights = daysBetween(b.check_in, b.check_out);
          } catch {
            nights = 0;
          }
          return (
            <article
              key={b.id}
              className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3 border-b bg-muted/30 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[#003580]">{propertyName(b.business_id)}</p>
                  <Link
                    className="mt-0.5 block truncate text-lg font-medium hover:underline"
                    href={`/guests?guest=${b.customer_id}`}
                  >
                    {guestName(b.customer_id)}
                  </Link>
                </div>
                <StatusBadge value={b.status} />
              </div>
              <div className="grid flex-1 gap-3 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="size-4 shrink-0" />
                    {b.check_in} → {b.check_out}
                    {nights > 0 && (
                      <Badge variant="secondary" className="ml-1 font-normal">
                        {nights} night{nights === 1 ? "" : "s"}
                      </Badge>
                    )}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-4 shrink-0" />
                    Room {roomNo(b.room_id)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="size-4 shrink-0" />
                    {b.adults} adult{b.adults === 1 ? "" : "s"}
                    {b.children > 0 ? ` · ${b.children} child${b.children === 1 ? "" : "ren"}` : ""}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Booked {formatKolkata(b.created_at)}</p>
              </div>
              <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t px-4 py-3">
                <div>
                  <p className="text-xs text-muted-foreground">Total stay</p>
                  <p className="text-xl font-semibold tabular-nums text-[#003580]">
                    <Money paise={b.total_paise} />
                  </p>
                  {b.balance_paise > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Balance <Money paise={b.balance_paise} />
                    </p>
                  )}
                </div>
                {canEdit && (
                  <div className="flex flex-wrap justify-end gap-1">
                    {(b.status === "RESERVED" || b.status === "ENQUIRY" || b.status === "CHECKED_IN") && (
                      <Link className={buttonVariants({ variant: "default", size: "sm", className: "bg-[#003580] hover:bg-[#003580]/90" })} href={`/check?booking=${b.id}`}>
                        Front desk
                      </Link>
                    )}
                    {b.status !== "CHECKED_OUT" && b.status !== "CANCELLED" && b.status !== "NO_SHOW" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditing(b);
                          setOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                    )}
                    {b.status !== "CHECKED_OUT" && b.status !== "CANCELLED" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          try {
                            service.cancelBooking(b.id);
                            toast.success("Booking cancelled");
                            refresh();
                          } catch (er) {
                            toast.error(er instanceof Error ? er.message : "Failed");
                          }
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {rows.length === 0 && (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No bookings match your filters. Try clearing dates or search.
        </p>
      )}

      <BookingDialog
        key={`${open}-${editing?.id ?? "new"}`}
        open={open}
        onOpenChange={setOpen}
        booking={editing}
        stays={stays}
        guests={guests}
        rooms={rooms}
        onSave={(data) => {
          try {
            let customerId = data.customer_id;
            if (data.newGuest) {
              const guest = service.createCustomer(data.newGuest);
              customerId = guest.id;
            }
            if (editing) {
              service.updateBooking(editing.id, {
                customer_id: customerId,
                room_id: data.room_id,
                check_in: data.check_in,
                check_out: data.check_out,
                adults: data.adults,
                children: data.children,
                rate_paise: data.rate_paise,
                total_paise: data.total_paise,
                notes: data.notes,
              });
              toast.success("Booking updated", { description: "Queued for sync" });
            } else {
              service.createBooking({
                business_id: data.business_id,
                customer_id: customerId,
                room_id: data.room_id,
                check_in: data.check_in,
                check_out: data.check_out,
                adults: data.adults,
                children: data.children,
                rate_paise: data.rate_paise,
                paid_paise: data.paid_paise,
                payment_method: "UPI",
              });
              toast.success("Booking saved", { description: "Queued for sync" });
            }
            setOpen(false);
            refresh();
          } catch (er) {
            toast.error(er instanceof Error ? er.message : "Failed");
          }
        }}
      />
    </Screen>
  );
}

function BookingDialog({
  open,
  onOpenChange,
  booking,
  stays,
  guests,
  rooms,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  booking: Booking | null;
  stays: { id: string; name: string }[];
  guests: { id: string; name: string; phone: string }[];
  rooms: { id: string; business_id: string; number: string; name: string; base_price_paise: number }[];
  onSave: (data: {
    business_id: string;
    customer_id: string;
    room_id: string;
    check_in: string;
    check_out: string;
    adults: number;
    children: number;
    rate_paise: number;
    total_paise?: number;
    paid_paise?: number;
    notes?: string;
    newGuest?: { name: string; phone: string; email?: string };
  }) => void;
}) {
  const [businessId, setBusinessId] = useState(booking?.business_id ?? stays[0]?.id ?? "");
  const stayRooms = rooms.filter((r) => r.business_id === businessId);
  const [roomId, setRoomId] = useState(booking?.room_id ?? stayRooms[0]?.id ?? "");
  const [customerId, setCustomerId] = useState(booking?.customer_id ?? guests[0]?.id ?? "new");
  const selectedRoom = stayRooms.find((r) => r.id === roomId) ?? stayRooms[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{booking ? "Edit booking" : "New booking"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const newName = String(fd.get("guest_name") ?? "").trim();
            const newPhone = String(fd.get("guest_phone") ?? "").trim();
            onSave({
              business_id: String(fd.get("business_id")),
              customer_id: String(fd.get("customer_id")),
              room_id: String(fd.get("room_id")),
              check_in: String(fd.get("check_in")),
              check_out: String(fd.get("check_out")),
              adults: Number(fd.get("adults")),
              children: Number(fd.get("children") || 0),
              rate_paise: rupeesToPaise(Number(fd.get("rate_rupees"))),
              total_paise: booking ? rupeesToPaise(Number(fd.get("total_rupees"))) : undefined,
              paid_paise: booking ? undefined : rupeesToPaise(Number(fd.get("paid_rupees") || 0)),
              notes: String(fd.get("notes") ?? ""),
              newGuest: customerId === "new" ? { name: newName, phone: newPhone, email: String(fd.get("guest_email") ?? "") } : undefined,
            });
          }}
        >
          <div className="grid gap-1">
            <Label>Property</Label>
            <select
              name="business_id"
              className={selectCls}
              value={businessId}
              disabled={!!booking}
              onChange={(e) => {
                setBusinessId(e.target.value);
                const first = rooms.find((r) => r.business_id === e.target.value);
                setRoomId(first?.id ?? "");
              }}
            >
              {stays.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <Label>Guest</Label>
            <select name="customer_id" className={selectCls} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="new">New guest…</option>
              {guests.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                  {g.phone ? ` · ${g.phone}` : ""}
                </option>
              ))}
            </select>
          </div>
          {customerId === "new" && (
            <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-2">
              <div className="grid gap-1">
                <Label>Name</Label>
                <Input name="guest_name" required placeholder="Guest name" />
              </div>
              <div className="grid gap-1">
                <Label>Phone</Label>
                <Input name="guest_phone" required placeholder="Phone" />
              </div>
              <div className="grid gap-1 md:col-span-2">
                <Label>Email</Label>
                <Input name="guest_email" type="email" placeholder="Optional" />
              </div>
            </div>
          )}
          <div className="grid gap-1">
            <Label>Room</Label>
            <select name="room_id" className={selectCls} value={roomId} onChange={(e) => setRoomId(e.target.value)} required>
              {stayRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.number} · {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="grid gap-1">
              <Label>Check-in</Label>
              <Input name="check_in" type="date" required defaultValue={booking?.check_in} />
            </div>
            <div className="grid gap-1">
              <Label>Check-out</Label>
              <Input name="check_out" type="date" required defaultValue={booking?.check_out} />
              {booking && (
                <p className="text-xs text-muted-foreground">You can shorten the stay, not add nights.</p>
              )}
            </div>
            <div className="grid gap-1">
              <Label>Adults</Label>
              <Input name="adults" type="number" min={1} defaultValue={booking?.adults ?? 2} />
            </div>
            <div className="grid gap-1">
              <Label>Children</Label>
              <Input name="children" type="number" min={0} defaultValue={booking?.children ?? 0} />
            </div>
            <div className="grid gap-1">
              <Label>Nightly rate (₹)</Label>
              <Input
                name="rate_rupees"
                type="number"
                min={0}
                step="0.01"
                defaultValue={paiseToRupees(booking?.rate_paise ?? selectedRoom?.base_price_paise ?? 0)}
              />
            </div>
            {!booking && (
              <div className="grid gap-1">
                <Label>Advance paid (₹)</Label>
                <Input name="paid_rupees" type="number" min={0} step="0.01" defaultValue={0} />
              </div>
            )}
            {booking && (
              <div className="grid gap-1">
                <Label>Total (₹)</Label>
                <Input
                  name="total_rupees"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={paiseToRupees(booking.total_paise)}
                />
              </div>
            )}
          </div>
          {booking && (
            <div className="grid gap-1">
              <Label>Notes</Label>
              <Input name="notes" defaultValue={booking.notes} />
            </div>
          )}
          <DialogFooter>
            <Button type="submit">{booking ? "Save" : "Create booking"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
