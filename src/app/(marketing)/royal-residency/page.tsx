import { SitePage } from "@/marketing/site-page";
import { siteBySlug } from "@/marketing/sites";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

const SLUG = "royal-residency";

export const metadata: Metadata = {
  title: "Royal Residency · Vattavada",
  description: "Quiet rooms above the tea line. Photos and rates coming soon.",
};

export default function Page() {
  const site = siteBySlug(SLUG);
  if (!site) notFound();
  return <SitePage site={site} />;
}
