import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These are browser-public Supabase values. Vercel project env vars still
  // override them when present; the fallback keeps the production web build
  // connected even when the connector cannot write project environment vars.
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wmjgefbaliuwmaxyzxkq.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_5jIjE_KhGJD9k6GDkeo-Xw_riNs-BWG",
  },
  serverExternalPackages: ["sql.js"],
  reactStrictMode: true,
  transpilePackages: [
    "@minarvabiz/ui",
    "@minarvabiz/types",
    "@minarvabiz/utils",
    "@minarvabiz/business-logic",
    "@minarvabiz/licensing",
    "@minarvabiz/validation",
    "@minarvabiz/database",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
