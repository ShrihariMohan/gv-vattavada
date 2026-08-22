import { cn } from "@/lib/utils";
import type { SiteMedia } from "@/marketing/media";

export function SiteMediaCard({
  item,
  className,
  priority = false,
}: {
  item: SiteMedia;
  className?: string;
  priority?: boolean;
}) {
  return (
    <figure className={cn("overflow-hidden rounded-2xl bg-muted ring-1 ring-foreground/8", className)}>
      {item.kind === "video" ? (
        <video
          className="aspect-[4/3] h-full w-full object-cover"
          controls
          preload="metadata"
          playsInline
          muted={item.src.includes("guru-travels")}
          autoPlay={item.src.includes("guru-travels")}
          loop={item.src.includes("guru-travels")}
          aria-label={item.alt}
        >
          <source src={item.src} type="video/mp4" />
        </video>
      ) : (
        // Public folder URLs; native img keeps PWA cache simple.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.src}
          alt={item.alt}
          className="aspect-[4/3] h-full w-full object-cover"
          loading={priority ? "eager" : "lazy"}
          decoding="async"
        />
      )}
      <figcaption className="px-3 py-2 text-xs text-muted-foreground">{item.label}</figcaption>
    </figure>
  );
}

export function GlennGallery({ items }: { items: SiteMedia[] }) {
  const stills = items.filter((i) => i.kind === "image");
  const videos = items.filter((i) => i.kind === "video");
  return (
    <section className="mt-16" id="gallery">
      <h2 className="font-heading text-3xl">Gallery</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Cottages, interiors, and the hillside at G.V Cloudy Glenn. Drop more files in{" "}
        <code className="text-foreground">public/gv-cloudy-glenn</code> and list them in{" "}
        <code className="text-foreground">src/marketing/media.ts</code>.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {stills.map((item, i) => (
          <SiteMediaCard
            key={item.src}
            item={item}
            priority={i < 3}
            className={i === 0 ? "sm:col-span-2 md:row-span-2" : undefined}
          />
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
  );
}
