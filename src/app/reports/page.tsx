"use client";
import { Screen } from "@/ui/Screen";
import { Money } from "@/ui/Shell";
import { useApp } from "@/ui/AppProvider";
import { csvEscape } from "@/domain/rules";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const PRESETS = ["Today", "Yesterday", "This Week", "This Month", "Last Month", "This Year", "Custom"] as const;

export default function ReportsPage() {
  const { service, user } = useApp();
  const [preset, setPreset] = useState<(typeof PRESETS)[number]>("This Month");
  const [from, setFrom] = useState("2026-08-01");
  const [to, setTo] = useState("2026-08-19");
  const [biz, setBiz] = useState("all");
  const a = service.analytics(from, to, biz === "all" ? undefined : biz);
  const rest = service.state.businesses.find((b) => b.type === "RESTAURANT")!;
  const stay = service.state.businesses.find((b) => b.type === "STAY")!;
  const ra = service.restaurantAnalytics(rest.id, from, to);
  const sa = service.stayAnalytics(stay.id, from, to);
  const bars = useMemo(
    () => Object.entries(a.byDate).map(([date, v]) => ({ date: date.slice(5), revenue: v / 100 })),
    [a],
  );
  if (user?.role === "STAFF") {
    return <Screen title="Reports"><p>Financial analytics are not available for staff.</p></Screen>;
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
          <Button variant="outline" onClick={() => window.print()}>Print / PDF</Button>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button key={p} size="sm" variant={preset === p ? "default" : "outline"} onClick={() => setPreset(p)}>{p}</Button>
        ))}
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
        <select value={biz} onChange={(e) => setBiz(e.target.value)} className="h-8 rounded-lg border border-input px-2 text-sm">
          <option value="all">All businesses</option>
          {service.state.businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
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
      <h2 className="mt-8 font-medium">Restaurant</h2>
      <p className="text-sm">Bills {ra.bills} · Avg <Money paise={ra.average_bill} /> · Tax <Money paise={ra.tax} /> · Discounts <Money paise={ra.discounts} /> · Cancelled {ra.cancelled}</p>
      <ol className="mt-2 list-decimal pl-5 text-sm">
        {ra.top_products.map((p) => <li key={p.name}>{p.name} — {p.qty} sold</li>)}
      </ol>
      <h2 className="mt-8 font-medium">Stays</h2>
      <p className="text-sm">
        Occupancy {(sa.occupancy * 100).toFixed(0)}% · ADR <Money paise={sa.adr} /> · RevPAR <Money paise={sa.revpar} /> · Avg stay {sa.average_stay.toFixed(1)} nights
      </p>
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
