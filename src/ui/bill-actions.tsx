"use client";

import { useRef, useState, type ReactNode } from "react";
import { BillSheet } from "@/ui/bill-sheet";
import { copyBillImage, printBill, shareBillImage } from "@/ui/share-bill";
import type { BillView } from "@/domain/bill";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function BillActions({
  bill,
  extra,
  variant = "default",
}: {
  bill: BillView;
  extra?: ReactNode;
  variant?: "default" | "thermal";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    if (!ref.current) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not share bill");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="no-print mb-3 flex flex-wrap gap-2">
         <Button variant="outline" disabled={busy} onClick={() => printBill(ref.current)}>
          Print
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => run(() => copyBillImage(ref.current!))}>
          Copy image
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => run(() => shareBillImage(ref.current!, bill.docNo))}>
          Share
        </Button>
       
        {extra}
      </div>
      <div
        ref={ref}
        className={cn("bill-print-root", variant === "thermal" && "flex justify-center bg-muted/30 py-3")}
      >
        <BillSheet bill={bill} variant={variant} />
      </div>
    </div>
  );
}
