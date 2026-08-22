"use client";
import { Screen } from "@/ui/Screen";
import { billFromInvoice } from "@/domain/bill";
import { useApp } from "@/ui/AppProvider";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { BillActions } from "@/ui/bill-actions";
import Link from "next/link";

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { ready, service, refresh } = useApp();
  if (!ready) {
    return (
      <Screen title="Invoice">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </Screen>
    );
  }
  const invoice = service.state.invoices.find((i) => i.id === id);
  if (!invoice) {
    return (
      <Screen title="Invoice">
        <p className="text-sm text-muted-foreground">
          This invoice is not on this device yet.{" "}
          <Link className="underline" href="/invoices">
            Back to invoices
          </Link>
        </p>
      </Screen>
    );
  }
  let bill;
  try {
    bill = billFromInvoice(service.state, invoice.id);
  } catch (er) {
    return (
      <Screen title="Invoice">
        <p className="text-sm text-muted-foreground">{er instanceof Error ? er.message : "Could not open invoice"}</p>
      </Screen>
    );
  }
  return (
    <Screen
      title={bill.docNo}
      actions={
        <Button
          className="no-print"
          variant="destructive"
          onClick={() => {
            service.voidInvoice(id, "ui");
            refresh();
            toast.success("Invoice voided");
          }}
        >
          Void
        </Button>
      }
    >
      <BillActions bill={bill} />
    </Screen>
  );
}
