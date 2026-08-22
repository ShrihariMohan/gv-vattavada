"use client";
import { Screen } from "@/ui/Screen";
import { Money } from "@/ui/Shell";
import { useApp } from "@/ui/AppProvider";
import { csvEscape } from "@/domain/rules";
import { addDays, businessDateInKolkata } from "@/domain/dates";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const PRESETS = ["Today", "Yesterday", "This Week", "This Month", "Last Month", "This Year", "Custom"] as const;
type Preset = (typeof PRESETS)[number];

function mondayOf(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay();
  const back = day === 0 ? 6 : day - 1;
  return addDays(date, -back);
}

function lastMonthRange(today: string): [string, string] {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const prevM = m === 1 ? 12 : m - 1;
  const prevY = m === 1 ? y - 1 : y;
  const from = `${prevY}-${String(prevM).padStart(2, "0")}-01`;
  const thisMonthStart = `${today.slice(0, 7)}-01`;
  return [from, addDays(thisMonthStart, -1)];
}

function rangeFor(preset: Preset, today: string, customFrom: string, customTo: string): [string, string] {
  if (preset === "Today") return [today, today];
  if (preset === "Yesterday") {
    const y = addDays(today, -1);
    return [y, y];
  }
  if (preset === "This Week") return [mondayOf(today), today];
  if (preset === "This Month") return [`${today.slice(0, 7)}-01`, today];
  if (preset === "Last Month") return lastMonthRange(today);
  if (preset === "This Year") return [`${today.slice(0, 4)}-01-01`, today];
  return [customFrom, customTo];
}

export default function ReportsPage() {
  const { service, can } = useApp();
  const today = businessDateInKolkata(new Date().toISOString());
  const [preset, setPreset] = useState<Preset>("This Month");
  const [customFrom, setCustomFrom] = useState(`${today.slice(0, 7)}-01`);
  const [customTo, setCustomTo] = useState(today);
  const [biz, setBiz] = useState("all");
  const [from, to] = rangeFor(preset, today, customFrom, customTo);
  const a = service.analytics(from, to, biz === "all" ? undefined : biz);
  const rest = service.state.businesses.find((b) => b.type === "RESTAURANT");
  const stay = service.state.businesses.find((b) => b.type === "STAY");
  const ra = rest ? service.restaurantAnalytics(rest.id, from, to) : null;
  const sa = stay ? service.stayAnalytics(stay.id, from, to) : null;
  const bars = useMemo(
    () => Object.entries(a.byDate).map(([date, v]) => ({ date: date.slice(5), revenue: v / 100 })),
    [a],
  );
  if (!can("analytics.financial")) {
    return (
      <Screen title="Reports">
        <p>Financial analytics are not available for this role.</p>
      </Screen>
    );
  }
  return (
    <Screen
      title="Reports"
      actions={
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const csv = csvEscape([
                ["Metric", "Value"],
                ["Revenue", a.revenue / 100],
                ["Expenses", a.expenses / 100],
                ["Profit", a.profit / 100],
              ]);
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const el = document.createElement("a");
              el.href = url;
              el.download = "report.csv";
              el.click();
            }}
          >
            CSV
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            Print / PDF
          </Button>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button key={p} size="sm" variant={preset === p ? "default" : "outline"} onClick={() => setPreset(p)}>
            {p}
          </Button>
        ))}
        {preset === "Custom" && (
          <>
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-auto" />
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-auto" />
          </>
        )}
        <select value={biz} onChange={(e) => setBiz(e.target.value)} className="h-8 rounded-lg border border-input px-2 text-sm">
          <option value="all">All businesses</option>
          {service.state.businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        {from} → {to}
      </p>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Revenue" v={a.revenue} />
        <Stat label="Expenses" v={a.expenses} />
        <Stat label="Profit" v={a.profit} />
        <Stat label="Transactions" v={a.transactions * 100} hideMoney />
      </div>
      <Card className="mt-6">
        <CardContent className="h-56 pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bars}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="revenue" fill="var(--primary)" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      {ra && (
        <>
          <h2 className="mt-8 font-medium">Restaurant</h2>
          <p className="text-sm">
            Bills {ra.bills} · Avg <Money paise={ra.average_bill} /> · Tax <Money paise={ra.tax} /> · Discounts{" "}
            <Money paise={ra.discounts} /> · Cancelled {ra.cancelled}
          </p>
          <ol className="mt-2 list-decimal pl-5 text-sm">
            {ra.top_products.map((p) => (
              <li key={p.name}>
                {p.name} — {p.qty} sold
              </li>
            ))}
          </ol>
        </>
      )}
      {sa && (
        <>
          <h2 className="mt-8 font-medium">Stays</h2>
          <p className="text-sm">
            Occupancy {(sa.occupancy * 100).toFixed(0)}% · ADR <Money paise={sa.adr} /> · RevPAR <Money paise={sa.revpar} /> ·
            Avg stay {sa.average_stay.toFixed(1)} nights
          </p>
        </>
      )}
    </Screen>
  );
}

function Stat({ label, v, hideMoney }: { label: string; v: number; hideMoney?: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-xl">{hideMoney ? v / 100 : <Money paise={v} />}</CardTitle>
      </CardHeader>
    </Card>
  );
}
