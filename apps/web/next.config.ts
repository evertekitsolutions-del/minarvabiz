import type { NextConfig } from "next";

const publicSupabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const publicSupabaseAnonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
const runtimeMode = String(
  process.env.NEXT_PUBLIC_MINARVA_MODE || process.env.MINARVA_MODE || "",
).trim().toLowerCase();
const isExplicitDemo = runtimeMode === "demo";

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
  (isPlaceholder(publicSupabaseUrl) || isPlaceholder(publicSupabaseAnonKey))
) {
  throw new Error(
    "Production web build requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
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
