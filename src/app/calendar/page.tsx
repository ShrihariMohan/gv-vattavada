"use client";
import { Screen } from "@/ui/Screen";
import { useApp } from "@/ui/AppProvider";
import { addDays, businessDateInKolkata } from "@/domain/dates";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export default function CalendarPage() {
  const { service } = useApp();
  const stay = service.state.businesses.find((b) => b.type === "STAY")!;
  const from = businessDateInKolkata(new Date().toISOString());
  const to = addDays(from, 6);
  const rows = service.calendar(stay.id, from, to);
  return (
    <Screen title={`${stay.name} calendar`} description="Occupancy across the next week.">
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
                <TableCell className="font-medium">{r.room.number}</TableCell>
                {r.days.map((d) => (
                  <TableCell key={d.date} className={cn(d.booking && "bg-primary text-primary-foreground")}>
                    {d.booking ? "■■" : ""}
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
