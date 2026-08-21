import { cn } from "@/lib/utils";

/** Square mark with a white field — favicon, app icon, dark staff chrome. */
export const BRAND_MARK_SRC = "/logo.jpeg";
/** Transparent wordmark — receipts, login, and public sites on light backgrounds. */
export const BRAND_LOGO_SRC = "/logo-transparent.png";

const LOGO_ASPECT = 640 / 427;

export function BrandMark({
  size = 32,
  className,
  alt = "Cloudy Group",
}: {
  size?: number;
  className?: string;
  alt?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static public asset; keeps PWA/offline and bill capture simple
    <img
      src={BRAND_MARK_SRC}
      alt={alt}
      width={size}
      height={size}
      className={cn("shrink-0 rounded-lg bg-white object-cover", className)}
      style={{ width: size, height: size }}
    />
  );
}

export function BrandLogo({
  height = 40,
  className,
  alt = "Cloudy Group · Restaurants, stays, tents",
}: {
  height?: number;
  className?: string;
  alt?: string;
}) {
  const width = Math.round(height * LOGO_ASPECT);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static public asset; receipts share as PNG via html-to-image
    <img
      src={BRAND_LOGO_SRC}
      alt={alt}
      width={width}
      height={height}
      className={cn("w-auto shrink-0 object-contain object-center", className)}
      style={{ height, width: "auto", maxWidth: "100%" }}
    />
  );
}
