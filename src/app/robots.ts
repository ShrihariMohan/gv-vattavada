import type { MetadataRoute } from "next";
import { publicSiteUrl, STAFF_ROBOTS_DISALLOW } from "@/marketing/seo";

export default function robots(): MetadataRoute.Robots {
  const base = publicSiteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: STAFF_ROBOTS_DISALLOW,
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
