import Link from "next/link";
import type { PublicSite } from "@/marketing/sites";
import { GlennGallery, SiteMediaCard } from "@/marketing/site-media";
import { telHref, waHref } from "@/marketing/media";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { JsonLd } from "@/marketing/json-ld";
import { organizationJsonLd, siteJsonLd, websiteJsonLd } from "@/marketing/seo";

const TONE: Record<PublicSite["tone"], string> = {
  royal: "[--site:var(--royal)]",
  glenn: "[--site:var(--glenn)]",
  kitchen: "[--site:var(--kitchen)]",
  rental: "[--site:var(--rental)]",
};

export function SitePage({ site }: { site: PublicSite }) {
  const rental = site.tone === "rental";
  const kitchen = site.tone === "kitchen";
  const glenn = site.tone === "glenn";
  const stills = site.gallery.filter((g) => g.kind === "image");
  const videos = site.gallery.filter((g) => g.kind === "video");

  return (
    <article className={cn("mx-auto max-w-6xl px-4 py-10 md:py-16", TONE[site.tone])}>
      <JsonLd data={[organizationJsonLd(), websiteJsonLd(), siteJsonLd(site)]} />
      <p className="text-xs font-medium uppercase tracking-[0.22em] text-[var(--site)]">{site.kicker}</p>
      {glenn ? (
        <>
          <div className="mt-6 grid gap-2 md:grid-cols-3">
            {stills.slice(0, 3).map((item) => (
              <SiteMediaCard key={item.src} item={item} priority />
            ))}
          </div>
          <h1 className="mt-10 max-w-3xl font-heading text-4xl leading-[1.05] tracking-tight md:text-6xl">{site.tagline}</h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">{site.description}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#enquire" className={buttonVariants({ size: "lg" })}>
              {site.heroCta}
            </a>
            <a href="#gallery" className={buttonVariants({ variant: "outline", size: "lg" })}>
              Open gallery
            </a>
          </div>
        </>
      ) : (
        <div className={cn("mt-6 grid items-end gap-10", rental || !site.hero ? "lg:grid-cols-[1fr]" : "lg:grid-cols-[1.1fr_0.9fr]")}>
          <div>
            <h1 className="font-heading text-4xl leading-[1.05] tracking-tight md:text-6xl">{site.tagline}</h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">{site.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={kitchen ? "/menu" : "#enquire"} className={buttonVariants({ size: "lg" })}>
                {site.heroCta}
              </a>
              <Link href="/" className={buttonVariants({ variant: "outline", size: "lg" })}>
                All properties
              </Link>
            </div>
          </div>
          {site.hero && <SiteMediaCard item={site.hero} priority className="min-h-64" />}
        </div>
      )}

      <section className="mt-16 grid gap-3 md:grid-cols-3">
        {site.highlights.map((h) => (
          <div key={h.title} className="rounded-2xl border bg-card p-5">
            <h2 className="font-heading text-lg">{h.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{h.body}</p>
          </div>
        ))}
      </section>

      {kitchen ? (
        <section className="mt-16">
          <h2 className="font-heading text-3xl">Menu</h2>
          <div className="mt-6 divide-y rounded-2xl border bg-card">
            {site.offerings.map((o) => (
              <div key={o.title} className="flex items-baseline justify-between gap-4 px-5 py-4">
                <div>
                  <p className="font-medium">{o.title}</p>
                  <p className="text-sm text-muted-foreground">{o.detail}</p>
                </div>
                <p className="tabular-nums text-sm">{o.price}</p>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="mt-16">
          <h2 className="font-heading text-3xl">{rental ? "Cars" : "Stay options"}</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {site.offerings.map((o, i) => (
              <div key={o.title} className="rounded-2xl border bg-card p-5">
                {stills[i + 1] && <SiteMediaCard item={stills[i + 1]} className="mb-4 min-h-36" />}
                <p className="font-medium">{o.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{o.detail}</p>
                <p className="mt-3 text-sm tabular-nums">{o.price}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {glenn ? (
        <GlennGallery items={site.gallery} />
      ) : (
        site.gallery.length > 0 && (
          <section className="mt-16" id="gallery">
            <h2 className="font-heading text-3xl">{rental ? "Fleet" : "Photos"}</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {stills.map((item) => (
                <SiteMediaCard key={item.src} item={item} />
              ))}
            </div>
            {videos.length > 0 && (
              <div className="mt-8 grid gap-4 md:grid-cols-2">
                {videos.map((item) => (
                  <SiteMediaCard key={item.src} item={item} />
                ))}
              </div>
            )}
          </section>
        )
      )}

      <section id="enquire" className="mt-16 grid gap-8 rounded-3xl bg-[var(--site)] px-6 py-10 text-white md:grid-cols-[1.2fr_0.8fr] md:px-10">
        <div>
          <h2 className="font-heading text-3xl">Say hello</h2>
          <p className="mt-3 max-w-md text-white/80">{site.location}</p>
          <p className="mt-1 text-white/80">{site.hours}</p>
          <ul className="mt-6 space-y-1 text-sm text-white/75">
            {site.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
        <div className="space-y-3 text-sm">
          <p>
            <span className="text-white/60">Phone / WhatsApp</span>
            <br />
            {site.phones.map((p) => (
              <span key={p} className="mt-1 block">
                <a className="underline-offset-2 hover:underline" href={telHref(p)}>
                  {p}
                </a>
                {" · "}
                <a className="underline-offset-2 hover:underline" href={waHref(p)} target="_blank" rel="noreferrer">
                  WhatsApp
                </a>
              </span>
            ))}
          </p>
          <p>
            <span className="text-white/60">Email</span>
            <br />
            {site.email}
          </p>
        </div>
      </section>
    </article>
  );
}
