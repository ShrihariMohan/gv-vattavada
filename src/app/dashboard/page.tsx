"use client";

import { Screen } from "@/ui/Screen";
import { Money } from "@/ui/Shell";
import { useApp } from "@/ui/AppProvider";
import { can } from "@/domain/rules";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";
import { useArchiveReminder, useServerDashboard } from "@/ui/use-server-dashboard";

export default function DashboardPage() {
  const { service, user } = useApp();
  const local = service.dashboard();
  const server = useServerDashboard();
  const reminder = useArchiveReminder();
  // Server SQL figures (when enabled) replace the local totals; the business list stays local.
  const d = server
    ? {
        ...local,
        today: server.today,
        month: server.month,
        restaurant: server.restaurant,
        stay: server.stay,
        byBusiness: local.byBusiness.map((b) => {
          const s = server.by_business.find((x) => x.business_id === b.business.id);
          return s ? { ...b, today: s.today, month: s.month, year: s.year, profit: s.profit } : b;
        }),
      }
    : local;
  const notes = service.notifications();
  const showMoney = user && can(user.role, "analytics.financial");
  const chart = d.byBusiness.map((b) => ({
    name: b.business.name.replace(" Resort", "").replace(" Residency", ""),
    today: b.today / 100,
    month: b.month / 100,
  }));

  return (
    <Screen
      title="How are all my businesses performing?"
      description={server ? "Totals from the cloud database (SQL reports)." : "Local figures update instantly. Sync status is in the header."}
    >
      {user?.role === "ADMIN" && reminder && (reminder.pending.length > 0 || (reminder.level && reminder.level !== "ok")) && (
        <Alert className="mb-4 border-destructive">
          <AlertDescription>
            {reminder.pending.length > 0 && <>Monthly archive due for {reminder.pending.join(", ")}. </>}
            {reminder.level === "warn" && <>Cloud database is over 300 MB. </>}
            {reminder.level === "alert" && <>Cloud database is over 400 MB — archive now. </>}
            <Link href="/settings" className="underline">Open Settings → Data migration &amp; archive</Link>
          </AlertDescription>
        </Alert>
      )}
      {showMoney ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Today's revenue" value={<Money paise={d.today} />} />
          <Stat label="This month" value={<Money paise={d.month} />} />
          <Stat label="Restaurant" value={<Money paise={d.restaurant} />} />
          <Stat label="Stay revenue" value={<Money paise={d.stay} />} />
        </div>
      ) : (
        <Alert>
          <AlertDescription>Financial analytics are hidden for staff. Use POS to bill tables.</AlertDescription>
        </Alert>
      )}
      {showMoney && (
        <>
          <Card className="mt-6 py-0">
            <CardHeader className="py-4">
              <CardTitle>Business comparison</CardTitle>
              <CardDescription>Revenue vs profit for the seeded period.</CardDescription>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Today</TableHead>
                  <TableHead>This month</TableHead>
                  <TableHead>This year</TableHead>
                  <TableHead>Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.byBusiness.map((b) => (
                  <TableRow key={b.business.id}>
                    <TableCell className="font-medium">{b.business.name}</TableCell>
                    <TableCell><Money paise={b.today} /></TableCell>
                    <TableCell><Money paise={b.month} /></TableCell>
                    <TableCell><Money paise={b.year} /></TableCell>
                    <TableCell><Money paise={b.profit} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Revenue mix</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="today" fill="var(--primary)" />
                  <Bar dataKey="month" fill="var(--chart-2)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <Stat label="Today's checkout" value={notes.checkouts.length} />
        <Stat label="Pending payments" value={notes.pendingPayments.length} />
        <Stat label="Unsynced transactions" value={notes.unsynced} />
      </div>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
