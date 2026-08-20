"use client";
import { Screen } from "@/ui/Screen";
import { billFromInvoice } from "@/domain/bill";
import { useApp } from "@/ui/AppProvider";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { BillActions } from "@/ui/bill-actions";

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { service, refresh } = useApp();
  const bill = billFromInvoice(service.state, id);
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
