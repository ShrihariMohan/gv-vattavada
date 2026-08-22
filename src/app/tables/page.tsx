"use client";

import { Screen } from "@/ui/Screen";
import { Money } from "@/ui/Shell";
import { useApp } from "@/ui/AppProvider";
import { can } from "@/domain/rules";
import type { RestaurantTable, TableStatus } from "@/domain/types";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Armchair, MoreHorizontal, Pencil, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUSES: TableStatus[] = ["AVAILABLE", "RESERVED"];
type FloorFilter = "all" | "open" | "seated" | "held";

function tableKind(t: RestaurantTable): FloorFilter {
  if (t.current_order_id) return "seated";
  if (t.status === "RESERVED") return "held";
  return "open";
}

export default function TablesPage() {
  const { service, refresh, user } = useApp();
  const router = useRouter();
  const canEdit = user ? can(user.role, "products.edit") : false;
  const restaurant = service.state.businesses.find((b) => b.type === "RESTAURANT")!;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RestaurantTable | null>(null);
  const [filter, setFilter] = useState<FloorFilter>("all");
  const tables = service.state.tables.filter((t) => t.business_id === restaurant.id && !t.deleted_at);
  const counts = useMemo(() => {
    const seated = tables.filter((t) => tableKind(t) === "seated").length;
    const held = tables.filter((t) => tableKind(t) === "held").length;
    const free = tables.filter((t) => tableKind(t) === "open").length;
    return { seated, held, free };
  }, [tables]);
  const visible = tables.filter((t) => filter === "all" || tableKind(t) === filter);

  const startOn = (t: RestaurantTable) => {
    if (t.current_order_id) {
      router.push(`/pos?order=${t.current_order_id}`);
      return;
    }
    try {
      const o = service.startOrder({ business_id: restaurant.id, table_id: t.id });
      refresh();
      router.push(`/pos?order=${o.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open table");
    }
  };

  return (
    <Screen
      title="Floor"
      description="Tap a table to start or continue a bill. Occupied seats keep the live ticket."
      actions={
        canEdit ? (
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="size-4" />
            Add table
          </Button>
        ) : null
      }
    >
      <div className="mb-5 grid grid-cols-3 gap-2">
        <Summary label="Open" value={counts.free} tone="open" />
        <Summary label="Seated" value={counts.seated} tone="seated" />
        <Summary label="Held" value={counts.held} tone="held" />
      </div>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {(
          [
            ["all", "All"],
            ["open", "Open"],
            ["seated", "Seated"],
            ["held", "Held"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              filter === id ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed bg-card/60 px-6 py-16 text-center">
          <Armchair className="size-10 text-muted-foreground" />
          <p className="mt-3 font-heading text-lg">No tables here</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {tables.length === 0 ? "Add the first table for the dining room." : "Nothing matches this filter."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {visible.map((t) => {
            const kind = tableKind(t);
            const order = t.current_order_id
              ? service.state.orders.find((o) => o.id === t.current_order_id && !o.deleted_at)
              : null;
            const items = order ? service.state.orderItems.filter((i) => i.order_id === order.id && !i.deleted_at) : [];
            const total = order ? service.orderTotals(order.id).total_paise : 0;
            const itemCount = items.reduce((n, i) => n + i.qty, 0);
            return (
              <article
                key={t.id}
                className={cn(
                  "relative flex min-h-52 flex-col overflow-hidden rounded-3xl border bg-card p-4 shadow-sm transition hover:shadow-md",
                  kind === "seated" && "border-primary/40 bg-primary/6",
                  kind === "held" && "border-accent/50 bg-accent/15",
                  kind === "open" && "border-dashed",
                )}
              >
                {canEdit && (
                  <div className="absolute right-2 top-2 z-10">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className={cn(
                          "inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                        aria-label={`Edit ${t.name}`}
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditing(t);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="size-3.5" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={!!t.current_order_id}
                          onClick={() => {
                            try {
                              service.deleteTable(t.id);
                              toast.success("Table deleted");
                              refresh();
                            } catch (er) {
                              toast.error(er instanceof Error ? er.message : "Failed");
                            }
                          }}
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
                <button type="button" className="flex min-h-0 flex-1 flex-col text-left" onClick={() => startOn(t)}>
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "grid size-12 shrink-0 place-items-center rounded-2xl",
                        kind === "seated" && "bg-primary text-primary-foreground",
                        kind === "held" && "bg-accent text-accent-foreground",
                        kind === "open" && "bg-muted text-muted-foreground",
                      )}
                    >
                      {kind === "seated" ? <UtensilsCrossed className="size-5" /> : <Armchair className="size-5" />}
                    </span>
                    <div className="min-w-0 pr-8">
                      <p className="font-heading text-lg leading-tight tracking-tight">{t.name}</p>
                      <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        {kind === "seated" ? "Seated" : kind === "held" ? "Held" : "Open"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex-1">
                    {order ? (
                      <>
                        <p className="truncate text-sm font-medium">{order.guest_name || "Walk-in"}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {itemCount} {itemCount === 1 ? "item" : "items"}
                          {order.room_number ? ` · Rm ${order.room_number}` : ""}
                        </p>
                        <p className="mt-2 font-heading text-xl tabular-nums">
                          <Money paise={total} />
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">Tap to start a bill</p>
                    )}
                  </div>
                  <p className="mt-3 text-xs font-medium text-primary">
                    {order ? "Continue bill →" : "New order →"}
                  </p>
                </button>
              </article>
            );
          })}
        </div>
      )}
      <TableDialog
        key={`${open}-${editing?.id ?? "new"}`}
        open={open}
        onOpenChange={setOpen}
        table={editing}
        onSave={(data) => {
          try {
            if (editing) {
              service.updateTable(editing.id, data);
              toast.success("Table updated", { description: "Queued for sync" });
            } else {
              service.createTable({ business_id: restaurant.id, name: data.name! });
              toast.success("Table added", { description: "Queued for sync" });
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

function Summary({ label, value, tone }: { label: string; value: number; tone: FloorFilter }) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card px-3 py-3",
        tone === "seated" && "border-primary/30 bg-primary/6",
        tone === "held" && "border-accent/40 bg-accent/12",
      )}
    >
      <p className="font-heading text-2xl tabular-nums leading-none">{value}</p>
      <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function TableDialog({
  open,
  onOpenChange,
  table,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  table: RestaurantTable | null;
  onSave: (data: { name: string; status?: TableStatus }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{table ? "Edit table" : "Add table"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            onSave({
              name: String(fd.get("name") ?? ""),
              status: table ? (String(fd.get("status")) as TableStatus) : undefined,
            });
          }}
        >
          <div className="grid gap-1">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required placeholder="Table 6" defaultValue={table?.name ?? ""} />
          </div>
          {table && !table.current_order_id && (
            <div className="grid gap-1">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                name="status"
                defaultValue={table.status === "OCCUPIED" ? "AVAILABLE" : table.status}
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s === "AVAILABLE" ? "Open" : "Held"}
                  </option>
                ))}
              </select>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
