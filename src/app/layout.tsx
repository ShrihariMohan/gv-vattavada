import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/ui/providers";
import { publicSiteUrl } from "@/marketing/seo";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(publicSiteUrl()),
  title: {
    default: "Stay, Restaurant & Car Rental in Vattavada, Munnar | Cloudy Group",
    template: "%s",
  },
  description:
    "Cloudy Group in Vattavada, Munnar (PIN 685505): hillside stays, G.V Cloudy Kitchen, and Guru Travels car rental — self-drive or with driver.",
  applicationName: "Cloudy Group",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: "/logo.jpeg",
  },
  appleWebApp: {
    capable: true,
    title: "Staff console",
    statusBarStyle: "default",
    startupImage: [
      {
        url: "/splash-iphone.jpg",
        media:
          "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        url: "/splash-iphone.jpg",
        media:
          "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        url: "/splash-iphone-max.jpg",
        media:
          "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        url: "/splash-iphone-max.jpg",
        media:
          "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)",
      },
      { url: "/splash-iphone.jpg" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#0e7c7b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-IN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
