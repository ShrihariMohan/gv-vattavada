/** Public menu + POS seed. Prices in rupees; converted to paise in seed. Filter vocabulary is tags only. */
export type KitchenMenuItem = {
  id: string;
  name: string;
  rupees: number;
  description: string;
  image: string;
  tags: string[];
};

export const MENU_CATEGORY_NAMES = ["Breakfast", "Lunch", "Dinner", "Beverages"] as const;
export type MenuCategoryName = (typeof MENU_CATEGORY_NAMES)[number];

/** Chips on POS, Products, and public menu. Same labels everywhere. */
export const MENU_FILTER_TAGS = [
  "breakfast",
  "lunch",
  "dinner",
  "drinks",
  "chinese",
  "meals",
  "dosa",
  "curry",
  "chicken",
  "beef",
  "veg",
  "egg",
] as const;

const bf = "breakfast";
const ld = ["lunch", "dinner"] as const;
const cn = ["chinese", "lunch", "dinner"] as const;

export const KITCHEN_MENU: KitchenMenuItem[] = [
  { id: "p-idly", name: "1 Plate Idly", rupees: 50, description: "Steamed rice cakes with chutney", image: "/menu/idly.jpg", tags: [bf, "idly", "veg"] },
  { id: "p-thattu-dosa", name: "1 Set Thattu Dosa", rupees: 50, description: "Crisp thattu dosa set", image: "/menu/dosa.jpg", tags: [bf, "dosa", "veg"] },
  { id: "p-poori", name: "1 Set Poori", rupees: 60, description: "Puffed poori with side", image: "/menu/poori.jpg", tags: [bf, "poori", "bread", "veg"] },
  { id: "p-plain-dosa", name: "Plain Dosa", rupees: 70, description: "Crisp fermented crepe", image: "/menu/dosa.jpg", tags: [bf, "dosa", "veg"] },
  { id: "p-ghee-dosa", name: "Ghee Dosa", rupees: 80, description: "Dosa roasted in ghee", image: "/menu/dosa.jpg", tags: [bf, "dosa", "veg"] },
  { id: "p-dosa", name: "Masala Dosa", rupees: 90, description: "Dosa with spiced potato", image: "/menu/masala-dosa.jpg", tags: [bf, "dosa", "veg"] },
  { id: "p-egg-dosa", name: "Egg Dosa", rupees: 80, description: "Dosa topped with egg", image: "/menu/dosa.jpg", tags: [bf, "dosa", "egg"] },
  { id: "p-parotta", name: "Parotta (1 Piece)", rupees: 15, description: "Flaky Kerala parotta", image: "/menu/parotta.jpg", tags: [bf, "dinner", "parotta", "bread"] },
  { id: "p-chappathi", name: "1 Chappathi", rupees: 15, description: "Whole-wheat chapathi", image: "/menu/chapathi.jpg", tags: [bf, "chapathi", "bread", "veg"] },
  { id: "p-kadala", name: "Kadala Curry", rupees: 60, description: "Black chickpea curry", image: "/menu/kadala.jpg", tags: [bf, "curry", "veg"] },
  { id: "p-peas", name: "Green Peas Curry", rupees: 60, description: "Green peas in gravy", image: "/menu/peas.jpg", tags: [bf, "curry", "veg"] },
  { id: "p-egg-curry", name: "Egg Curry", rupees: 60, description: "Eggs in coconut gravy", image: "/menu/egg-curry.jpg", tags: [bf, "dinner", "curry", "egg"] },
  { id: "p-chicken", name: "Chicken Curry", rupees: 140, description: "Homestyle chicken curry", image: "/menu/chicken-curry.jpg", tags: [bf, "dinner", "curry", "chicken"] },
  { id: "p-beef-curry", name: "Beef Curry", rupees: 180, description: "Kerala-style beef curry", image: "/menu/beef-curry.jpg", tags: [bf, "dinner", "curry", "beef"] },
  { id: "p-half-boil", name: "Half Boil", rupees: 40, description: "Soft half-boiled eggs", image: "/menu/egg.jpg", tags: [bf, "egg"] },
  { id: "p-omelette", name: "Omelette", rupees: 40, description: "Egg omelette", image: "/menu/omelette.jpg", tags: [bf, "egg"] },
  { id: "p-kalaki", name: "Kalaki", rupees: 40, description: "Scrambled egg kalaki", image: "/menu/omelette.jpg", tags: [bf, "egg"] },

  { id: "p-meals", name: "Kerala Meals", rupees: 140, description: "Rice, curries, pickle", image: "/menu/meals.jpg", tags: [...ld, "meals", "veg"] },
  { id: "p-tn-meals", name: "Tamil Nadu Meals", rupees: 140, description: "Tamil Nadu style meals", image: "/menu/meals.jpg", tags: [...ld, "meals"] },
  { id: "p-chicken-biryani", name: "Chicken Biryani", rupees: 180, description: "Chicken biryani", image: "/menu/biryani.jpg", tags: [...ld, "biryani", "chicken", "rice"] },
  { id: "p-beef-biryani", name: "Beef Biryani", rupees: 220, description: "Beef biryani", image: "/menu/biryani.jpg", tags: [...ld, "biryani", "beef", "rice"] },
  { id: "p-chicken-rice", name: "Chicken Rice", rupees: 180, description: "Chicken fried rice", image: "/menu/fried-rice.jpg", tags: [...cn, "rice", "chicken"] },
  { id: "p-beef-rice", name: "Beef Rice", rupees: 220, description: "Beef fried rice", image: "/menu/fried-rice.jpg", tags: [...cn, "rice", "beef"] },
  { id: "p-chicken-noodles", name: "Chicken Noodles", rupees: 180, description: "Chicken noodles", image: "/menu/noodles.jpg", tags: [...cn, "noodles", "chicken"] },
  { id: "p-beef-noodles", name: "Beef Noodles", rupees: 220, description: "Beef noodles", image: "/menu/noodles.jpg", tags: [...cn, "noodles", "beef"] },
  { id: "p-c65-q", name: "Chicken 65 — Quarter", rupees: 240, description: "Quarter portion chicken 65", image: "/menu/chicken65.jpg", tags: [...cn, "chicken", "starter"] },
  { id: "p-c65-h", name: "Chicken 65 — Half", rupees: 360, description: "Half portion chicken 65", image: "/menu/chicken65.jpg", tags: [...cn, "chicken", "starter"] },
  { id: "p-c65-f", name: "Chicken 65 — Full", rupees: 700, description: "Full portion chicken 65", image: "/menu/chicken65.jpg", tags: [...cn, "chicken", "starter"] },
  { id: "p-chilly-chicken", name: "Chilly Chicken", rupees: 200, description: "Spicy chilly chicken", image: "/menu/chilly-chicken.jpg", tags: [...cn, "chicken", "starter"] },
  { id: "p-chicken-kondattam", name: "Chicken Kondattam", rupees: 200, description: "Dry roasted chicken kondattam", image: "/menu/chilly-chicken.jpg", tags: [...ld, "chicken"] },
  { id: "p-pepper-chicken", name: "Pepper Chicken", rupees: 200, description: "Pepper-fried chicken", image: "/menu/pepper-chicken.jpg", tags: [...ld, "chicken", "starter"] },
  { id: "p-beef-roast", name: "Beef Roast", rupees: 240, description: "Kerala beef roast", image: "/menu/beef-roast.jpg", tags: [...ld, "beef"] },
  { id: "p-beef-fry", name: "Beef Fry", rupees: 240, description: "Crisp beef fry", image: "/menu/beef-roast.jpg", tags: [...ld, "beef"] },
  { id: "p-fish-fry", name: "Fish Fry", rupees: 100, description: "Shallow-fried fish", image: "/menu/fish-fry.jpg", tags: [...ld, "fish", "starter"] },
  { id: "p-ghee-rice", name: "Ghee Rice", rupees: 120, description: "Fragrant ghee rice", image: "/menu/ghee-rice.jpg", tags: [...ld, "rice", "veg"] },
  { id: "p-veg-rice", name: "Veg Rice", rupees: 140, description: "Vegetable fried rice", image: "/menu/fried-rice.jpg", tags: [...cn, "rice", "veg"] },
  { id: "p-veg-noodles", name: "Veg Noodles", rupees: 140, description: "Vegetable noodles", image: "/menu/noodles.jpg", tags: [...cn, "noodles", "veg"] },
  { id: "p-chili-gobi", name: "Chilli Gobi", rupees: 140, description: "Chilli cauliflower", image: "/menu/gobi.jpg", tags: [...cn, "veg", "gobi", "starter"] },
  { id: "p-gobi-65", name: "Gobi 65", rupees: 140, description: "Crispy gobi 65", image: "/menu/gobi.jpg", tags: [...cn, "veg", "gobi", "starter"] },

  { id: "p-water", name: "Water Bottle", rupees: 20, description: "Bottled drinking water", image: "/menu/water.jpg", tags: ["drinks", "water"] },
  { id: "p-coke", name: "Coke", rupees: 35, description: "Chilled cola", image: "/menu/cola.jpg", tags: ["drinks"] },
  { id: "p-7up", name: "7Up", rupees: 35, description: "Lemon-lime soda", image: "/menu/soda.jpg", tags: ["drinks"] },
  { id: "p-sprite", name: "Sprite", rupees: 35, description: "Lemon-lime soda", image: "/menu/soda.jpg", tags: ["drinks"] },
  { id: "p-miranda", name: "Miranda", rupees: 35, description: "Orange soda", image: "/menu/cola.jpg", tags: ["drinks"] },
  { id: "p-soda", name: "Soda", rupees: 20, description: "Club soda", image: "/menu/soda.jpg", tags: ["drinks"] },
  { id: "p-tea", name: "Tea", rupees: 20, description: "Fresh hill tea", image: "/menu/tea.jpg", tags: ["drinks", "tea", "breakfast"] },
];

