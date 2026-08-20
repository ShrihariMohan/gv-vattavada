"use client";
import { Screen } from "@/ui/Screen";
import { invoicePrintModel } from "@/domain/service";
import { wrapInvoiceLines, thermalWidthChars } from "@/domain/rules";
import { useApp } from "@/ui/AppProvider";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { service, refresh } = useApp();
  const [width, setWidth] = useState<58 | 80 | "A4">("A4");
  const model = invoicePrintModel(service.state, id);
  const chars = width === "A4" ? 48 : thermalWidthChars(width);
  const lines = wrapInvoiceLines(model.items, chars);
  return (
    <Screen
      title={model.invoiceNo}
      actions={
        <div className="flex flex-wrap gap-2">
          <select value={width} onChange={(e) => setWidth(e.target.value as typeof width)} className="h-8 rounded-lg border border-input px-2 text-sm">
            <option value="A4">A4</option>
            <option value={80}>80mm</option>
            <option value={58}>58mm</option>
          </select>
          <Button variant="outline" onClick={() => window.print()}>Print</Button>
          <Button variant="outline" onClick={() => navigator.share?.({ title: model.invoiceNo, text: `${model.businessName} ${model.total}` })}>Share</Button>
          <Button variant="destructive" onClick={() => { service.voidInvoice(id, "ui"); refresh(); toast.success("Invoice voided"); }}>Void</Button>
        </div>
      }
    >
      <Card className={width === "A4" ? "" : "thermal"}>
        <CardContent className={`p-6 ${width === 58 ? "thermal-58" : ""}`}>
          <div className="text-center">
            <div className="text-lg font-semibold">{model.businessName}</div>
            <div className="text-sm text-muted-foreground">{model.address}</div>
            <div className="text-sm">{model.phone} {model.gstin ? `· GSTIN ${model.gstin}` : ""}</div>
          </div>
          <div className="mt-4 text-sm">Invoice {model.invoiceNo} · {model.date}</div>
          <div className="text-sm">Customer: {model.customer}</div>
          <pre className="mt-4 font-mono text-sm">{lines.join("\n")}</pre>
          <div className="mt-4 space-y-1 text-sm">
            <div>Subtotal {model.subtotal}</div>
            <div>Discount {model.discount}</div>
            <div>Tax {model.tax}</div>
            <div className="font-semibold">Total {model.total}</div>
            <div>{model.paymentMethod} · {model.paymentStatus}</div>
            <div className="mt-4">{model.thankYou}</div>
          </div>
        </CardContent>
      </Card>
    </Screen>
  );
}
