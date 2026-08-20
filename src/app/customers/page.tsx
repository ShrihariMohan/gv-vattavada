"use client";
import { Screen } from "@/ui/Screen";
import { Money } from "@/ui/Shell";
import { useApp } from "@/ui/AppProvider";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export default function CustomersPage() {
  const { service, refresh } = useApp();
  const [id, setId] = useState(service.state.customers[0]?.id ?? "");
  const led = id ? service.customerLedger(id) : null;
  const c = service.state.customers.find((x) => x.id === id);
  return (
    <Screen title="Customers">
      <form
        className="mb-4 grid gap-2 rounded-xl border bg-card p-4 md:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          service.createCustomer({
            name: String(fd.get("name")),
            phone: String(fd.get("phone")),
            email: String(fd.get("email")),
            address: String(fd.get("address")),
          });
          toast.success("Customer saved locally");
          refresh();
        }}
      >
        <Input name="name" required placeholder="Name" />
        <Input name="phone" placeholder="Phone" />
        <Input name="email" placeholder="Email" />
        <Button type="submit">Add</Button>
      </form>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {service.state.customers.map((x) => (
                <TableRow key={x.id} className="cursor-pointer" onClick={() => setId(x.id)}>
                  <TableCell>{x.name}</TableCell>
                  <TableCell>{x.phone}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        {c && led && (
          <Card>
            <CardHeader>
              <CardTitle>{c.name}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <div>Total charges <Money paise={led.total_charges_paise} /></div>
              <div>Total paid <Money paise={led.total_paid_paise} /></div>
              <div>Outstanding <Money paise={led.outstanding_paise} /></div>
              <div>Stays: {service.state.bookings.filter((b) => b.customer_id === c.id).length}</div>
              <div>Invoices: {service.state.invoices.filter((i) => i.customer_id === c.id).length}</div>
            </CardContent>
          </Card>
        )}
      </div>
    </Screen>
  );
}
