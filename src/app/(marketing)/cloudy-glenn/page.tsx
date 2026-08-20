import { SitePage } from "@/marketing/site-page";
import { siteBySlug } from "@/marketing/sites";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

const SLUG = "cloudy-glenn";

export const metadata: Metadata = {
  title: "G.V Cloudy Glenn Resort · Vattavada",
  description: "A-frame cottages on the Vattavada hillside, Munnar. PIN 685505.",
};

export default function Page() {
  const site = siteBySlug(SLUG);
  if (!site) notFound();
  return <SitePage site={site} />;
}
