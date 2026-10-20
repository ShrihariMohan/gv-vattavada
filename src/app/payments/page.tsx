"use client";
import { Screen } from "@/ui/Screen";
import { Money } from "@/ui/Shell";
import { useApp } from "@/ui/AppProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

type PaymentSort = "recent" | "oldest" | "amount-desc" | "amount-asc";
const selectClass = "h-9 rounded-lg border border-input bg-background px-2.5 text-sm";

export default function PaymentsPage() {
  const { service } = useApp();
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<PaymentSort>("recent");
  const q = query.trim().toLowerCase();
  const payments = service.state.payments
    .filter((p) => !p.deleted_at)
    .filter((p) => method === "all" || p.method === method)
    .filter((p) => !from || p.business_date >= from)
    .filter((p) => !to || p.business_date <= to)
    .filter((p) => {
      if (!q) return true;
      const invoice = service.state.invoices.find((i) => i.id === p.invoice_id);
      return [invoice?.invoice_number, p.invoice_id, p.booking_id, p.notes, p.method]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    })
    .slice()
    .sort((a, b) => {
      if (sort === "oldest") return a.created_at.localeCompare(b.created_at);
      if (sort === "amount-desc") return b.amount_paise - a.amount_paise || b.created_at.localeCompare(a.created_at);
      if (sort === "amount-asc") return a.amount_paise - b.amount_paise || b.created_at.localeCompare(a.created_at);
      return b.created_at.localeCompare(a.created_at);
    });
  const totals: Record<string, number> = {};
  for (const p of payments) totals[p.method] = (totals[p.method] ?? 0) + p.amount_paise;
  return (
    <Screen title="Payments">
      <div className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="grid gap-1.5 lg:col-span-2">
          <Label htmlFor="payment-search">Search</Label>
          <Input
            id="payment-search"
            placeholder="Invoice, booking, note…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="payment-method">Method</Label>
          <select id="payment-method" className={selectClass} value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="all">All methods</option>
            {["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"].map((value) => (
              <option key={value} value={value}>{value.replace("_", " ")}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="payment-from">From</Label>
          <Input id="payment-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="payment-to">To</Label>
          <Input id="payment-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="payment-sort">Sort by</Label>
          <select id="payment-sort" className={selectClass} value={sort} onChange={(e) => setSort(e.target.value as PaymentSort)}>
            <option value="recent">Most recent</option>
            <option value="oldest">Oldest</option>
            <option value="amount-desc">Amount: high to low</option>
            <option value="amount-asc">Amount: low to high</option>
          </select>
        </div>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
        {Object.entries(totals).map(([k, v]) => (
          <Card key={k}>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">{k}</CardTitle>
            </CardHeader>
            <CardContent className="text-lg font-semibold"><Money paise={v} /></CardContent>
          </Card>
        ))}
      </div>
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Invoice</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.business_date}</TableCell>
                <TableCell>{p.method}</TableCell>
                <TableCell><Money paise={p.amount_paise} /></TableCell>
                <TableCell className="font-mono text-xs">
                  {service.state.invoices.find((i) => i.id === p.invoice_id)?.invoice_number ?? p.invoice_id ?? "—"}
                </TableCell>
              </TableRow>
            ))}
            {payments.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">No payments match these filters.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </Screen>
  );
}
