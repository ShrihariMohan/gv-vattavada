import { SitePage } from "@/marketing/site-page";
import { siteBySlug } from "@/marketing/sites";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

const SLUG = "cloudy-kitchen";

export const metadata: Metadata = {
  title: "Cloudy Kitchen · Vattavada",
  description: "Highland plates, kettle always on. Menu photos coming soon.",
};

export default function Page() {
  const site = siteBySlug(SLUG);
  if (!site) notFound();
  return <SitePage site={site} />;
}
