"use client";
import { Screen } from "@/ui/Screen";
import { useApp } from "@/ui/AppProvider";
import { MemorySupabaseAdapter } from "@/domain/service";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function SettingsPage() {
  const { service, refresh, user } = useApp();
  const adapter = useRef(new MemorySupabaseAdapter());
  return (
    <Screen title="Settings">
      <div className="grid max-w-xl gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Device</CardTitle>
            <CardDescription>Every offline write is tagged with this id.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="font-mono">{service.state.currentDeviceId}</p>
            <p className="mt-1 text-muted-foreground">{user?.name} · {user?.role}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sync</CardTitle>
            <CardDescription>{service.pendingCount()} change(s) waiting.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => {
                service.setOnline(true);
                const r = service.processSyncQueue(adapter.current);
                toast.success(`${r.filter((x) => x.ok).length} synced`);
                refresh();
              }}
            >
              Sync now
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Businesses</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <ul className="space-y-1">
              {service.state.businesses.map((b) => (
                <li key={b.id}>{b.code} · {b.name} · {b.type}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
            <CardDescription>Passwords are hashed, never stored in plaintext.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {service.state.users.map((u) => (
              <p key={u.id}>{u.username} · {u.role}</p>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Conflicts</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {service.state.conflicts.length === 0 && <p className="text-muted-foreground">None</p>}
            {service.state.conflicts.map((c) => (
              <div key={c.id} className="mt-2 border-t pt-2">
                {c.entity_type} {c.resolved ? "resolved" : "This record was modified on another device."}
                {!c.resolved && user?.role === "ADMIN" && (
                  <Button size="sm" variant="outline" className="ml-2" onClick={() => { service.resolveConflict(c.id, "local"); refresh(); }}>
                    Keep local
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">PWA: use Install / Add to Home Screen. Background sync is not guaranteed after the app is fully closed.</p>
      </div>
    </Screen>
  );
}
