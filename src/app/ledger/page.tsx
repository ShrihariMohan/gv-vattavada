"use client";
import { Screen } from "@/ui/Screen";
import { Money } from "@/ui/Shell";
import { useApp } from "@/ui/AppProvider";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export default function LedgerPage() {
  const { service } = useApp();
  return (
    <Screen title="Unified ledger">
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
            {service.state.ledger.slice().reverse().map((l) => (
              <TableRow key={l.id}>
                <TableCell>{l.business_date}</TableCell>
                <TableCell>{service.state.businesses.find((b) => b.id === l.business_id)?.name}</TableCell>
                <TableCell>{l.type}</TableCell>
                <TableCell className={cn(l.amount_paise < 0 ? "text-destructive" : "text-primary")}>
                  <Money paise={l.amount_paise} />
                </TableCell>
                <TableCell>{l.description}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </Screen>
  );
}
