import type { Metadata } from "next";
import { Cormorant_Garamond, Lora } from "next/font/google";
import { Suspense, type ReactNode } from "react";
import { Header } from "@/components/Header";
import { SaleStrip } from "@/components/SaleStrip";
import { isOwner } from "@/lib/auth";
import { savedCount } from "@/lib/queries";
import "./globals.css";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "600"], style: ["normal", "italic"], variable: "--font-cormorant" });
const lora = Lora({ subsets: ["latin"], weight: ["400", "600"], style: ["normal", "italic"], variable: "--font-lora" });

export const metadata: Metadata = {
  title: "Personal Mall",
  description: "One curated feed of new stock, vintage and resale, refreshed every few hours.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [owner, saved] = await Promise.all([isOwner(), savedCount()]);
  return (
    <html lang="en" className={`${cormorant.variable} ${lora.variable}`}>
      <body className="min-h-screen">
        <Suspense>
          <Header savedCount={saved} owner={owner} />
        </Suspense>
        <SaleStrip />
        <main className="flex flex-col gap-14 px-s4 pb-30 pt-s6 md:px-s6">{children}</main>
      </body>
    </html>
  );
}
