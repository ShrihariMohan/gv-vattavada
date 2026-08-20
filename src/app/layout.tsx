import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/ui/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Cloudy Group · Vattavada",
    template: "%s",
  },
  description: "G.V Royal Residency, G.V Cloudy Glenn Resort, G.V Cloudy Kitchen, and Cloudy Drives.",
  applicationName: "Staff console",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Staff console",
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
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
