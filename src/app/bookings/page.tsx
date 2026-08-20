"use client";
import { Screen } from "@/ui/Screen";
import { Money } from "@/ui/Shell";
import { StatusBadge } from "@/ui/status-badge";
import { useApp } from "@/ui/AppProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export default function BookingsPage() {
  const { service, refresh } = useApp();
  const stays = service.state.businesses.filter((b) => b.type === "STAY");
  return (
    <Screen title="Bookings" description="Create a reservation offline; it queues for sync.">
      <form
        className="mb-4 grid gap-2 rounded-xl border bg-card p-4 md:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          try {
            service.createBooking({
              business_id: String(fd.get("business_id")),
              customer_id: "cust-1",
              room_id: String(fd.get("room_id")),
              check_in: String(fd.get("check_in")),
              check_out: String(fd.get("check_out")),
              adults: Number(fd.get("adults")),
              children: 0,
              rate_paise: Number(fd.get("rate_paise")),
              paid_paise: Number(fd.get("paid_paise") || 0),
              payment_method: "UPI",
            });
            toast.success("Booking saved locally");
            refresh();
          } catch (er) {
            toast.error(er instanceof Error ? er.message : "Failed");
          }
        }}
      >
        <select name="business_id" className="h-8 rounded-lg border border-input px-2 text-sm">{stays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select name="room_id" className="h-8 rounded-lg border border-input px-2 text-sm">{service.state.rooms.map((r) => <option key={r.id} value={r.id}>{r.number}</option>)}</select>
        <Input name="check_in" type="date" required />
        <Input name="check_out" type="date" required />
        <Input name="adults" type="number" defaultValue={2} />
        <Input name="rate_paise" type="number" defaultValue={350000} />
        <Input name="paid_paise" type="number" defaultValue={0} />
        <Button type="submit">Create booking</Button>
      </form>
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Room</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {service.state.bookings.map((b) => (
              <TableRow key={b.id}>
                <TableCell>{service.state.rooms.find((r) => r.id === b.room_id)?.number}</TableCell>
                <TableCell>{b.check_in} → {b.check_out}</TableCell>
                <TableCell><StatusBadge value={b.status} /></TableCell>
                <TableCell><Money paise={b.total_paise} /></TableCell>
                <TableCell><Money paise={b.balance_paise} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </Screen>
  );
}
