import type { NextConfig } from "next";
import { minarvaHttpSecurityHeaders } from "@minarvabiz/utils/security-headers";

const publicSupabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const publicSupabaseKey = String(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
const runtimeMode = String(
  process.env.NEXT_PUBLIC_MINARVA_MODE || process.env.MINARVA_MODE || "",
).trim().toLowerCase();
const isVercelPreviewDemo = process.env.VERCEL_ENV === "preview" && runtimeMode === "";
const isExplicitDemo = runtimeMode === "demo" || isVercelPreviewDemo;

function isPlaceholder(value: string) {
  const normalized = value.toLowerCase();
  return (
    !normalized ||
    normalized.includes("your-project") ||
    normalized.includes("your-anon") ||
    normalized.includes("change-me")
  );
}

if (
  process.env.NODE_ENV === "production" &&
  !isExplicitDemo &&
  (isPlaceholder(publicSupabaseUrl) || isPlaceholder(publicSupabaseKey))
) {
  throw new Error(
    "Production web build requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or legacy NEXT_PUBLIC_SUPABASE_ANON_KEY). " +
      "Configure them in the deployment environment; Minarva Biz does not fall back to hardcoded Supabase credentials.",
  );
}

if (publicSupabaseUrl && !isPlaceholder(publicSupabaseUrl)) {
  try {
    new URL(publicSupabaseUrl);
  } catch {
    if (process.env.NODE_ENV === "production" && !isExplicitDemo) {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid absolute URL.");
    }
  }
}

const nextConfig: NextConfig = {
  serverExternalPackages: ["sql.js"],
  reactStrictMode: true,
  poweredByHeader: false,
  env: isVercelPreviewDemo
    ? {
        NEXT_PUBLIC_MINARVA_MODE: "demo",
        NEXT_PUBLIC_REQUIRE_AUTH: "false",
      }
    : {},
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
        headers: minarvaHttpSecurityHeaders(),
      },
    ];
  },
};

export default nextConfig;
