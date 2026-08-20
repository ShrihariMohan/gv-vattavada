"use client";

import { Badge } from "@/components/ui/badge";

export function StatusBadge({ value }: { value: string }) {
  const v = value.toUpperCase();
  const variant =
    v === "PAID" || v === "AVAILABLE" || v === "SYNCED" || v === "CHECKED_OUT"
      ? "secondary"
      : v === "CANCELLED" || v === "VOIDED" || v === "FAILED" || v === "OCCUPIED"
        ? "destructive"
        : "outline";
  return <Badge variant={variant}>{value.replaceAll("_", " ")}</Badge>;
}
