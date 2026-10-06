"use client";

import type { BillView } from "@/domain/bill";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/ui/brand";

export function BillSheet({
  bill,
  className,
  variant = "default",
}: {
  bill: BillView;
  className?: string;
  variant?: "default" | "thermal";
}) {
  const thermal = variant === "thermal";
  const meta = [bill.guestPhone && `Ph ${bill.guestPhone}`, bill.room && `Rm ${bill.room}`, bill.table]
    .filter(Boolean)
    .join(" · ");
  const hideDiscount = bill.discount === "₹0.00";
  return (
    <article
      className={cn(
        "bill-sheet mx-auto w-full bg-white text-[#111] shadow-sm ring-1 ring-black/10",
        thermal ? "thermal thermal-58 max-w-[58mm] p-2 font-mono text-[11px]" : "max-w-[420px] p-6",
        className,
      )}
      style={{ fontFamily: thermal ? undefined : "ui-sans-serif, system-ui, sans-serif" }}
    >
      <header className={cn("border-b border-black/20 text-center", thermal ? "pb-1" : "pb-3")}>
        <BrandLogo height={thermal ? 32 : 52} className={cn("mx-auto", thermal ? "mb-1 max-h-[32px]" : "mb-2 max-h-[52px]")} />
        <p className={cn("font-semibold tracking-tight", thermal ? "text-sm" : "text-lg")}>{bill.businessName}</p>
        <p className={cn("text-[#444]", thermal ? "text-[10px]" : "text-xs")}>{bill.phone}</p>
      </header>
      <div className={cn("flex justify-between", thermal ? "mt-1 text-[10px]" : "mt-3 text-xs")}>
        <span>
          {bill.kind === "INVOICE" ? "Invoice" : "Bill"} {bill.docNo}
        </span>
        <span>{bill.date}</span>
      </div>
      <p className={cn("mt-1", thermal ? "text-[11px]" : "text-sm")}>
        {bill.customer}
        {meta ? <span className="text-[#555]"> · {meta}</span> : null}
      </p>
      <table className={cn("mt-2 w-full border-collapse", thermal ? "text-[11px]" : "mt-4 text-sm")}>
        <thead>
          <tr
            className={cn(
              "border-y border-black/20 text-left uppercase tracking-wide text-[#555]",
              thermal ? "text-[10px]" : "text-xs",
            )}
          >
            <th className={cn("font-medium", thermal ? "py-0.5" : "py-1.5")}>Item</th>
            <th className={cn("text-right font-medium", thermal ? "py-0.5" : "py-1.5")}>Qty</th>
            <th className={cn("text-right font-medium", thermal ? "py-0.5" : "py-1.5")}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {bill.items.map((line, i) => (
            <tr key={`${line.name}-${i}`} className="border-b border-black/10">
              <td className={cn("pr-2", thermal ? "py-0.5" : "py-1.5")}>{line.name}</td>
              <td className={cn("text-right tabular-nums", thermal ? "py-0.5" : "py-1.5")}>{line.qty}</td>
              <td className={cn("text-right tabular-nums", thermal ? "py-0.5" : "py-1.5")}>{line.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={cn("space-y-0.5", thermal ? "mt-1 text-xs" : "mt-3 text-sm")}>
        <Row label="Subtotal" value={bill.subtotal} />
        {!hideDiscount && <Row label="Discount" value={bill.discount} />}
        {bill.tax !== "₹0.00" && <Row label="Tax" value={bill.tax} />}
        <Row label="Total" value={bill.total} strong />
        <p className={cn("pt-0.5 text-[#444]", thermal ? "text-[10px]" : "text-xs")}>
          {bill.paymentMethod} · {bill.paymentStatus}
        </p>
      </div>
      <footer
        className={cn(
          "bill-footer border-t border-dashed border-black/30 text-center text-[#444]",
          thermal ? "mt-2 pt-1 text-[10px] leading-snug" : "mt-6 pt-3 text-[11px] leading-relaxed",
        )}
      >
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
