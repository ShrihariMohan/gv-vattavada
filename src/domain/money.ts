/** All money is stored as integer paise. Never use floating-point for totals. */
export type Paise = number;

export function rupeesToPaise(rupees: number): Paise {
  if (!Number.isFinite(rupees)) throw new Error("Invalid rupees");
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: Paise): number {
  assertPaise(paise);
  return paise / 100;
}

export function assertPaise(paise: Paise): void {
  if (!Number.isInteger(paise)) {
    throw new Error("Money must be integer paise");
  }
}

export function addPaise(...amounts: Paise[]): Paise {
  amounts.forEach(assertPaise);
  return amounts.reduce((a, b) => a + b, 0);
}

export function subPaise(a: Paise, b: Paise): Paise {
  assertPaise(a);
  assertPaise(b);
  return a - b;
}

export function mulQty(unitPaise: Paise, qty: number): Paise {
  assertPaise(unitPaise);
  if (!Number.isInteger(qty) || qty < 0) throw new Error("Quantity must be a non-negative integer");
  return unitPaise * qty;
}

/** tax_bps is basis points: 500 = 5% */
export function taxOn(basePaise: Paise, taxBps: number): Paise {
  assertPaise(basePaise);
  if (!Number.isInteger(taxBps) || taxBps < 0) throw new Error("tax_bps must be a non-negative integer");
  return Math.round((basePaise * taxBps) / 10000);
}

export function formatINR(paise: Paise, locale = "en-IN"): string {
  assertPaise(paise);
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const remainder = abs % 100;
  const grouped = rupees.toLocaleString(locale);
  return `${sign}₹${grouped}.${remainder.toString().padStart(2, "0")}`;
}

export function formatCompactINR(paise: Paise): string {
  assertPaise(paise);
  const rupees = paise / 100;
  if (Math.abs(rupees) >= 100000) {
    return `₹${(rupees / 100000).toFixed(1)}L`;
  }
  return formatINR(paise);
}

export interface LineItem {
  qty: number;
  unit_price_paise: Paise;
  tax_bps: number;
}

export interface InvoiceSnapshot {
  subtotal_paise: Paise;
  discount_paise: Paise;
  tax_paise: Paise;
  total_paise: Paise;
  paid_amount_paise: Paise;
  balance_amount_paise: Paise;
}

export function computeInvoiceSnapshot(
  items: LineItem[],
  discountPaise: Paise,
  paidPaise: Paise,
): InvoiceSnapshot {
  assertPaise(discountPaise);
  assertPaise(paidPaise);
  if (discountPaise < 0 || paidPaise < 0) throw new Error("Amounts cannot be negative");

  const subtotal = items.reduce((sum, item) => addPaise(sum, mulQty(item.unit_price_paise, item.qty)), 0);
  if (discountPaise > subtotal) throw new Error("Discount cannot exceed subtotal");
  const taxable = subtotal - discountPaise;
  const tax = items.length
    ? items.reduce((sum, item) => {
        const line = mulQty(item.unit_price_paise, item.qty);
        const share = subtotal === 0 ? 0 : Math.round((line / subtotal) * discountPaise);
        const lineTaxable = line - share;
        return addPaise(sum, taxOn(lineTaxable, item.tax_bps));
      }, 0)
    : 0;
  const total = taxable + tax;
  const paid = Math.min(paidPaise, total);
  return {
    subtotal_paise: subtotal,
    discount_paise: discountPaise,
    tax_paise: tax,
    total_paise: total,
    paid_amount_paise: paid,
    balance_amount_paise: total - paid,
  };
}

export function paymentStatus(paid: Paise, total: Paise): "UNPAID" | "PARTIAL" | "PAID" {
  if (paid <= 0) return "UNPAID";
  if (paid < total) return "PARTIAL";
  return "PAID";
}
