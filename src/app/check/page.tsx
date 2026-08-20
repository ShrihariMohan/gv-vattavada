"use client";
import { Screen } from "@/ui/Screen";
import { Money } from "@/ui/Shell";
import { useApp } from "@/ui/AppProvider";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export default function CheckPage() {
  const { service, refresh } = useApp();
  const [id, setId] = useState(service.state.bookings[0]?.id ?? "");
  const b = service.state.bookings.find((x) => x.id === id);
  const guest = b ? service.state.customers.find((c) => c.id === b.customer_id) : null;
  const room = b ? service.state.rooms.find((r) => r.id === b.room_id) : null;
  return (
    <Screen title="Check-in / Check-out">
      <select className="mb-4 h-8 rounded-lg border border-input px-2 text-sm" value={id} onChange={(e) => setId(e.target.value)}>
        {service.state.bookings.map((x) => (
          <option key={x.id} value={x.id}>{x.id} · {x.status}</option>
        ))}
      </select>
      {b && (
        <Card className="max-w-lg">
          <CardContent className="grid gap-2 pt-6 text-sm">
            <div>Guest: {guest?.name}</div>
            <div>Room: {room?.number}</div>
            <div>Check-in: {b.check_in}</div>
            <div>Check-out: {b.check_out}</div>
            <div>Guests: {b.adults} adults, {b.children} children</div>
            <div>Rate: <Money paise={b.rate_paise} /></div>
            <div>Food: <Money paise={b.food_paise} /></div>
            <div>Extra bed: <Money paise={b.extra_bed_paise} /></div>
            <div>Discount: <Money paise={b.discount_paise} /></div>
            <div>Paid: <Money paise={b.paid_paise} /></div>
            <div>Balance: <Money paise={b.balance_paise} /></div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={() => { service.checkIn(b.id); refresh(); toast.success("Checked in"); }}>Check in</Button>
              <Button variant="outline" onClick={() => { service.checkOut(b.id, { food_paise: 80000, extra_bed_paise: 50000 }); refresh(); toast.success("Checked out"); }}>Check out</Button>
              <Button variant="secondary" onClick={() => { const inv = service.generateStayInvoice(b.id); refresh(); location.href = `/invoices/${inv.id}`; }}>Generate invoice</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </Screen>
  );
}
