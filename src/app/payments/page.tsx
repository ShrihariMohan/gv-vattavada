"use client";
import { Screen } from "@/ui/Screen";
import { Money } from "@/ui/Shell";
import { useApp } from "@/ui/AppProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function PaymentsPage() {
  const { service } = useApp();
  const totals: Record<string, number> = {};
  for (const p of service.state.payments) totals[p.method] = (totals[p.method] ?? 0) + p.amount_paise;
  return (
    <Screen title="Payments">
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
            {service.state.payments.slice().reverse().map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.business_date}</TableCell>
                <TableCell>{p.method}</TableCell>
                <TableCell><Money paise={p.amount_paise} /></TableCell>
                <TableCell className="font-mono text-xs">{p.invoice_id}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </Screen>
  );
}
