import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DemoBanner } from "@/components/demo-banner";
import "./globals.css";

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
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/*
          The DEMO banner is mounted here, in the root layout, so that every
          route in every route group inherits it. A page cannot opt out.
          See src/components/demo-banner.tsx for why this is non-negotiable.
        */}
        <DemoBanner />
        {children}
      </body>
    </html>
  );
}
