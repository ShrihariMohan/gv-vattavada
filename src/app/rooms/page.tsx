"use client";
import { Screen } from "@/ui/Screen";
import { Money } from "@/ui/Shell";
import { StatusBadge } from "@/ui/status-badge";
import { useApp } from "@/ui/AppProvider";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function RoomsPage() {
  const { service } = useApp();
  return (
    <Screen title="Rooms">
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>No</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Property</TableHead>
              <TableHead>Capacity</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {service.state.rooms.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.number}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell>{service.state.businesses.find((b) => b.id === r.business_id)?.name}</TableCell>
                <TableCell>{r.capacity}</TableCell>
                <TableCell><Money paise={r.base_price_paise} /></TableCell>
                <TableCell><StatusBadge value={r.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </Screen>
  );
}
