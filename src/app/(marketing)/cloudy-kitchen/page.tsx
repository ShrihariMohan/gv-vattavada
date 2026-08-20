import { SitePage } from "@/marketing/site-page";
import { siteBySlug } from "@/marketing/sites";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

const SLUG = "cloudy-kitchen";

export const metadata: Metadata = {
  title: "G.V Cloudy Kitchen · Urkadu, Vattavada",
  description: "Indian, Arabic and Chinese meals in Urkadu, Vattavada, Munnar. PIN 685505.",
};

export default function Page() {
  const site = siteBySlug(SLUG);
  if (!site) notFound();
  return <SitePage site={site} />;
}
