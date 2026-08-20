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
import { categoryIdForTags, parseProductTags, productMatchesQuery, productMatchesSelectedTag } from "@/marketing/menu";
import { TagFilter } from "@/ui/tag-filter";
import { toast } from "sonner";

export default function ProductsPage() {
  const { service, refresh, user } = useApp();
  const canEdit = user ? can(user.role, "products.edit") : false;
  const restaurant = service.state.businesses.find((b) => b.type === "RESTAURANT")!;
  const categories = service.state.productCategories.filter((c) => c.business_id === restaurant.id);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const rows = service.state.products.filter(
    (p) => p.business_id === restaurant.id && productMatchesSelectedTag(p, tag) && productMatchesQuery(p, query),
  );

  return (
    <Screen
      title="Products"
      description="Tag items for POS and the public menu. A dish can have several tags; filters pick one tag at a time."
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
      <div className="mb-4 grid gap-3">
        <Input placeholder="Search name or tag" value={query} onChange={(e) => setQuery(e.target.value)} />
        <TagFilter selected={tag} onChange={setTag} />
      </div>
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Tax</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Status</TableHead>
              {canEdit && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{p.sku}</TableCell>
                <TableCell>
                  <Money paise={p.price_paise} />
                </TableCell>
                <TableCell>{p.tax_bps / 100}%</TableCell>
                <TableCell className="max-w-48 text-xs capitalize text-muted-foreground">{(p.tags ?? []).join(", ") || "—"}</TableCell>
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
            ))}
          </TableBody>
        </Table>
      </Card>
      <ProductDialog
        key={`${open}-${editing?.id ?? "new"}`}
        open={open}
        onOpenChange={setOpen}
        product={editing}
        categories={categories}
        onSave={(data) => {
          try {
            if (editing) {
              service.updateProduct(editing.id, data);
              toast.success("Product updated", { description: "Queued for sync" });
            } else {
              service.createProduct({
                business_id: restaurant.id,
                ...data,
                price_paise: data.price_paise!,
                tax_bps: data.tax_bps!,
                name: data.name!,
                category_id: data.category_id!,
              });
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
            const tags = parseProductTags(String(fd.get("tags") || ""));
            onSave({
              name: String(fd.get("name")),
              category_id: categoryIdForTags(tags, categories),
              sku: String(fd.get("sku")),
              unit: String(fd.get("unit") || "pc"),
              description: String(fd.get("description") || ""),
              tags,
              price_paise: rupeesToPaise(Number(fd.get("rupees"))),
              tax_bps: Math.round(Number(fd.get("tax_pct")) * 100),
              active: fd.get("active") === "on",
            });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required defaultValue={product?.name ?? ""} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" defaultValue={product?.description ?? ""} placeholder="Short note" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tags">Tags</Label>
            <Input
              id="tags"
              name="tags"
              defaultValue={(product?.tags ?? []).join(", ")}
              placeholder="breakfast, dinner, curry, chicken"
            />
            <p className="text-xs text-muted-foreground">Comma-separated. Same tags as POS filters (breakfast, lunch, dinner, drinks, chinese, meals…).</p>
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
              <Input id="sku" name="sku" defaultValue={product?.sku ?? ""} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="unit">Unit</Label>
              <Input id="unit" name="unit" defaultValue={product?.unit ?? "pc"} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={product?.active ?? true} className="size-4 accent-primary" />
            Active on POS and public menu
          </label>
          <p className="text-xs text-muted-foreground">Turn this off to hide the dish from POS and from /menu.</p>
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
