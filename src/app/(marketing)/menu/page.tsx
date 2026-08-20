import type { Metadata } from "next";
import { PublicMenu } from "@/marketing/public-menu";

export const metadata: Metadata = {
  title: "Menu · G.V Cloudy Kitchen",
  description: "Breakfast, lunch, dinner, and drinks at G.V Cloudy Kitchen, Urkadu, Vattavada, Munnar.",
};

export default function MenuPage() {
  return <PublicMenu />;
}
