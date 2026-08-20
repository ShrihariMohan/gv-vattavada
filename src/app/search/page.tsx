"use client";
import { Screen } from "@/ui/Screen";
import { useApp } from "@/ui/AppProvider";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function SearchInner() {
  const { service } = useApp();
  const q = useSearchParams().get("q") ?? "";
  const r = q ? service.search(q) : { customers: [], invoices: [], bookings: [], rooms: [], payments: [] };
  return (
    <Screen title="Search" description={q ? `Results for “${q}”` : "Use the header search for invoice, phone, room, or name."}>
      <Block title="Customers" items={r.customers.map((c) => `${c.name} ${c.phone}`)} />
      <Block title="Invoices" items={r.invoices.map((i) => i.invoice_number)} href={(i) => `/invoices/${r.invoices.find((x) => x.invoice_number === i)?.id}`} />
      <Block title="Bookings" items={r.bookings.map((b) => b.id)} />
      <Block title="Rooms" items={r.rooms.map((x) => `${x.number} ${x.name}`)} />
      <Block title="Payments" items={r.payments.map((p) => p.id)} />
    </Screen>
  );
}

function Block({ title, items, href }: { title: string; items: string[]; href?: (item: string) => string | undefined }) {
  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="text-sm">
          {items.map((i) => (
            <li key={i}>{href?.(i) ? <Link className="underline" href={href(i)!}>{i}</Link> : i}</li>
          ))}
          {!items.length && <li className="text-muted-foreground">None</li>}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<Screen title="Search"><p>Loading…</p></Screen>}>
      <SearchInner />
    </Suspense>
  );
}
