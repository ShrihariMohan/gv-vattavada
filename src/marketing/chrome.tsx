import Link from "next/link";
import { PUBLIC_SITES } from "@/marketing/sites";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-foreground/8 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="font-heading text-sm font-semibold tracking-tight">
          Cloudy Group
        </Link>
        <nav className="ml-auto hidden items-center gap-5 text-sm text-muted-foreground md:flex">
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
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground">
        <p>Vattavada · Idukki · Kerala</p>
        <p>Public pages — photos and copy to be replaced.</p>
      </div>
    </footer>
  );
}
