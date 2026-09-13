import type { Metadata } from "next";
import { Archivo, Instrument_Serif, IBM_Plex_Mono } from "next/font/google";
import { DemoBanner } from "@/components/demo-banner";
import { SiteHeader } from "@/components/site-header";
import { CursorTracking } from "@/components/cursor-tracking";
import "./globals.css";

/**
 * Three faces, each with one job.
 *
 * Instrument Serif is what separates an auction house from a dashboard — it
 * carries page titles and the wordmark and nothing else. Archivo runs the
 * interface: tight, engineered, and deliberately not Inter. IBM Plex Mono
 * handles every price and countdown, because tabular figures stop the digits
 * jittering by a pixel each time a bid lands.
 *
 * next/font self-hosts these at build time, so there is no request to Google
 * at runtime and no layout shift while a face loads.
 */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "BidKar — online auctions (demo)",
    template: "%s · BidKar (demo)",
  },
  description:
    "A demonstration online auction marketplace. Simulated payments and simulated identity verification. No real money moves.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${archivo.variable} ${instrumentSerif.variable} ${plexMono.variable} bg-background text-foreground antialiased`}
      >
        {/*
          The DEMO banner is mounted here, in the root layout, so that every
          route in every route group inherits it. A page cannot opt out.
          See src/components/demo-banner.tsx for why this is non-negotiable.
        */}
        <DemoBanner />
        <SiteHeader />
        {children}
        {/*
          The only client-side JavaScript in the visual direction: pointer
          tracking for the card tilt, spotlight and parallax. One delegated
          listener for the whole page, inert until a pointer enters a card,
          and a no-op on touch or under prefers-reduced-motion.
        */}
        <CursorTracking />
      </body>
    </html>
  );
}
