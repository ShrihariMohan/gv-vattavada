"use client";

import { Screen } from "@/ui/Screen";
import { Money } from "@/ui/Shell";
import { StatusBadge } from "@/ui/status-badge";
import { useApp } from "@/ui/AppProvider";
import { can } from "@/domain/rules";
import { paiseToRupees, rupeesToPaise } from "@/domain/money";
import type { Room, RoomStatus } from "@/domain/types";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const selectCls = "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm";
const STATUSES: RoomStatus[] = ["AVAILABLE", "RESERVED", "OCCUPIED", "CLEANING", "MAINTENANCE", "BLOCKED"];

export default function RoomsPage() {
  const { service, refresh, user } = useApp();
  const canEdit = user ? can(user.role, "bookings.manage") : false;
  const stays = service.state.businesses.filter((b) => b.type === "STAY");
  const [bizId, setBizId] = useState(stays[0]?.id ?? "");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const rooms = service.state.rooms.filter((r) => !r.deleted_at && (!bizId || r.business_id === bizId));
  const types = service.state.roomTypes.filter((t) => t.business_id === (editing?.business_id ?? bizId));
  const liveBooking = (roomId: string) =>
    service.state.bookings.find(
      (b) =>
        b.room_id === roomId &&
        !b.deleted_at &&
        (b.status === "ENQUIRY" || b.status === "RESERVED" || b.status === "CHECKED_IN"),
    );

  return (
    <Screen
      title="Rooms"
      description="Rooms belong to one property. Occupancy follows the live booking; use status for housekeeping."
      actions={
        canEdit ? (
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            Add room
          </Button>
        ) : null
      }
    >
      <select className={`${selectCls} mb-4 max-w-xs`} value={bizId} onChange={(e) => setBizId(e.target.value)}>
        {stays.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>No</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Capacity</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Guest</TableHead>
              {canEdit && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rooms.map((r) => {
              const stay = liveBooking(r.id);
              const guest = stay ? service.state.customers.find((c) => c.id === stay.customer_id) : null;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.number}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{r.capacity}</TableCell>
                  <TableCell>
                    <Money paise={r.base_price_paise} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={r.status} />
                  </TableCell>
                  <TableCell>
                    {stay ? (
                      <Link className="underline-offset-2 hover:underline" href={`/check?booking=${stay.id}`}>
                        {guest?.name ?? "Stay"} · {stay.status.replaceAll("_", " ").toLowerCase()}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  {canEdit && (
                    <TableCell className="space-x-1 text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditing(r);
                          setOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!!stay}
                        onClick={() => {
                          try {
                            service.deleteRoom(r.id);
                            toast.success("Room deleted");
                            refresh();
                          } catch (er) {
                            toast.error(er instanceof Error ? er.message : "Failed");
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      <RoomDialog
        key={`${open}-${editing?.id ?? "new"}-${bizId}`}
        open={open}
        onOpenChange={setOpen}
        room={editing}
        businessId={bizId}
        types={types}
        onSave={(data) => {
          try {
            if (editing) {
              service.updateRoom(editing.id, data);
              toast.success("Room updated", { description: "Queued for sync" });
            } else {
              service.createRoom({
                business_id: bizId,
                number: data.number!,
                name: data.name,
                capacity: data.capacity!,
                base_price_paise: data.base_price_paise!,
                room_type_id: data.room_type_id,
              });
              toast.success("Room added", { description: "Queued for sync" });
            }
            setOpen(false);
            refresh();
          } catch (er) {
            toast.error(er instanceof Error ? er.message : "Failed");
          }
        }}
      />
    </Screen>
  );
}

function RoomDialog({
  open,
  onOpenChange,
  room,
  businessId,
  types,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  room: Room | null;
  businessId: string;
  types: { id: string; name: string; base_price_paise: number; capacity: number }[];
  onSave: (data: {
    number?: string;
    name?: string;
    capacity?: number;
    base_price_paise?: number;
    room_type_id?: string;
    status?: RoomStatus;
  }) => void;
}) {
  const fallback = types[0];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{room ? "Edit room" : "New room"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            onSave({
              number: String(fd.get("number")).trim(),
              name: String(fd.get("name") ?? "").trim(),
              capacity: Number(fd.get("capacity")),
              base_price_paise: rupeesToPaise(Number(fd.get("rate_rupees"))),
              room_type_id: String(fd.get("room_type_id") || fallback?.id || ""),
              status: room ? (String(fd.get("status")) as RoomStatus) : undefined,
            });
          }}
        >
          <input type="hidden" name="business_id" value={room?.business_id ?? businessId} />
          <div className="grid gap-1">
            <Label>Number</Label>
            <Input name="number" required defaultValue={room?.number} />
          </div>
          <div className="grid gap-1">
            <Label>Name</Label>
            <Input name="name" defaultValue={room?.name} placeholder="Garden 101" />
          </div>
          {types.length > 0 && (
            <div className="grid gap-1">
              <Label>Type</Label>
              <select name="room_type_id" className={selectCls} defaultValue={room?.room_type_id ?? fallback?.id}>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid gap-2 md:grid-cols-2">
            <div className="grid gap-1">
              <Label>Capacity</Label>
              <Input name="capacity" type="number" min={1} defaultValue={room?.capacity ?? fallback?.capacity ?? 2} />
            </div>
            <div className="grid gap-1">
              <Label>Nightly rate (₹)</Label>
              <Input
                name="rate_rupees"
                type="number"
                min={0}
                step="0.01"
                defaultValue={paiseToRupees(room?.base_price_paise ?? fallback?.base_price_paise ?? 0)}
              />
            </div>
          </div>
          {room && (
            <div className="grid gap-1">
              <Label>Status</Label>
              <select name="status" className={selectCls} defaultValue={room.status}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}
          <DialogFooter>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
