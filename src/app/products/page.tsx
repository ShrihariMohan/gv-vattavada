"use client";

import { Screen } from "@/ui/Screen";
import { Money } from "@/ui/Shell";
import { useApp } from "@/ui/AppProvider";
import { can } from "@/domain/rules";
import { rupeesToPaise } from "@/domain/money";
import { useState } from "react";
import type { Product } from "@/domain/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function ProductsPage() {
  const { service, refresh, user } = useApp();
  const canEdit = user ? can(user.role, "products.edit") : false;
  const restaurant = service.state.businesses.find((b) => b.type === "RESTAURANT")!;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  return (
    <Screen
      title="Products"
      description="Menu items used by POS. Open tickets keep the price captured at add-time."
      actions={
        canEdit ? (
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            Add product
          </Button>
        ) : null
      }
    >
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Tax</TableHead>
              <TableHead>Status</TableHead>
              {canEdit && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {service.state.products.map((p) => {
              const cat = service.state.productCategories.find((c) => c.id === p.category_id);
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{cat?.name}</TableCell>
                  <TableCell>{p.sku}</TableCell>
                  <TableCell>
                    <Money paise={p.price_paise} />
                  </TableCell>
                  <TableCell>{p.tax_bps / 100}%</TableCell>
                  <TableCell>
                    <Badge variant={p.active ? "secondary" : "outline"}>{p.active ? "Active" : "Hidden"}</Badge>
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditing(p);
                          setOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      <ProductDialog
        open={open}
        onOpenChange={setOpen}
        product={editing}
        categories={service.state.productCategories.filter((c) => c.business_id === restaurant.id)}
        onSave={(data) => {
          try {
            if (editing) {
              service.updateProduct(editing.id, data);
              toast.success("Product updated", { description: "Queued for sync" });
            } else {
              service.createProduct({ business_id: restaurant.id, ...data, price_paise: data.price_paise!, tax_bps: data.tax_bps!, name: data.name!, category_id: data.category_id! });
              toast.success("Product added", { description: "Queued for sync" });
            }
            refresh();
            setOpen(false);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Save failed");
          }
        }}
      />
    </Screen>
  );
}

function ProductDialog({
  open,
  onOpenChange,
  product,
  categories,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  product: Product | null;
  categories: { id: string; name: string }[];
  onSave: (data: Partial<Product> & { name?: string; price_paise?: number; tax_bps?: number; category_id?: string }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{product ? "Edit product" : "Add product"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            onSave({
              name: String(fd.get("name")),
              category_id: String(fd.get("category_id")),
              sku: String(fd.get("sku")),
              unit: String(fd.get("unit") || "pc"),
              price_paise: rupeesToPaise(Number(fd.get("rupees"))),
              tax_bps: Math.round(Number(fd.get("tax_pct")) * 100),
              active: fd.get("active") === "on",
            });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required defaultValue={product?.name} />
          </div>
          <div className="grid gap-1.5">
            <Label>Category</Label>
            <select name="category_id" className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm" defaultValue={product?.category_id ?? categories[0]?.id}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="rupees">Price (₹)</Label>
              <Input id="rupees" name="rupees" type="number" step="0.01" min={0} required defaultValue={product ? product.price_paise / 100 : 0} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tax_pct">Tax %</Label>
              <Input id="tax_pct" name="tax_pct" type="number" step="0.01" min={0} defaultValue={product ? product.tax_bps / 100 : 5} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" name="sku" defaultValue={product?.sku} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="unit">Unit</Label>
              <Input id="unit" name="unit" defaultValue={product?.unit ?? "pc"} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={product?.active ?? true} className="size-4 accent-primary" />
            Active on POS
          </label>
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
