"use client";

import { formatINR } from "@/domain/money";
import { formatKolkata } from "@/domain/dates";
import { can as canRole } from "@/domain/rules";
import { useApp } from "./AppProvider";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  LayoutDashboard,
  UtensilsCrossed,
  ClipboardList,
  Package,
  Armchair,
  Sunset,
  CalendarDays,
  BedDouble,
  DoorOpen,
  LogIn,
  Users,
  Wallet,
  BookOpen,
  CreditCard,
  FileText,
  Contact,
  BarChart3,
  Settings,
  Search,
  LogOut,
  Menu,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { isPublicChromePath } from "@/marketing/seo";
import { PUBLIC_SITES } from "@/marketing/sites";
import { BrandLogo, BrandMark } from "@/ui/brand";

const GROUPS: { title: string; items: { href: string; label: string; icon: typeof LayoutDashboard; permission?: Parameters<typeof canRole>[1] }[] }[] = [
  {
    title: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Restaurant",
    items: [
      { href: "/pos", label: "POS", icon: UtensilsCrossed, permission: "pos.use" },
      { href: "/orders", label: "Orders", icon: ClipboardList, permission: "pos.use" },
      { href: "/products", label: "Products", icon: Package, permission: "products.view" },
      { href: "/tables", label: "Tables", icon: Armchair, permission: "pos.use" },
      { href: "/closing", label: "Daily closing", icon: Sunset, permission: "day.close" },
    ],
  },
  {
    title: "Stays",
    items: [
      { href: "/calendar", label: "Calendar", icon: CalendarDays, permission: "bookings.manage" },
      { href: "/bookings", label: "Bookings", icon: BedDouble, permission: "bookings.manage" },
      { href: "/rooms", label: "Rooms", icon: DoorOpen, permission: "bookings.manage" },
      { href: "/check", label: "Check-in/out", icon: LogIn, permission: "bookings.manage" },
      { href: "/guests", label: "Guests", icon: Users, permission: "bookings.manage" },
    ],
  },
  {
    title: "Finance",
    items: [
      { href: "/expenses", label: "Expenses", icon: Wallet, permission: "expenses.manage" },
      { href: "/ledger", label: "Ledger", icon: BookOpen, permission: "reports.view" },
      { href: "/payments", label: "Payments", icon: CreditCard, permission: "sales.view" },
      { href: "/invoices", label: "Invoices", icon: FileText, permission: "invoices.view" },
      { href: "/customers", label: "Customers", icon: Contact, permission: "invoices.view" },
      { href: "/reports", label: "Reports", icon: BarChart3, permission: "analytics.financial" },
    ],
  },
  {
    title: "System",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

export function StaffFrame({ children }: { children: ReactNode }) {
  const path = usePathname();
  if (isPublicChromePath(path)) return children;
  return <Shell>{children}</Shell>;
}

export function Shell({ children }: { children: ReactNode }) {
  const { ready, user, service, logout } = useApp();
  const path = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  if (!ready) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 bg-[var(--pwa-background,#f3f7f8)] px-6">
        <BrandLogo height={72} className="max-h-[72px]" />
        <p className="text-sm text-muted-foreground">Loading local database…</p>
      </div>
    );
  }
  if (!user) return null;

  const ind = service.syncIndicator();
  const mins = ind.lastSyncedAt
    ? Math.max(0, Math.round((Date.now() - Date.parse(ind.lastSyncedAt)) / 60000))
    : null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background print:h-auto print:overflow-visible">
      <header className="no-print z-30 shrink-0 border-b bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-2.5">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold tracking-tight">
            <BrandMark size={32} className="size-8" />
            <span className="hidden sm:inline">Staff console</span>
          </Link>
          <Link href="/" className="hidden text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground lg:inline">
            Public sites
          </Link>
          <form
            className="relative ml-2 hidden flex-1 max-w-md md:block"
            onSubmit={(e) => {
              e.preventDefault();
              const q = new FormData(e.currentTarget).get("q");
              router.push(`/search?q=${encodeURIComponent(String(q ?? ""))}`);
            }}
          >
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-sidebar-foreground/60" />
            <Input
              name="q"
              placeholder="Invoice, phone, room, customer…"
              className="border-sidebar-border bg-sidebar-accent pl-8 text-sidebar-foreground placeholder:text-sidebar-foreground/50"
            />
          </form>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant={ind.online ? "secondary" : "destructive"} className="hidden sm:inline-flex">
              {ind.online ? "Online" : "Offline"}
            </Badge>
            <Badge variant="outline" className="hidden lg:inline-flex border-sidebar-border text-sidebar-foreground">
              {ind.pending ? `${ind.pending} pending` : "Synced"}
            </Badge>
            {!ind.online && mins != null && (
              <span className="hidden xl:inline text-xs text-sidebar-foreground/70">Last sync {mins}m ago</span>
            )}
            <Avatar className="size-8">
              <AvatarFallback className="bg-sidebar-accent text-xs">
                {user.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <Button variant="ghost" size="sm" className="text-sidebar-foreground" onClick={logout}>
              <LogOut />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto flex min-h-0 w-full max-w-[1500px] flex-1 print:block print:h-auto">
        <aside className="no-print hidden w-60 shrink-0 overflow-y-auto border-r bg-card/40 p-3 md:block">
          {GROUPS.map((g) => {
              const items = g.items.filter((n) => !n.permission || canRole(user.role, n.permission));
              if (!items.length) return null;
              return (
                <div key={g.title} className="mb-4">
                  <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {g.title}
                  </p>
                  <nav className="flex flex-col gap-0.5">
                    {items.map((n) => {
                      const Icon = n.icon;
                      const active = path === n.href || (n.href !== "/dashboard" && path.startsWith(n.href));
                      return (
                        <Link
                          key={n.href}
                          href={n.href}
                          className={cn(
                            "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                            active
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                          )}
                        >
                          <Icon className="size-4" />
                          {n.label}
                        </Link>
                      );
                    })}
                  </nav>
                </div>
              );
            })}
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto p-4 pb-24 print:overflow-visible print:p-0 md:p-6">{children}</main>
      </div>
      <nav className="no-print fixed bottom-0 left-0 right-0 z-20 grid grid-cols-4 border-t bg-card md:hidden">
        {[
          ["/dashboard", "Home", LayoutDashboard],
          ["/pos", "POS", UtensilsCrossed],
          ["/bookings", "Stay", BedDouble],
        ].map(([href, label, Icon]) => (
          <Link
            key={String(href)}
            href={String(href)}
            className={cn(
              "flex flex-col items-center gap-1 py-2 text-[11px]",
              path === href ? "text-primary font-medium" : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" />
            {String(label)}
          </Link>
        ))}
        <button
          type="button"
          className={cn(
            "flex flex-col items-center gap-1 py-2 text-[11px]",
            moreOpen ? "text-primary font-medium" : "text-muted-foreground",
          )}
          onClick={() => setMoreOpen(true)}
        >
          <Menu className="size-4" />
          More
        </button>
      </nav>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto pb-8 md:hidden">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <div className="grid gap-4 px-4 pb-4">
            {GROUPS.map((g) => {
              const items = g.items.filter((n) => !n.permission || canRole(user.role, n.permission));
              if (!items.length) return null;
              return (
                <div key={g.title}>
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{g.title}</p>
                  <nav className="grid grid-cols-2 gap-1">
                    {items.map((n) => {
                      const Icon = n.icon;
                      const active = path === n.href || (n.href !== "/dashboard" && path.startsWith(n.href));
                      return (
                        <Link
                          key={n.href}
                          href={n.href}
                          onClick={() => setMoreOpen(false)}
                          className={cn(
                            "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm",
                            active ? "bg-primary text-primary-foreground" : "bg-muted/60 text-foreground",
                          )}
                        >
                          <Icon className="size-4 shrink-0" />
                          {n.label}
                        </Link>
                      );
                    })}
                  </nav>
                </div>
              );
            })}
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Public sites</p>
              <nav className="grid grid-cols-2 gap-1">
                <Link
                  href="/"
                  onClick={() => setMoreOpen(false)}
                  className="flex items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-2 text-sm"
                >
                  <Globe className="size-4 shrink-0" />
                  Home
                </Link>
                {PUBLIC_SITES.map((s) => (
                  <Link
                    key={s.slug}
                    href={`/${s.slug}`}
                    onClick={() => setMoreOpen(false)}
                    className="flex items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-2 text-sm"
                  >
                    <Globe className="size-4 shrink-0" />
                    {s.name}
                  </Link>
                ))}
                <Link
                  href="/menu"
                  onClick={() => setMoreOpen(false)}
                  className="flex items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-2 text-sm"
                >
                  <UtensilsCrossed className="size-4 shrink-0" />
                  Kitchen menu
                </Link>
              </nav>
            </div>
          </div>
        </SheetContent>
      </Sheet>
      <Separator className="sr-only" />
    </div>
  );
}

export function Money({ paise }: { paise: number }) {
  return <span className="tabular-nums">{formatINR(paise)}</span>;
}

export function When({ iso }: { iso: string }) {
  return <span>{formatKolkata(iso)}</span>;
}
