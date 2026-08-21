import Link from "next/link";
import { PUBLIC_SITES } from "@/marketing/sites";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BrandLogo, BrandMark } from "@/ui/brand";

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-foreground/8 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5">
        <Link href="/" className="flex min-w-0 items-center gap-2 font-heading text-sm font-semibold tracking-tight">
          <BrandMark size={28} className="size-7 rounded-md" />
          <span className="truncate">Cloudy Group</span>
        </Link>
        <nav className="ml-auto hidden items-center gap-5 text-sm text-muted-foreground md:flex">
          <Link href="/menu" className="hover:text-foreground">
            Menu
          </Link>
          {PUBLIC_SITES.map((s) => (
            <Link key={s.slug} href={`/${s.slug}`} className="hover:text-foreground">
              {s.name}
            </Link>
          ))}
        </nav>
        <Link href="/login" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "ml-auto md:ml-2")}>
          Staff
        </Link>
      </div>
      <nav className="flex gap-3 overflow-x-auto border-t px-4 py-2 text-xs text-muted-foreground md:hidden">
        <Link href="/menu" className="whitespace-nowrap">
          Menu
        </Link>
        {PUBLIC_SITES.map((s) => (
          <Link key={s.slug} href={`/${s.slug}`} className="whitespace-nowrap">
            {s.name}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="mt-24 border-t">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground">
        <div className="flex min-w-0 items-center gap-3">
          <BrandLogo height={36} className="max-h-9 opacity-90" />
          <p>Vattavada · Munnar · Idukki · PIN 685505</p>
        </div>
        <p>G.V Royal Residency · G.V Cloudy Glenn · G.V Cloudy Kitchen · Cloudy Drives</p>
      </div>
    </footer>
  );
}
