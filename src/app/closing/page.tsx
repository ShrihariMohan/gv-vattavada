"use client";

import { Screen } from "@/ui/Screen";
import { Money } from "@/ui/Shell";
import { useApp } from "@/ui/AppProvider";
import { rupeesToPaise } from "@/domain/money";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { DailyClosing } from "@/domain/types";

export default function ClosingPage() {
  const { service, refresh } = useApp();
  const restaurant = service.state.businesses.find((b) => b.type === "RESTAURANT")!;
  const [cashRupees, setCashRupees] = useState("0");
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<DailyClosing | null>(null);
  const [editRupees, setEditRupees] = useState("0");
  const rows = service.state.dailyClosings.filter((c) => c.business_id === restaurant.id).slice().reverse();

  return (
    <Screen title="Daily closing" description="Count the till. Close locks new bills. Re-open the day to take more sales without deleting the closing history.">
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Close today</CardTitle>
            <CardDescription>Enter actual cash in the drawer.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cash">Actual cash (₹)</Label>
              <Input id="cash" type="number" step="0.01" value={cashRupees} onChange={(e) => setCashRupees(e.target.value)} />
            </div>
            <Button
              onClick={() => {
                try {
                  service.closeDay(restaurant.id, rupeesToPaise(Number(cashRupees)));
                  setErr("");
                  toast.success("Day closed", { description: "Saved locally · sync pending if offline" });
                  refresh();
                } catch (e) {
                  setErr(e instanceof Error ? e.message : "Failed");
                }
              }}
            >
              Close day
            </Button>
            {err && (
              <Alert variant="destructive">
                <AlertDescription>{err}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Cash / UPI / Card</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Actual</TableHead>
                <TableHead>Diff</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.business_date}</TableCell>
                  <TableCell className="text-xs">
                    <Money paise={c.cash_sales_paise} /> / <Money paise={c.upi_sales_paise} /> / <Money paise={c.card_sales_paise} />
                  </TableCell>
                  <TableCell>
                    <Money paise={c.expected_cash_paise} />
                  </TableCell>
                  <TableCell>
                    <Money paise={c.actual_cash_paise} />
                  </TableCell>
                  <TableCell>
                    <Money paise={c.difference_paise} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={(c.status ?? "CLOSED") === "REOPENED" ? "secondary" : "default"}>
                      {c.status ?? "CLOSED"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {(c.status ?? "CLOSED") === "CLOSED" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            try {
                              service.reopenDay(c.id, "Manager reopened the day");
                              toast.success("Day reopened", { description: "New bills are allowed again" });
                              refresh();
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Re-open failed");
                            }
                          }}
                        >
                          Re-open day
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEdit(c);
                          setEditRupees(String(c.actual_cash_paise / 100));
                        }}
                      >
                        Edit
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Correct closing cash</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label>Actual cash (₹)</Label>
            <Input type="number" step="0.01" value={editRupees} onChange={(e) => setEditRupees(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!edit) return;
                try {
                  service.updateDailyClosing(edit.id, rupeesToPaise(Number(editRupees)));
                  toast.success("Closing updated", { description: "Correction queued for sync" });
                  refresh();
                  setEdit(null);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Update failed");
                }
              }}
            >
              Save correction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Screen>
  );
}
