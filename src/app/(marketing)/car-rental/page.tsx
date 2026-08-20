import { SitePage } from "@/marketing/site-page";
import { siteBySlug } from "@/marketing/sites";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

const SLUG = "car-rental";

export const metadata: Metadata = {
  title: "Cloudy Drives · Car rental",
  description: "Cars for the hill roads. Fleet photos and tariffs coming soon.",
};

export default function Page() {
  const site = siteBySlug(SLUG);
  if (!site) notFound();
  return <SitePage site={site} />;
}
