import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { SaaSPwaBoot } from "@/components/SaaSPwaBoot";

export const metadata: Metadata = {
  title: "Minarva Biz",
  description: "Minarva Biz — secure online SaaS ERP for billing, inventory, boutique, laundry, ironing and more.",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/logo-mark.png", sizes: "512x512", type: "image/png" }], apple: "/logo-mark.png" },
  appleWebApp: { capable: true, title: "Minarva Biz", statusBarStyle: "default" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Request-bound rendering is required for Next.js to propagate the CSP nonce to framework scripts.
  await headers();
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased antialiased">
        <SaaSPwaBoot />
        {children}
      </body>
    </html>
  );
}
