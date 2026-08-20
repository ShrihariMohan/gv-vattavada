"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "@/ui/AppProvider";
import { productMatchesQuery, productMatchesSelectedTag, publicMenuItems } from "@/marketing/menu";
import { TagFilter } from "@/ui/tag-filter";
import { SITE_CONTACTS, telHref, waHref } from "@/marketing/media";
import { formatINR } from "@/domain/money";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PublicMenu() {
  const { ready, service } = useApp();
  const kitchen = SITE_CONTACTS.kitchen;
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const restaurant = service.state.businesses.find((b) => b.type === "RESTAURANT");
  const categories = service.state.productCategories.filter((c) => c.business_id === restaurant?.id);
  const items = useMemo(() => {
    if (!restaurant) return [];
    return publicMenuItems(service.state.products, restaurant.id).filter((p) => {
      if (!productMatchesSelectedTag(p, tag)) return false;
      return productMatchesQuery(p, query);
    });
  }, [service.state.products, restaurant, query, tag]);

  const grouped = categories
    .map((c) => ({ cat: c, rows: items.filter((p) => p.category_id === c.id) }))
    .filter((g) => g.rows.length > 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:py-16">
      <p className="text-xs font-medium uppercase tracking-[0.22em] text-[var(--kitchen)]">G.V Cloudy Kitchen</p>
      <h1 className="mt-3 font-heading text-4xl tracking-tight md:text-6xl">Menu</h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">
        Indian, Arabic and Chinese plates in Urkadu, Vattavada. Hidden items from the staff product list do not appear here.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{kitchen.address}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        {kitchen.phones.map((p) => (
          <a key={p} href={telHref(p)} className={buttonVariants({ variant: "outline" })}>
            {p}
          </a>
        ))}
        <a href={waHref(kitchen.phones[0])} className={buttonVariants()} target="_blank" rel="noreferrer">
          WhatsApp
        </a>
        <Link href="/cloudy-kitchen" className={buttonVariants({ variant: "ghost" })}>
          Kitchen page
        </Link>
      </div>

      <div className="mt-8">
        <Input
          placeholder="Search breakfast, lunch, dinner, chinese, meals…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="mt-3">
          <TagFilter selected={tag} onChange={setTag} />
        </div>
      </div>

      {!ready && <p className="mt-10 text-muted-foreground">Loading menu…</p>}
      {ready && grouped.length === 0 && <p className="mt-10 text-muted-foreground">No dishes match that search.</p>}
      {grouped.map(({ cat, rows }) => (
        <section key={cat.id} className="mt-14">
          <h2 className="font-heading text-3xl">{cat.name}</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((item) => (
              <article key={item.id} className="overflow-hidden rounded-2xl border bg-card">
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image_url} alt={item.name} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                ) : null}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-medium leading-tight">{item.name}</h3>
                    <p className="shrink-0 tabular-nums text-sm font-semibold">{formatINR(item.price_paise)}</p>
                  </div>
                  {item.description ? <p className="mt-1 text-sm text-muted-foreground">{item.description}</p> : null}
                  {item.tags?.length ? (
                    <p className="mt-2 text-[11px] capitalize text-muted-foreground">{item.tags.slice(0, 5).join(" · ")}</p>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
      <p className="mt-16 text-xs text-muted-foreground">
        Food photos are stock images (Unsplash). Uncheck Active on the Products page to hide a dish from this menu and from POS.
      </p>
    </div>
  );
}
