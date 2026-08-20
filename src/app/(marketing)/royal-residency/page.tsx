import { SitePage } from "@/marketing/site-page";
import { siteBySlug } from "@/marketing/sites";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

const SLUG = "royal-residency";

export const metadata: Metadata = {
  title: "G.V Royal Residency · Koviloor, Munnar",
  description: "Stay at Koviloor Bus Stand, Munnar. PIN 685505.",
};

export default function Page() {
  const site = siteBySlug(SLUG);
  if (!site) notFound();
  return <SitePage site={site} />;
}
