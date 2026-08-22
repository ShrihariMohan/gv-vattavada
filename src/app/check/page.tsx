"use client";

import { Screen } from "@/ui/Screen";
import { Money } from "@/ui/Shell";
import { StatusBadge } from "@/ui/status-badge";
import { useApp } from "@/ui/AppProvider";
import { stayInvoiceForBooking } from "@/domain/bill";
import { rupeesToPaise } from "@/domain/money";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

const selectCls = "h-8 w-full max-w-lg rounded-lg border border-input bg-background px-2.5 text-sm";

export default function CheckPage() {
  const { service, refresh } = useApp();
  const router = useRouter();
  const bookings = service.state.bookings
    .filter((b) => !b.deleted_at)
    .slice()
    .sort((a, b) => {
      const rank = (s: string) => (s === "CHECKED_IN" ? 0 : s === "RESERVED" || s === "ENQUIRY" ? 1 : 2);
      return rank(a.status) - rank(b.status) || b.check_in.localeCompare(a.check_in);
    });
  const [id, setId] = useState(bookings.find((b) => b.status === "RESERVED" || b.status === "CHECKED_IN")?.id ?? bookings[0]?.id ?? "");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("booking");
    if (q && bookings.some((b) => b.id === q)) setId(q);
  }, [bookings]);

  const b = bookings.find((x) => x.id === id);
  const guest = b ? service.state.customers.find((c) => c.id === b.customer_id) : null;
  const room = b ? service.state.rooms.find((r) => r.id === b.room_id) : null;
  const property = b ? service.state.businesses.find((x) => x.id === b.business_id) : null;
  const stayInvoice = b ? stayInvoiceForBooking(service.state, b.id) : null;

  const openOrCreateInvoice = () => {
    if (!b) return;
    try {
      const inv = service.generateStayInvoice(b.id);
      refresh();
      router.push(`/invoices/${inv.id}`);
    } catch (er) {
      toast.error(er instanceof Error ? er.message : "Failed");
    }
  };

  return (
    <Screen title="Check-in / Check-out" description="Arrive and depart against the booking. Extra charges go on the stay invoice.">
      {bookings.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No bookings yet. <Link className="underline" href="/bookings">Create a reservation</Link> first.
        </p>
      ) : (
        <select className={`${selectCls} mb-4`} value={id} onChange={(e) => setId(e.target.value)}>
          {bookings.map((x) => {
            const g = service.state.customers.find((c) => c.id === x.customer_id);
            const r = service.state.rooms.find((rm) => rm.id === x.room_id);
            return (
              <option key={x.id} value={x.id}>
                {g?.name ?? "Guest"} · Room {r?.number ?? "?"} · {x.status.replaceAll("_", " ")}
              </option>
            );
          })}
        </select>
      )}
      {b && (
        <Card className="max-w-lg">
          <CardContent className="grid gap-2 pt-6 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span>
                Guest:{" "}
                <Link className="underline-offset-2 hover:underline" href={`/guests?guest=${b.customer_id}`}>
                  {guest?.name}
                </Link>
              </span>
              <StatusBadge value={b.status} />
            </div>
            <div>
              Room:{" "}
              <Link className="underline-offset-2 hover:underline" href="/rooms">
                {room?.number} {room?.name ? `· ${room.name}` : ""}
              </Link>
            </div>
            <div>Property: {property?.name}</div>
            <div>
              Stay: {b.check_in} → {b.check_out}
            </div>
            <div>
              Guests: {b.adults} adults, {b.children} children
            </div>
            <div>
              Rate: <Money paise={b.rate_paise} /> / night
            </div>
            <div>
              Food: <Money paise={b.food_paise} />
            </div>
            <div>
              Extra bed: <Money paise={b.extra_bed_paise} />
            </div>
            <div>
              Other extras: <Money paise={b.extra_charges_paise} />
            </div>
            <div>
              Paid: <Money paise={b.paid_paise} />
            </div>
            <div>
              Balance: <Money paise={b.balance_paise} />
            </div>
            {(b.status === "RESERVED" || b.status === "ENQUIRY") && (
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  onClick={() => {
                    try {
                      service.checkIn(b.id);
                      refresh();
                      toast.success("Checked in");
                    } catch (er) {
                      toast.error(er instanceof Error ? er.message : "Failed");
                    }
                  }}
                >
                  Check in
                </Button>
                <Link className={buttonVariants({ variant: "outline" })} href={`/bookings?guest=${b.customer_id}`}>
                  Edit booking
                </Link>
              </div>
            )}
            {b.status === "CHECKED_IN" && (
              <form
                className="mt-2 grid gap-2 border-t pt-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  try {
                    service.checkOut(b.id, {
                      food_paise: rupeesToPaise(Number(fd.get("food") || 0)),
                      extra_bed_paise: rupeesToPaise(Number(fd.get("extra_bed") || 0)),
                      extra_charges_paise: rupeesToPaise(Number(fd.get("other") || 0)),
                    });
                    refresh();
                    toast.success("Checked out", { description: "Room is marked for cleaning" });
                  } catch (er) {
                    toast.error(er instanceof Error ? er.message : "Failed");
                  }
                }}
              >
                <p className="text-muted-foreground">Add extras in rupees, or leave 0.</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="grid gap-1">
                    <Label>Food</Label>
                    <Input name="food" type="number" min={0} step="0.01" defaultValue={0} />
                  </div>
                  <div className="grid gap-1">
                    <Label>Extra bed</Label>
                    <Input name="extra_bed" type="number" min={0} step="0.01" defaultValue={0} />
                  </div>
                  <div className="grid gap-1">
                    <Label>Other</Label>
                    <Input name="other" type="number" min={0} step="0.01" defaultValue={0} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit">Check out</Button>
                  {stayInvoice ? (
                    <Link className={buttonVariants({ variant: "secondary" })} href={`/invoices/${stayInvoice.id}`}>
                      View invoice
                    </Link>
                  ) : (
                    <Button type="button" variant="secondary" onClick={openOrCreateInvoice}>
                      Generate invoice
                    </Button>
                  )}
                </div>
              </form>
            )}
            {b.status === "CHECKED_OUT" &&
              (stayInvoice ? (
                <Link className={buttonVariants({ variant: "secondary" })} href={`/invoices/${stayInvoice.id}`}>
                  View invoice
                </Link>
              ) : (
                <Button variant="secondary" onClick={openOrCreateInvoice}>
                  Generate invoice
                </Button>
              ))}
          </CardContent>
        </Card>
      )}
    </Screen>
  );
}
