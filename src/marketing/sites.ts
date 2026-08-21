import { GLENN_MEDIA, KITCHEN_MEDIA, ROYAL_MEDIA, SITE_CONTACTS, type SiteMedia } from "@/marketing/media";

export type SiteTone = "royal" | "glenn" | "kitchen" | "rental";

export interface PublicSite {
  slug: string;
  name: string;
  kicker: string;
  tagline: string;
  description: string;
  tone: SiteTone;
  location: string;
  phones: string[];
  email: string;
  hours: string;
  heroCta: string;
  hero: SiteMedia | null;
  gallery: SiteMedia[];
  highlights: { title: string; body: string }[];
  offerings: { title: string; detail: string; price: string }[];
  notes: string[];
}

export const PUBLIC_SITES: PublicSite[] = [
  {
    slug: "royal-residency",
    name: SITE_CONTACTS.royal.name,
    kicker: "Stay · Koviloor, Munnar",
    tagline: "Quiet rooms above the tea line.",
    description:
      "G.V Royal Residency is a compact stay at Koviloor Bus Stand, Munnar — valley light, slow mornings, and an easy hop to Vattavada viewpoints. Breakfast and dinner are a short ride at G.V Cloudy Kitchen.",
    tone: "royal",
    location: SITE_CONTACTS.royal.address,
    phones: [...SITE_CONTACTS.royal.phones],
    email: "stay@royalresidency.local",
    hours: "Check-in 2:00 PM · Check-out 11:00 AM",
    heroCta: "Call for dates",
    hero: ROYAL_MEDIA[0],
    gallery: ROYAL_MEDIA,
    highlights: [
      { title: "Koviloor location", body: "Next to Koviloor Bus Stand, Munnar — PIN 685505 with the rest of the group." },
      { title: "Simple, clean rooms", body: "Twin and single rooms with extra bedding when you need it." },
      { title: "Kitchen nearby", body: "Meals at G.V Cloudy Kitchen, Urkadu, Vattavada." },
    ],
    offerings: [
      { title: "Twin room", detail: "Two beds · extra mattress on request", price: "Ask for tonight" },
      { title: "Single room", detail: "One bed · extra mattress under the frame", price: "Ask for tonight" },
      { title: "Family stay", detail: "Combine rooms for a group", price: "Ask for tonight" },
    ],
    notes: ["PIN 685505 for all G.V properties.", "Car rental via Cloudy Drives on request."],
  },
  {
    slug: "cloudy-glenn",
    name: SITE_CONTACTS.glenn.name,
    kicker: "Stay · Vattavada hillside",
    tagline: "A-frame cottages in the mist.",
    description:
      "G.V Cloudy Glenn Resort sits on a forested slope in Vattavada, Munnar. Stilt cottages with blue roofs, balconies over the trees, and room to spread out for families and longer stays.",
    tone: "glenn",
    location: SITE_CONTACTS.glenn.address,
    phones: [...SITE_CONTACTS.glenn.phones],
    email: "stay@cloudyglenn.local",
    hours: "Check-in 1:00 PM · Check-out 11:00 AM",
    heroCta: "Call to plan a stay",
    hero: GLENN_MEDIA[0],
    gallery: GLENN_MEDIA,
    highlights: [
      { title: "Hill cottages", body: "A-frame rooms on stilts, each with a balcony over the slope." },
      { title: "Weather as the amenity", body: "Mist, forest, and flowering banks — pack a warm layer." },
      { title: "Same group kitchen", body: "Eat at G.V Cloudy Kitchen in Urkadu, or ask about in-cottage plans." },
    ],
    offerings: [
      { title: "Mist cottage", detail: "2–3 guests · balcony", price: "Ask for tonight" },
      { title: "Glenn family", detail: "Combine cottages for a group", price: "Ask for tonight" },
      { title: "Longer stay", detail: "Weekly stays on the hillside", price: "Ask for the week" },
    ],
    notes: ["PIN 685505.", "More photos go in public/gv-cloudy-glenn — then add them in src/marketing/media.ts."],
  },
  {
    slug: "cloudy-kitchen",
    name: SITE_CONTACTS.kitchen.name,
    kicker: "Restaurant · Urkadu, Vattavada",
    tagline: "Indian, Arabic, Chinese — kettle always on.",
    description:
      "G.V Cloudy Kitchen is the group restaurant on the Urkadu road in Vattavada: breakfast through dinner for stay guests and walk-ins, with delivery across Vattavada.",
    tone: "kitchen",
    location: SITE_CONTACTS.kitchen.address,
    phones: [...SITE_CONTACTS.kitchen.phones],
    email: "hello@cloudykitchen.local",
    hours: "Daily 7:30 AM – 10:00 PM",
    heroCta: "View the menu",
    hero: KITCHEN_MEDIA[0],
    gallery: KITCHEN_MEDIA,
    highlights: [
      { title: "Highland plates", body: "Meals, porotta, biryani, and Arabic-Chinese favourites." },
      { title: "Stay guests and walk-in", body: "Charge to the room at Royal Residency or Cloudy Glenn, or pay at the counter." },
      { title: "Delivery in Vattavada", body: "Call the kitchen numbers below for delivery." },
    ],
    offerings: [
      { title: "Breakfast", detail: "Idly, dosa, poori, parotta, curries", price: "from ₹15" },
      { title: "Lunch", detail: "Meals, biryani, noodles, chicken 65", price: "from ₹100" },
      { title: "Drinks", detail: "Water, soda, Coke, 7up, Sprite", price: "from ₹20" },
    ],
    notes: ["Halal kitchen.", "PIN 685505."],
  },
  {
    slug: "car-rental",
    name: "Cloudy Drives",
    kicker: "Car rental · Vattavada & Munnar",
    tagline: "Car rental in Vattavada for the hill roads.",
    description:
      "Cloudy Drives is car rental in Vattavada and Munnar — self-drive or with driver, local sightseeing, and Kochi / Coimbatore airport pickup for guests of G.V Royal Residency and G.V Cloudy Glenn.",
    tone: "rental",
    location: `Based in Vattavada, Munnar · PIN 685505 · pickup by arrangement`,
    phones: [...SITE_CONTACTS.royal.phones],
    email: "drives@cloudydrives.local",
    hours: "Bookings 6:00 AM – 9:00 PM",
    heroCta: "Request a car",
    hero: null,
    gallery: [],
    highlights: [
      { title: "Stay-linked pickup", body: "Collect from either property or Kochi / Coimbatore." },
      { title: "Self-drive or chauffeur", body: "Licence rules and driver hours on request." },
      { title: "Clear day rates", body: "Km limit, fuel, and night halt — ask when you book." },
    ],
    offerings: [
      { title: "Compact hatch", detail: "4 seats", price: "Ask for the day" },
      { title: "SUV", detail: "6–7 seats", price: "Ask for the day" },
      { title: "With driver", detail: "Local / outstation", price: "Ask for the day" },
    ],
    notes: ["Documents, deposit, and insurance on booking.", "PIN 685505."],
  },
];

export function siteBySlug(slug: string) {
  return PUBLIC_SITES.find((s) => s.slug === slug);
}
