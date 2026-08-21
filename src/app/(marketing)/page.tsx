import Link from "next/link";
import { PUBLIC_SITES } from "@/marketing/sites";
import { SiteMediaCard } from "@/marketing/site-media";
import { buttonVariants } from "@/components/ui/button";
import { BrandLogo } from "@/ui/brand";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 md:py-20">
      <BrandLogo height={64} className="mb-8 max-h-16" />
      <p className="text-xs font-medium uppercase tracking-[0.22em] text-primary">Vattavada · Munnar · PIN 685505</p>
      <h1 className="mt-4 max-w-3xl font-heading text-5xl leading-[1.02] tracking-tight md:text-7xl">
        Four addresses.
        <br />
        One highland group.
      </h1>
      <p className="mt-6 max-w-xl text-lg text-muted-foreground">
        G.V Royal Residency at Koviloor, G.V Cloudy Glenn on the Vattavada hillside, G.V Cloudy Kitchen at Urkadu, and Cloudy Drives for the hill roads.
      </p>
      <div className="mt-14 grid gap-5 md:grid-cols-2">
        {PUBLIC_SITES.map((s) => (
          <Link key={s.slug} href={`/${s.slug}`} className="group rounded-3xl border bg-card p-2 transition hover:ring-2 hover:ring-primary/30">
            {s.hero ? (
              <SiteMediaCard item={s.hero} className="min-h-52" />
            ) : (
              <div className="flex min-h-52 items-end rounded-2xl bg-muted p-4 text-sm text-muted-foreground">Fleet photos coming soon</div>
            )}
            <div className="px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{s.kicker}</p>
              <p className="mt-1 font-heading text-2xl group-hover:text-primary">{s.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.location}</p>
            </div>
          </Link>
        ))}
      </div>
      <p className="mt-12 text-sm text-muted-foreground">
        Operations staff:{" "}
        <Link href="/login" className={buttonVariants({ variant: "link" })}>
          sign in to the console
        </Link>
      </p>
    </div>
  );
}
