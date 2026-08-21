import type { MetadataRoute } from "next";
import { PUBLIC_PATHS, publicSiteUrl } from "@/marketing/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicSiteUrl();
  const now = new Date();
  return PUBLIC_PATHS.map((path) => ({
    url: path === "/" ? `${base}/` : `${base}${path}`,
    lastModified: now,
    changeFrequency: path === "/car-rental" || path === "/" ? "weekly" : "weekly",
    priority: path === "/" ? 1 : path === "/car-rental" ? 0.95 : path === "/cloudy-glenn" ? 0.9 : 0.85,
  }));
}