export function parseProductTags(raw: string): string[] {
  return [...new Set(raw.split(/[,;]+/).map((t) => t.trim().toLowerCase().replace(/\s+/g, "-")).filter(Boolean))];
}

export function categoryNameFromTags(tags: string[]): MenuCategoryName {
  const t = new Set(tags.map((x) => x.toLowerCase()));
  if (t.has("drinks") || t.has("beverages")) return "Beverages";
  if (t.has("lunch")) return "Lunch";
  if (t.has("breakfast")) return "Breakfast";
  if (t.has("dinner")) return "Dinner";
  return "Lunch";
}

export function categoryIdForTags(tags: string[], categories: { id: string; name: string }[]): string {
  const name = categoryNameFromTags(tags);
  return categories.find((c) => c.name === name)?.id ?? categories[0]?.id ?? "";
}

export function publicMenuItems<T extends { business_id: string; active: boolean; deleted_at: string | null }>(
  products: T[],
  restaurantId: string,
): T[] {
  return products.filter((p) => p.business_id === restaurantId && p.active && !p.deleted_at);
}

export function productMatchesSelectedTag(product: { tags?: string[] }, selected: string | null): boolean {
  if (!selected) return true;
  return (product.tags ?? []).includes(selected);
}

const QUERY_ALIASES: Record<string, string> = { lunk: "lunch", brakfast: "breakfast" };

export function productMatchesQuery(
  product: { name: string; description: string; sku: string; tags?: string[] },
  query: string,
): boolean {
  const raw = query.trim().toLowerCase();
  const q = QUERY_ALIASES[raw] ?? raw;
  if (!q) return true;
  const hay = [product.name, product.description, product.sku, ...(product.tags ?? [])].join(" ").toLowerCase();
  return hay.includes(q) || (product.tags ?? []).some((t) => t.includes(q) || q.includes(t));
}
