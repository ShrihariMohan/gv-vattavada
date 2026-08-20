"use client";
import { Screen } from "@/ui/Screen";
import { Money } from "@/ui/Shell";
import { useApp } from "@/ui/AppProvider";
import { GLOBAL_EXPENSE_CATEGORIES, PAYMENT_METHODS } from "@/domain/rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export default function ExpensesPage() {
  const { service, refresh } = useApp();
  return (
    <Screen title="Expenses">
      <form
        className="mb-4 grid gap-2 rounded-xl border bg-card p-4 md:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          service.createExpense({
            business_id: String(fd.get("business_id")),
            category: String(fd.get("category")),
            amount_paise: Number(fd.get("amount_paise")),
            payment_method: String(fd.get("payment_method")) as (typeof PAYMENT_METHODS)[number],
            description: String(fd.get("description")),
            vendor: String(fd.get("vendor")),
          });
          toast.success("Expense saved locally");
          refresh();
        }}
      >
        <select name="business_id" className="h-8 rounded-lg border border-input px-2 text-sm">
          {service.state.businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select name="category" className="h-8 rounded-lg border border-input px-2 text-sm">
          {GLOBAL_EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <Input name="amount_paise" type="number" required placeholder="Amount paise" />
        <select name="payment_method" className="h-8 rounded-lg border border-input px-2 text-sm">
          {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
        </select>
        <Input name="vendor" placeholder="Vendor" />
        <Input name="description" required placeholder="Description" />
        <Button type="submit">Add expense</Button>
      </form>
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Business</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Method</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {service.state.expenses.slice().reverse().map((e) => (
              <TableRow key={e.id}>
                <TableCell>{e.business_date}</TableCell>
                <TableCell>{service.state.businesses.find((b) => b.id === e.business_id)?.name}</TableCell>
                <TableCell>{e.category}</TableCell>
                <TableCell><Money paise={e.amount_paise} /></TableCell>
                <TableCell>{e.payment_method}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </Screen>
  );
}
