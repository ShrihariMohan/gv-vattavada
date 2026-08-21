import { SitePage } from "@/marketing/site-page";
import { siteBySlug } from "@/marketing/sites";
import { publicMetadata, siteSeo } from "@/marketing/seo";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

const SLUG = "car-rental";

export const metadata: Metadata = publicMetadata(siteSeo(siteBySlug(SLUG)!));

export default function Page() {
  const site = siteBySlug(SLUG);
  if (!site) notFound();
  return <SitePage site={site} />;
}
