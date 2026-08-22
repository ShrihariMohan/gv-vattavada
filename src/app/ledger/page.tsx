"use client";
import { Screen } from "@/ui/Screen";
import { Money } from "@/ui/Shell";
import { useApp } from "@/ui/AppProvider";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { LedgerType } from "@/domain/types";

const INCOME: LedgerType[] = ["SALE", "BOOKING"];
const OUT: LedgerType[] = ["EXPENSE", "REFUND"];

export default function LedgerPage() {
  const { service } = useApp();
  const rows = service.state.ledger
    .filter((l) => !l.deleted_at && l.type !== "PAYMENT")
    .slice()
    .sort((a, b) => b.business_date.localeCompare(a.business_date) || b.created_at.localeCompare(a.created_at));
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
