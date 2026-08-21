import type { Metadata } from "next";
import type { PublicSite } from "@/marketing/sites";
import { SITE_CONTACTS } from "@/marketing/media";

export const BRAND = "Cloudy Group";
export const REGION = "Vattavada, Munnar, Idukki, Kerala 685505";

export function publicSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_URL?.replace(/\/$/, "");
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export function absoluteUrl(path: string): string {
  const base = publicSiteUrl();
  if (!path || path === "/") return `${base}/`;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export type PublicSeo = {
  path: string;
  title: string;
  description: string;
  ogImage: string;
  ogImageAlt: string;
};

export const HOME_SEO: PublicSeo = {
  path: "/",
  title: "Stay, Restaurant & Car Rental in Vattavada, Munnar | Cloudy Group",
  description:
    "Cloudy Group in Vattavada, Munnar (PIN 685505): G.V Cloudy Glenn cottages, G.V Royal Residency at Koviloor, G.V Cloudy Kitchen in Urkadu, and Cloudy Drives car rental — self-drive or with driver.",
  ogImage: "/logo.jpeg",
  ogImageAlt: "Cloudy Group — restaurants, stays, and tents in Vattavada",
};

export const MENU_SEO: PublicSeo = {
  path: "/menu",
  title: "Menu | G.V Cloudy Kitchen, Urkadu, Vattavada, Munnar",
  description:
    "Breakfast, lunch, dinner, Indian, Arabic and Chinese food at G.V Cloudy Kitchen, Urkadu, Vattavada, Munnar. PIN 685505. Open daily for stay guests and walk-ins.",
  ogImage: "/gv-cloudy-kitchen/gv-cloudy-3.jpeg",
  ogImageAlt: "G.V Cloudy Kitchen in Urkadu, Vattavada",
};

export function siteSeo(site: PublicSite): PublicSeo {
  const og = site.hero?.kind === "image" ? site.hero.src : "/logo.jpeg";
  const pages: Record<PublicSite["slug"], Omit<PublicSeo, "path" | "ogImage" | "ogImageAlt">> = {
    "royal-residency": {
      title: "Hotel Stay near Koviloor Bus Stand, Munnar | G.V Royal Residency",
      description:
        "G.V Royal Residency is a budget stay at Koviloor Bus Stand, Munnar — close to Vattavada viewpoints. Twin and single rooms, PIN 685505. Meals at G.V Cloudy Kitchen. Car rental via Cloudy Drives.",
    },
    "cloudy-glenn": {
      title: "Resort in Vattavada, Munnar | G.V Cloudy Glenn Cottages",
      description:
        "G.V Cloudy Glenn Resort in Vattavada, Munnar: A-frame hillside cottages with balconies, forest views, and family stays. PIN 685505. Kitchen in Urkadu. Car rental for Vattavada and Munnar roads.",
    },
    "cloudy-kitchen": {
      title: "Restaurant in Vattavada, Munnar | G.V Cloudy Kitchen, Urkadu",
      description:
        "G.V Cloudy Kitchen in Urkadu, Vattavada — Indian, Arabic and Chinese meals, breakfast through dinner, delivery in Vattavada. PIN 685505. Halal kitchen next to Cloudy Group stays.",
    },
    "car-rental": {
      title: "Car Rental in Vattavada, Munnar | Self Drive & With Driver | Cloudy Drives",
      description:
        "Car rental in Vattavada and Munnar: self-drive and chauffeur cars, local sightseeing, Kochi and Coimbatore airport pickup. Book with Cloudy Drives for G.V stays. PIN 685505.",
    },
  };
  const extra = pages[site.slug] ?? { title: `${site.name} | ${REGION}`, description: site.description };
  return {
    path: `/${site.slug}`,
    title: extra.title,
    description: extra.description,
    ogImage: og,
    ogImageAlt: site.hero?.alt ?? `${site.name}, ${REGION}`,
  };
}

export function publicMetadata(page: PublicSeo): Metadata {
  const url = absoluteUrl(page.path);
  const image = absoluteUrl(page.ogImage);
  return {
    title: page.title,
    description: page.description,
    applicationName: BRAND,
    authors: [{ name: BRAND }],
    creator: BRAND,
    publisher: BRAND,
    category: "travel",
    keywords: [
      "Vattavada",
      "Vattavada Munnar",
      "car rental Vattavada",
      "car rental Munnar",
      "self drive Munnar",
      "taxi Vattavada",
      "resort Vattavada",
      "hotel Munnar Koviloor",
      "restaurant Vattavada",
      "G.V Cloudy Glenn",
      "G.V Royal Residency",
      "G.V Cloudy Kitchen",
      "Cloudy Drives",
      "Idukki 685505",
    ],
    alternates: { canonical: url },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
    },
    openGraph: {
      type: "website",
      locale: "en_IN",
      url,
      siteName: BRAND,
      title: page.title,
      description: page.description,
      images: [{ url: image, alt: page.ogImageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
      images: [image],
    },
  };
}

function postal(locality: string, street?: string) {
  return {
    "@type": "PostalAddress" as const,
    streetAddress: street,
    addressLocality: locality,
    addressRegion: "Kerala",
    postalCode: "685505",
    addressCountry: "IN",
  };
}

function telList(phones: readonly string[]) {
  return phones.map((p) => `+${p.replace(/\D/g, "")}`);
}

const AREA = [
  { "@type": "Place", name: "Vattavada" },
  { "@type": "Place", name: "Munnar" },
  { "@type": "Place", name: "Idukki" },
  { "@type": "AdministrativeArea", name: "Kerala" },
];

export function organizationJsonLd() {
  const url = publicSiteUrl();
  return {
    "@type": "Organization",
    "@id": `${url}/#organization`,
    name: BRAND,
    url,
    logo: absoluteUrl("/logo.jpeg"),
    image: absoluteUrl("/logo.jpeg"),
    telephone: telList(SITE_CONTACTS.royal.phones)[0],
    address: postal("Vattavada", "Vattavada, Munnar"),
    areaServed: AREA,
    sameAs: [] as string[],
    department: [
      { "@type": "LodgingBusiness", name: SITE_CONTACTS.glenn.name, url: absoluteUrl("/cloudy-glenn") },
      { "@type": "LodgingBusiness", name: SITE_CONTACTS.royal.name, url: absoluteUrl("/royal-residency") },
      { "@type": "Restaurant", name: SITE_CONTACTS.kitchen.name, url: absoluteUrl("/cloudy-kitchen") },
      { "@type": "AutoRental", name: "Cloudy Drives", url: absoluteUrl("/car-rental") },
    ],
  };
}

export function websiteJsonLd() {
  const url = publicSiteUrl();
  return {
    "@type": "WebSite",
    "@id": `${url}/#website`,
    url,
    name: BRAND,
    description: HOME_SEO.description,
    inLanguage: "en-IN",
    publisher: { "@id": `${url}/#organization` },
  };
}

export function siteJsonLd(site: PublicSite) {
  const url = absoluteUrl(`/${site.slug}`);
  const phones = telList(site.phones);
  const base = {
    "@id": `${url}#business`,
    name: site.name,
    url,
    description: siteSeo(site).description,
    image: site.hero?.kind === "image" ? absoluteUrl(site.hero.src) : absoluteUrl("/logo.jpeg"),
    telephone: phones[0],
    email: site.email,
    address: postal(
      site.tone === "royal" ? "Koviloor" : "Vattavada",
      site.location,
    ),
    areaServed: AREA,
    parentOrganization: { "@id": `${publicSiteUrl()}/#organization` },
  };

  if (site.tone === "rental") {
    return {
      ...base,
      "@type": "AutoRental",
      priceRange: "₹₹",
      openingHours: "Mo-Su 06:00-21:00",
      makesOffer: [
        {
          "@type": "Offer",
          itemOffered: { "@type": "Service", name: "Car rental in Vattavada", areaServed: AREA },
        },
        {
          "@type": "Offer",
          itemOffered: { "@type": "Service", name: "Self drive car rental in Munnar" },
        },
        {
          "@type": "Offer",
          itemOffered: { "@type": "Service", name: "Car rental with driver in Vattavada and Munnar" },
        },
        {
          "@type": "Offer",
          itemOffered: { "@type": "Service", name: "Kochi and Coimbatore airport pickup" },
        },
      ],
    };
  }

  if (site.tone === "kitchen") {
    return {
      ...base,
      "@type": "Restaurant",
      servesCuisine: ["Indian", "Arabic", "Chinese", "Kerala"],
      priceRange: "₹",
      menu: absoluteUrl("/menu"),
      openingHours: "Mo-Su 07:30-22:00",
      acceptsReservations: "True",
    };
  }

  return {
    ...base,
    "@type": "LodgingBusiness",
    priceRange: "₹₹",
    checkinTime: site.tone === "glenn" ? "13:00" : "14:00",
    checkoutTime: "11:00",
    amenityFeature: site.offerings.map((o) => ({ "@type": "LocationFeatureSpecification", name: o.title, value: o.detail })),
  };
}

export function menuJsonLd() {
  return {
    "@type": "Menu",
    name: "G.V Cloudy Kitchen menu",
    url: absoluteUrl("/menu"),
    description: MENU_SEO.description,
    hasMenuSection: [
      { "@type": "MenuSection", name: "Breakfast" },
      { "@type": "MenuSection", name: "Lunch" },
      { "@type": "MenuSection", name: "Dinner" },
    ],
    provider: {
      "@type": "Restaurant",
      name: SITE_CONTACTS.kitchen.name,
      url: absoluteUrl("/cloudy-kitchen"),
      address: postal("Vattavada", SITE_CONTACTS.kitchen.address),
    },
  };
}

export const PUBLIC_PATHS = [
  "/",
  "/car-rental",
  "/cloudy-glenn",
  "/royal-residency",
  "/cloudy-kitchen",
  "/menu",
] as const;

export const STAFF_ROBOTS_DISALLOW = [
  "/login",
  "/dashboard",
  "/pos",
  "/orders",
  "/products",
  "/tables",
  "/closing",
  "/calendar",
  "/bookings",
  "/rooms",
  "/check",
  "/guests",
  "/expenses",
  "/ledger",
  "/payments",
  "/invoices",
  "/customers",
  "/reports",
  "/settings",
  "/search",
  "/api/",
];
