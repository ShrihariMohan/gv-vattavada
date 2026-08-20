export const DISPLAY_TZ = "Asia/Kolkata";

export function nowUtc(clock: () => Date = () => new Date()): string {
  return clock().toISOString();
}

export function businessDateInKolkata(isoUtc: string): string {
  const d = new Date(isoUtc);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DISPLAY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${day}`;
}

export function formatKolkata(isoUtc: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: DISPLAY_TZ,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoUtc));
}

export function yearInKolkata(isoUtc: string): number {
  return Number(businessDateInKolkata(isoUtc).slice(0, 4));
}

export function daysBetween(checkIn: string, checkOut: string): number {
  const a = Date.parse(`${checkIn}T00:00:00Z`);
  const b = Date.parse(`${checkOut}T00:00:00Z`);
  const nights = Math.round((b - a) / 86_400_000);
  if (nights <= 0) throw new Error("Check-out must be after check-in");
  return nights;
}

export function dateInRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

export function startOfTodayKolkata(isoUtc: string): string {
  return businessDateInKolkata(isoUtc);
}

export function monthKey(businessDate: string): string {
  return businessDate.slice(0, 7);
}

export function yearKey(businessDate: string): string {
  return businessDate.slice(0, 4);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}
