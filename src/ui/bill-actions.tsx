"use client";

import { useRef, useState, type ReactNode } from "react";
import { BillSheet } from "@/ui/bill-sheet";
import { copyBillImage, printBill, shareBillImage } from "@/ui/share-bill";
import type { BillView } from "@/domain/bill";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function BillActions({ bill, extra }: { bill: BillView; extra?: ReactNode }) {
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
        <Button variant="outline" disabled={busy} onClick={() => run(() => copyBillImage(ref.current!))}>
          Copy image
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => run(() => shareBillImage(ref.current!, bill.docNo))}>
          Share
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => printBill()}>
          Print
        </Button>
        {extra}
      </div>
      <div ref={ref} className="bill-print-root">
        <BillSheet bill={bill} />
      </div>
    </div>
  );
}
