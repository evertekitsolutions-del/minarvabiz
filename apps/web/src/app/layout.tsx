import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Minarva Biz",
  description: "Minarva Biz — business management software for billing, inventory, service operations and more.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Request-bound rendering is required for Next.js to propagate the CSP nonce to framework scripts.
  await headers();
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased antialiased">
        {children}
      </body>
    </html>
  );
}
