import { SitePage } from "@/marketing/site-page";
import { siteBySlug } from "@/marketing/sites";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

const SLUG = "cloudy-glenn";

export const metadata: Metadata = {
  title: "Cloudy Glenn Resort · Vattavada",
  description: "A slower resort day in the clouds. Photos and rates coming soon.",
};

export default function Page() {
  const site = siteBySlug(SLUG);
  if (!site) notFound();
  return <SitePage site={site} />;
}
