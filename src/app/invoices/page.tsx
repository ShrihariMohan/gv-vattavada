"use client";
import { Screen } from "@/ui/Screen";
import { Money } from "@/ui/Shell";
import { StatusBadge } from "@/ui/status-badge";
import { useApp } from "@/ui/AppProvider";
import Link from "next/link";
import { useMemo, useState } from "react";
import { csvEscape } from "@/domain/rules";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function InvoicesPage() {
  const { service } = useApp();
  const [biz, setBiz] = useState("all");
  const [status, setStatus] = useState("all");
  const rows = useMemo(
    () =>
      service.state.invoices.filter(
        (i) => (biz === "all" || i.business_id === biz) && (status === "all" || i.payment_status === status),
      ),
    [service.state.invoices, biz, status],
  );
  return (
    <Screen
      title="Invoices"
      actions={
        <Button
          variant="outline"
          onClick={() => {
            const csv = csvEscape([
              ["No", "Business", "Date", "Amount", "Status"],
              ...rows.map((i) => [
                i.invoice_number,
                service.state.businesses.find((b) => b.id === i.business_id)?.name ?? "",
                i.business_date,
                i.total_paise / 100,
                i.payment_status,
              ]),
            ]);
            const blob = new Blob([csv], { type: "text/csv" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "invoices.csv";
            a.click();
          }}
        >
          Export CSV
        </Button>
      }
    >
      <div className="mb-3 flex gap-2">
        <select className="h-8 rounded-lg border border-input px-2 text-sm" value={biz} onChange={(e) => setBiz(e.target.value)}>
          <option value="all">All businesses</option>
          {service.state.businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className="h-8 rounded-lg border border-input px-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All payment status</option>
          <option>UNPAID</option><option>PARTIAL</option><option>PAID</option>
        </select>
      </div>
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Business</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Pay</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((i) => (
              <TableRow key={i.id}>
                <TableCell>
                  <Link className="underline" href={`/invoices/${i.id}`}>{i.invoice_number}</Link>
                </TableCell>
                <TableCell>{service.state.businesses.find((b) => b.id === i.business_id)?.name}</TableCell>
                <TableCell>{i.business_date}</TableCell>
                <TableCell><Money paise={i.total_paise} /></TableCell>
                <TableCell><StatusBadge value={i.payment_status} /></TableCell>
                <TableCell><StatusBadge value={i.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </Screen>
  );
}
