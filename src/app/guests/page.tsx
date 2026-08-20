"use client";

import { Screen } from "@/ui/Screen";
import { useApp } from "@/ui/AppProvider";
import { can } from "@/domain/rules";
import type { Customer } from "@/domain/types";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function GuestsPage() {
  const { service, refresh, user } = useApp();
  const canEdit = user ? can(user.role, "bookings.manage") : false;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("guest");
    if (id) setHighlight(id);
  }, []);

  const guests = service.state.customers.filter((c) => !c.deleted_at);
  const stayCount = (id: string) =>
    service.state.bookings.filter((b) => b.customer_id === id && !b.deleted_at).length;
  const activeStay = (id: string) =>
    service.state.bookings.some(
      (b) =>
        b.customer_id === id &&
        !b.deleted_at &&
        (b.status === "ENQUIRY" || b.status === "RESERVED" || b.status === "CHECKED_IN"),
    );

  return (
    <Screen
      title="Guests"
      description="Guests are shared across properties. Bookings, check-in, and invoices use this list."
      actions={
        canEdit ? (
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            Add guest
          </Button>
        ) : null
      }
    >
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Stays</TableHead>
              {canEdit && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {guests.map((c) => (
              <TableRow key={c.id} className={highlight === c.id ? "bg-muted/60" : undefined}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{c.phone || "—"}</TableCell>
                <TableCell>{c.email || "—"}</TableCell>
                <TableCell className="max-w-48 truncate">{c.address || "—"}</TableCell>
                <TableCell>
                  <Link className="underline-offset-2 hover:underline" href={`/bookings?guest=${c.id}`}>
                    {stayCount(c.id)}
                  </Link>
                </TableCell>
                {canEdit && (
                  <TableCell className="space-x-1 text-right whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditing(c);
                        setOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={`/bookings?guest=${c.id}`}>
                      Bookings
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={activeStay(c.id)}
                      onClick={() => {
                        try {
                          service.deleteCustomer(c.id);
                          toast.success("Guest deleted");
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
            ))}
          </TableBody>
        </Table>
      </Card>
      <GuestDialog
        key={`${open}-${editing?.id ?? "new"}`}
        open={open}
        onOpenChange={setOpen}
        guest={editing}
        onSave={(data) => {
          try {
            if (editing) {
              service.updateCustomer(editing.id, data);
              toast.success("Guest updated", { description: "Queued for sync" });
            } else {
              service.createCustomer(data);
              toast.success("Guest added", { description: "Queued for sync" });
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

function GuestDialog({
  open,
  onOpenChange,
  guest,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  guest: Customer | null;
  onSave: (data: { name: string; phone: string; email?: string; address?: string; notes?: string }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{guest ? "Edit guest" : "New guest"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            onSave({
              name: String(fd.get("name")).trim(),
              phone: String(fd.get("phone")).trim(),
              email: String(fd.get("email") ?? ""),
              address: String(fd.get("address") ?? ""),
              notes: String(fd.get("notes") ?? ""),
            });
          }}
        >
          <div className="grid gap-1">
            <Label>Name</Label>
            <Input name="name" required defaultValue={guest?.name} />
          </div>
          <div className="grid gap-1">
            <Label>Phone</Label>
            <Input name="phone" required defaultValue={guest?.phone} />
          </div>
          <div className="grid gap-1">
            <Label>Email</Label>
            <Input name="email" type="email" defaultValue={guest?.email} />
          </div>
          <div className="grid gap-1">
            <Label>Address</Label>
            <Input name="address" defaultValue={guest?.address} />
          </div>
          <div className="grid gap-1">
            <Label>Notes</Label>
            <Input name="notes" defaultValue={guest?.notes} />
          </div>
          <DialogFooter>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
