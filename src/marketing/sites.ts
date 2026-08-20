export type SiteTone = "royal" | "glenn" | "kitchen" | "rental";

export interface PhotoSlot {
  label: string;
  hint: string;
  className?: string;
}

export interface PublicSite {
  slug: string;
  name: string;
  kicker: string;
  tagline: string;
  description: string;
  tone: SiteTone;
  location: string;
  phone: string;
  email: string;
  hours: string;
  heroCta: string;
  gallery: PhotoSlot[];
  highlights: { title: string; body: string }[];
  offerings: { title: string; detail: string; price: string }[];
  notes: string[];
}

export const PUBLIC_SITES: PublicSite[] = [
  {
    slug: "royal-residency",
    name: "Royal Residency",
    kicker: "Stay · Vattavada",
    tagline: "Quiet rooms above the tea line.",
    description:
      "Placeholder copy. Royal Residency is a small-capacity stay for guests who want valley light, slow mornings, and easy access to Vattavada viewpoints. Replace this paragraph with the real story, house rules, and check-in notes.",
    tone: "royal",
    location: "Vattavada, Idukki, Kerala",
    phone: "+91 48 6800 0001",
    email: "stay@royalresidency.local",
    hours: "Check-in 2:00 PM · Check-out 11:00 AM",
    heroCta: "Enquire for dates",
    gallery: [
      { label: "Hero exterior", hint: "Wide facade / valley at dusk", className: "md:col-span-2 md:row-span-2 min-h-80" },
      { label: "Lobby", hint: "Reception + seating" },
      { label: "Room 101", hint: "Garden room interior" },
      { label: "Breakfast deck", hint: "Outdoor table" },
      { label: "Night lights", hint: "Pathway / porch" },
    ],
    highlights: [
      { title: "Valley-facing rooms", body: "Dummy: each room will list occupancy, view, and a photo set." },
      { title: "Homestyle breakfast", body: "Dummy: served at Cloudy Kitchen or in-house — confirm later." },
      { title: "Guided viewpoints", body: "Dummy: sunrise points and walking routes to add." },
    ],
    offerings: [
      { title: "Garden room", detail: "2 guests · placeholder amenities list", price: "₹ — / night" },
      { title: "Valley suite", detail: "3 guests · placeholder amenities list", price: "₹ — / night" },
      { title: "Family cottage", detail: "4 guests · placeholder amenities list", price: "₹ — / night" },
    ],
    notes: ["Photos, rates, and cancellation policy TBD.", "Wi-Fi, parking, and extra-bed rules TBD."],
  },
  {
    slug: "cloudy-glenn",
    name: "Cloudy Glenn Resort",
    kicker: "Stay · mist & meadow",
    tagline: "A slower resort day in the clouds.",
    description:
      "Placeholder copy. Cloudy Glenn is the more open, landscape-first stay — lawns, longer stays, and family groups. Swap this text for the resort positioning, season notes, and what is included in the tariff.",
    tone: "glenn",
    location: "Vattavada, Idukki, Kerala",
    phone: "+91 48 6800 0002",
    email: "stay@cloudyglenn.local",
    hours: "Check-in 1:00 PM · Check-out 11:00 AM",
    heroCta: "Plan a stay",
    gallery: [
      { label: "Lawn panorama", hint: "Mist over the grounds", className: "md:col-span-2 min-h-72" },
      { label: "Cottage porch", hint: "Seating + plants" },
      { label: "Bonfire corner", hint: "Evening setup" },
      { label: "Indoor lounge", hint: "Fireplace / books" },
      { label: "Trail start", hint: "Gate or path" },
    ],
    highlights: [
      { title: "Space to spread out", body: "Dummy: cottages vs rooms, lawn access, kids-friendly notes." },
      { title: "Weather as the amenity", body: "Dummy: best months, monsoon notes, what to pack." },
      { title: "Shared table", body: "Dummy: meals with Cloudy Kitchen or in-resort dining." },
    ],
    offerings: [
      { title: "Mist cottage", detail: "2–3 guests · placeholder", price: "₹ — / night" },
      { title: "Glenn family", detail: "4 guests · placeholder", price: "₹ — / night" },
      { title: "Extended stay", detail: "Weekly dummy rate", price: "₹ — / week" },
    ],
    notes: ["Activity list (treks, camps) TBD.", "Pet policy TBD."],
  },
  {
    slug: "cloudy-kitchen",
    name: "Cloudy Kitchen",
    kicker: "Restaurant · all day",
    tagline: "Highland plates, kettle always on.",
    description:
      "Placeholder copy. Cloudy Kitchen is the public restaurant — breakfast through dinner, guest and walk-in. Replace with cuisine story, sourcing, and whether it is reservation-only in peak season.",
    tone: "kitchen",
    location: "Vattavada, Idukki, Kerala",
    phone: "+91 48 6800 0003",
    email: "hello@cloudykitchen.local",
    hours: "Daily 7:30 AM – 10:00 PM (dummy hours)",
    heroCta: "View the menu",
    gallery: [
      { label: "Dining room", hint: "Interior wide shot", className: "md:col-span-2 min-h-72" },
      { label: "Pass / kitchen", hint: "Service window" },
      { label: "Signature plate", hint: "Hero dish photo" },
      { label: "Tea service", hint: "Kettle / glass" },
      { label: "Evening tables", hint: "Warm lighting" },
    ],
    highlights: [
      { title: "Kerala highland cooking", body: "Dummy: meals, porotta, curries, seasonal specials." },
      { title: "Stay guests eat first", body: "Dummy: room charge vs walk-in, breakfast timings." },
      { title: "Open kitchen energy", body: "Dummy: chef note and allergens to add later." },
    ],
    offerings: [
      { title: "Breakfast", detail: "Dosa, eggs, tea — placeholder menu", price: "from ₹ —" },
      { title: "Lunch meals", detail: "Kerala meals / thali placeholder", price: "from ₹ —" },
      { title: "Dinner mains", detail: "Curry + breads placeholder", price: "from ₹ —" },
    ],
    notes: ["Full menu PDF TBD.", "Bar / BYO policy TBD."],
  },
  {
    slug: "car-rental",
    name: "Cloudy Drives",
    kicker: "Car rental · self drive & with driver",
    tagline: "Cars for the hill roads.",
    description:
      "Placeholder copy. Cloudy Drives is the upcoming car-rental arm — airport pickups, local sightseeing, and self-drive for guests of Royal Residency and Cloudy Glenn. Replace with fleet photos, insurance, and deposit rules.",
    tone: "rental",
    location: "Based in Vattavada · pickup by arrangement",
    phone: "+91 48 6800 0004",
    email: "drives@cloudydrives.local",
    hours: "Bookings 6:00 AM – 9:00 PM (dummy)",
    heroCta: "Request a car",
    gallery: [
      { label: "Fleet line-up", hint: "3 cars, front 3/4", className: "md:col-span-2 min-h-72" },
      { label: "SUV detail", hint: "Interior / boot" },
      { label: "Hatchback", hint: "Side profile" },
      { label: "With driver", hint: "Driver + guest (consent)" },
      { label: "Hill road", hint: "Scenic drive still" },
    ],
    highlights: [
      { title: "Stay-linked pickup", body: "Dummy: collect from either property or Kochi/Coimbatore." },
      { title: "Self-drive or chauffeur", body: "Dummy: licence rules and driver hours." },
      { title: "Clear day rates", body: "Dummy: km limit, fuel, night halt — fill later." },
    ],
    offerings: [
      { title: "Compact hatch", detail: "4 seats · dummy economy", price: "₹ — / day" },
      { title: "SUV", detail: "6–7 seats · dummy family", price: "₹ — / day" },
      { title: "With driver", detail: "8 hrs / 80 km placeholder", price: "₹ — / day" },
    ],
    notes: ["Documents, deposit, and insurance TBD.", "Outstation tariff TBD."],
  },
];

export function siteBySlug(slug: string) {
  return PUBLIC_SITES.find((s) => s.slug === slug);
}
