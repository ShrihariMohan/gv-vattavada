import type { Metadata } from "next";
import { PublicMenu } from "@/marketing/public-menu";
import { JsonLd } from "@/marketing/json-ld";
import { MENU_SEO, menuJsonLd, organizationJsonLd, publicMetadata, websiteJsonLd } from "@/marketing/seo";

export const metadata: Metadata = publicMetadata(MENU_SEO);

export default function MenuPage() {
  return (
    <>
      <JsonLd data={[organizationJsonLd(), websiteJsonLd(), menuJsonLd()]} />
      <PublicMenu />
    </>
  );
}
