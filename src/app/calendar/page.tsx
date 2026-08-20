"use client";
import { Screen } from "@/ui/Screen";
import { useApp } from "@/ui/AppProvider";
import { addDays, businessDateInKolkata } from "@/domain/dates";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useState } from "react";
import Link from "next/link";

export default function CalendarPage() {
  const { service } = useApp();
  const stays = service.state.businesses.filter((b) => b.type === "STAY");
  const [bizId, setBizId] = useState(stays[0]?.id ?? "");
  const stay = stays.find((b) => b.id === bizId) ?? stays[0];
  const from = businessDateInKolkata(new Date().toISOString());
  const to = addDays(from, 6);
  const rows = stay ? service.calendar(stay.id, from, to) : [];
  return (
    <Screen title={`${stay?.name ?? "Stay"} calendar`} description="Occupancy across the next week. Open a filled cell to check in.">
      <select
        className="mb-4 h-8 max-w-xs rounded-lg border border-input bg-background px-2.5 text-sm"
        value={bizId}
        onChange={(e) => setBizId(e.target.value)}
      >
        {stays.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <Card className="overflow-auto py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Room</TableHead>
              {rows[0]?.days.map((d) => (
                <TableHead key={d.date}>{d.date.slice(5)}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.room.id}>
                <TableCell className="font-medium">
                  <Link className="underline-offset-2 hover:underline" href="/rooms">
                    {r.room.number}
                  </Link>
                </TableCell>
                {r.days.map((d) => (
                  <TableCell key={d.date} className={cn(d.booking && "bg-primary text-primary-foreground")}>
                    {d.booking ? (
                      <Link href={`/check?booking=${d.booking.id}`} className="block text-center">
                        ■■
                      </Link>
                    ) : (
                      ""
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </Screen>
  );
}
