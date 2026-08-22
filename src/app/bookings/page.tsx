"use client";

import { Screen } from "@/ui/Screen";
import { Money } from "@/ui/Shell";
import { StatusBadge } from "@/ui/status-badge";
import { useApp } from "@/ui/AppProvider";
import { can } from "@/domain/rules";
import { paiseToRupees, rupeesToPaise } from "@/domain/money";
import type { Booking } from "@/domain/types";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const selectCls = "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm";

export default function BookingsPage() {
  const { service, refresh, user } = useApp();
  const canEdit = user ? can(user.role, "bookings.manage") : false;
  const stays = service.state.businesses.filter((b) => b.type === "STAY");
  const guests = service.state.customers.filter((c) => !c.deleted_at);
  const rooms = service.state.rooms.filter((r) => !r.deleted_at);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Booking | null>(null);
  const [guestFilter, setGuestFilter] = useState<string | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("guest");
    if (id) setGuestFilter(id);
  }, []);

  const rows = service.state.bookings
    .filter((b) => !b.deleted_at && (!guestFilter || b.customer_id === guestFilter))
    .slice()
    .sort((a, b) => b.check_in.localeCompare(a.check_in));

  const guestName = (id: string) => guests.find((c) => c.id === id)?.name ?? "Guest";
  const roomNo = (id: string) => rooms.find((r) => r.id === id)?.number ?? "—";

  return (
    <Screen
      title="Bookings"
      description="Reserve a room for a guest. Check-in and invoices stay linked to this stay."
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
          <button className="underline" type="button" onClick={() => setGuestFilter(null)}>
            Show all
          </button>
        </p>
      )}
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Guest</TableHead>
              <TableHead>Room</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Balance</TableHead>
              {canEdit && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((b) => (
              <TableRow key={b.id}>
                <TableCell>
                  <Link className="underline-offset-2 hover:underline" href={`/guests?guest=${b.customer_id}`}>
                    {guestName(b.customer_id)}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link className="underline-offset-2 hover:underline" href="/rooms">
                    {roomNo(b.room_id)}
                  </Link>
                </TableCell>
                <TableCell>
                  {b.check_in} → {b.check_out}
                </TableCell>
                <TableCell>
                  <StatusBadge value={b.status} />
                </TableCell>
                <TableCell>
                  <Money paise={b.total_paise} />
                </TableCell>
                <TableCell>
                  <Money paise={b.balance_paise} />
                </TableCell>
                {canEdit && (
                  <TableCell className="space-x-1 text-right whitespace-nowrap">
                    {(b.status === "RESERVED" || b.status === "ENQUIRY" || b.status === "CHECKED_IN") && (
                      <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={`/check?booking=${b.id}`}>
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
                    {b.status !== "CHECKED_IN" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          try {
                            service.deleteBooking(b.id);
                            toast.success("Booking deleted");
                            refresh();
                          } catch (er) {
                            toast.error(er instanceof Error ? er.message : "Failed");
                          }
                        }}
                      >
                        Delete
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
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
