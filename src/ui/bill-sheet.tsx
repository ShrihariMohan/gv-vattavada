"use client";

import type { BillView } from "@/domain/bill";
import { cn } from "@/lib/utils";

export function BillSheet({ bill, className }: { bill: BillView; className?: string }) {
  const meta = [bill.guestPhone && `Ph ${bill.guestPhone}`, bill.room && `Rm ${bill.room}`, bill.table]
    .filter(Boolean)
    .join(" · ");
  return (
    <article
      className={cn(
        "bill-sheet mx-auto w-full max-w-[420px] bg-white p-6 text-[#111] shadow-sm ring-1 ring-black/10",
        className,
      )}
      style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
    >
      <header className="border-b border-black/20 pb-3 text-center">
        <p className="text-lg font-semibold tracking-tight">{bill.businessName}</p>
        <p className="mt-1 text-xs leading-relaxed text-[#444]">{bill.address}</p>
        <p className="text-xs text-[#444]">{bill.phone}</p>
        {bill.gstin && <p className="text-xs text-[#444]">GSTIN {bill.gstin}</p>}
      </header>
      <div className="mt-3 flex justify-between text-xs">
        <span>
          {bill.kind === "INVOICE" ? "Invoice" : "Bill"} {bill.docNo}
        </span>
        <span>{bill.date}</span>
      </div>
      <p className="mt-1 text-sm">
        {bill.customer}
        {meta ? <span className="text-[#555]"> · {meta}</span> : null}
      </p>
      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-y border-black/20 text-left text-xs uppercase tracking-wide text-[#555]">
            <th className="py-1.5 font-medium">Item</th>
            <th className="py-1.5 text-right font-medium">Qty</th>
            <th className="py-1.5 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {bill.items.map((line, i) => (
            <tr key={`${line.name}-${i}`} className="border-b border-black/10">
              <td className="py-1.5 pr-2">{line.name}</td>
              <td className="py-1.5 text-right tabular-nums">{line.qty}</td>
              <td className="py-1.5 text-right tabular-nums">{line.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 space-y-0.5 text-sm">
        <Row label="Subtotal" value={bill.subtotal} />
        <Row label="Discount" value={bill.discount} />
        <Row label="Tax" value={bill.tax} />
        <Row label="Total" value={bill.total} strong />
        <p className="pt-1 text-xs text-[#444]">
          {bill.paymentMethod} · {bill.paymentStatus}
        </p>
      </div>
      <footer className="bill-footer mt-6 border-t border-dashed border-black/30 pt-3 text-center text-[11px] leading-relaxed text-[#444]">
        {bill.footerLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </footer>
    </article>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between", strong && "font-semibold")}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
