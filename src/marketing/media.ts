export type SiteMedia = {
  src: string;
  alt: string;
  kind: "image" | "video";
  label: string;
};

const PIN = "685505";

export const SITE_CONTACTS = {
  royal: {
    name: "G.V Royal Residency",
    address: `Koviloor Bus Stand, Munnar, Idukki, Kerala ${PIN}`,
    phones: ["+91 86089 33892", "+91 88382 67578"],
  },
  glenn: {
    name: "G.V Cloudy Glenn Resort",
    address: `Vattavada, Munnar, Idukki, Kerala ${PIN}`,
    phones: ["+91 86089 33892", "+91 88382 67578"],
  },
  kitchen: {
    name: "G.V Cloudy Kitchen",
    address: `Urkadu, Vattavada, Munnar, Idukki, Kerala ${PIN}`,
    phones: ["+91 86089 33892", "+91 87545 04478", "+91 88382 67578"],
  },
} as const;

export const PINCODE = PIN;

export const ROYAL_MEDIA: SiteMedia[] = [
  { src: "/gv-royal-residency/gv-res-1.jpeg", alt: "Twin room with wooden beds", kind: "image", label: "Twin room" },
  { src: "/gv-royal-residency/gv-res-2.jpeg", alt: "Single room with extra mattress", kind: "image", label: "Single room" },
  { src: "/gv-royal-residency/gv-res-3.jpeg", alt: "Royal Residency room", kind: "image", label: "Guest room" },
  { src: "/gv-royal-residency/gv-res-video.mp4", alt: "Walk-through of Royal Residency", kind: "video", label: "Property video" },
];

/** Add new stills or clips under public/gv-cloudy-glenn and list them here. */
export const GLENN_MEDIA: SiteMedia[] = [
  { src: "/gv-cloudy-glenn/gv-glenn-2.jpeg", alt: "A-frame cottages on the forested hillside", kind: "image", label: "Hill cottages" },
  { src: "/gv-cloudy-glenn/gv-glenn-3.jpeg", alt: "Stilt cottage with blue roof and balcony", kind: "image", label: "Blue-roof cottage" },
  { src: "/gv-cloudy-glenn/gv-glenn-4.jpeg", alt: "Cloudy Glenn grounds", kind: "image", label: "Grounds" },
  { src: "/gv-cloudy-glenn/gv-glenn-5.jpeg", alt: "Cottage among the trees", kind: "image", label: "Forest cottage" },
  { src: "/gv-cloudy-glenn/gv-glenn-6.jpeg", alt: "Three cottages on the flowering slope", kind: "image", label: "Slope view" },
  { src: "/gv-cloudy-glenn/gv-glenn-7.jpeg", alt: "Resort exterior", kind: "image", label: "Exterior" },
  { src: "/gv-cloudy-glenn/gv-glenn-8.jpeg", alt: "A-frame cottage interior", kind: "image", label: "Cottage interior" },
  { src: "/gv-cloudy-glenn/gv-glenn-9.jpeg", alt: "Cloudy Glenn stay", kind: "image", label: "Stay" },
  { src: "/gv-cloudy-glenn/gv-glenn-10.jpeg", alt: "Cottage washroom", kind: "image", label: "Washroom" },
  { src: "/gv-cloudy-glenn/gv-glenn-11.jpeg", alt: "Cottage details", kind: "image", label: "Details" },
  { src: "/gv-cloudy-glenn/gv-glenn-12.jpeg", alt: "Resort landscape", kind: "image", label: "Landscape" },
  { src: "/gv-cloudy-glenn/gv-glenn-video-1.mp4", alt: "Cloudy Glenn resort video", kind: "video", label: "Resort video 1" },
  { src: "/gv-cloudy-glenn/gv-glenn-video-2.mp4", alt: "Cottage walk-through video", kind: "video", label: "Resort video 2" },
];

export const KITCHEN_MEDIA: SiteMedia[] = [
  { src: "/gv-cloudy-kitchen/gv-cloudy-3.jpeg", alt: "G.V Cloudy Kitchen facade in Urkadu", kind: "image", label: "Facade" },
  { src: "/gv-cloudy-kitchen/gv-cloudy-1.jpeg", alt: "Dining room with blue chairs", kind: "image", label: "Dining room" },
  { src: "/gv-cloudy-kitchen/gv-cloudy-2.jpeg", alt: "Service counter and tables", kind: "image", label: "Service area" },
];

export function telHref(display: string) {
  return `tel:+${display.replace(/\D/g, "")}`;
}

export function waHref(display: string) {
  return `https://wa.me/${display.replace(/\D/g, "")}`;
}
