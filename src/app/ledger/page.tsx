"use client";
import { Screen } from "@/ui/Screen";
import { Money } from "@/ui/Shell";
import { useApp } from "@/ui/AppProvider";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { LedgerType } from "@/domain/types";
import { useState } from "react";

const INCOME: LedgerType[] = ["SALE", "BOOKING"];
const OUT: LedgerType[] = ["EXPENSE", "REFUND"];
type LedgerSort = "recent" | "oldest" | "amount-desc" | "amount-asc";
const selectClass = "h-9 rounded-lg border border-input bg-background px-2.5 text-sm";

export default function LedgerPage() {
  const { service } = useApp();
  const [query, setQuery] = useState("");
  const [businessId, setBusinessId] = useState("all");
  const [type, setType] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<LedgerSort>("recent");
  const q = query.trim().toLowerCase();
  const rows = service.state.ledger
    .filter((l) => !l.deleted_at && l.type !== "PAYMENT")
    .filter((l) => businessId === "all" || l.business_id === businessId)
    .filter((l) => type === "all" || l.type === type)
    .filter((l) => !from || l.business_date >= from)
    .filter((l) => !to || l.business_date <= to)
    .filter((l) => {
      if (!q) return true;
      const business = service.state.businesses.find((b) => b.id === l.business_id);
      return [l.description, l.ref_id, l.ref_type, business?.name, l.type]
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
  const net = rows.reduce((a, l) => a + l.amount_paise, 0);

  return (
    <Screen
      title="Unified ledger"
      description="Income and expenses once each. A POS bill is one SALE. Collecting payment is recorded on Payments, not as a second income line. Voiding an invoice posts a REFUND that cancels the sale."
    >
      <ol className="mb-4 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
        <li>Close a POS bill — one SALE for the bill total (cash/UPI is listed under Payments).</li>
        <li>Check a guest out, or issue a stay invoice — one BOOKING or SALE for the stay, not both.</li>
        <li>Log costs on Expenses — negative EXPENSE lines.</li>
        <li>Void an invoice — a REFUND reverses that sale so the ledger nets to zero for it.</li>
      </ol>
      <div className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="grid gap-1.5 lg:col-span-2">
          <Label htmlFor="ledger-search">Search</Label>
          <Input
            id="ledger-search"
            placeholder="Description, reference or business…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ledger-business">Business</Label>
          <select id="ledger-business" className={selectClass} value={businessId} onChange={(e) => setBusinessId(e.target.value)}>
            <option value="all">All businesses</option>
            {service.state.businesses.map((business) => (
              <option key={business.id} value={business.id}>{business.name}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ledger-type">Type</Label>
          <select id="ledger-type" className={selectClass} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">All types</option>
            {["SALE", "BOOKING", "EXPENSE", "REFUND", "ADJUSTMENT"].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ledger-from">From</Label>
          <Input id="ledger-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ledger-to">To</Label>
          <Input id="ledger-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ledger-sort">Sort by</Label>
          <select id="ledger-sort" className={selectClass} value={sort} onChange={(e) => setSort(e.target.value as LedgerSort)}>
            <option value="recent">Most recent</option>
            <option value="oldest">Oldest</option>
            <option value="amount-desc">Amount: high to low</option>
            <option value="amount-asc">Amount: low to high</option>
          </select>
        </div>
      </div>
      <p className="mb-4 text-sm">
        Net <span className="font-medium"><Money paise={net} /></span>
        <span className="text-muted-foreground"> · {rows.length} lines</span>
      </p>
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Business</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  No ledger lines yet. Close a POS bill, check a guest out, or add an expense.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.business_date}</TableCell>
                  <TableCell>{service.state.businesses.find((b) => b.id === l.business_id)?.name}</TableCell>
                  <TableCell>{l.type}</TableCell>
                  <TableCell
                    className={cn(
                      OUT.includes(l.type) || l.amount_paise < 0 ? "text-destructive" : INCOME.includes(l.type) ? "text-primary" : undefined,
                    )}
                  >
                    <Money paise={l.amount_paise} />
                  </TableCell>
                  <TableCell>{l.description}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </Screen>
  );
}
