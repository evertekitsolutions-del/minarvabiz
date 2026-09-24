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

let supabaseOrigin = "";
let supabaseWsOrigin = "";
if (publicSupabaseUrl && !isPlaceholder(publicSupabaseUrl)) {
  try {
    const parsed = new URL(publicSupabaseUrl);
    supabaseOrigin = parsed.origin;
    if (parsed.protocol === "https:") {
      supabaseWsOrigin = `wss://${parsed.host}`;
    } else if (parsed.protocol === "http:") {
      supabaseWsOrigin = `ws://${parsed.host}`;
    }
  } catch {
    if (process.env.NODE_ENV === "production" && !isExplicitDemo) {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid absolute URL.");
    }
  }
}

const connectSources = [
  "'self'",
  supabaseOrigin,
  supabaseWsOrigin,
  ...(process.env.NODE_ENV === "production"
    ? []
    : [
        "http://localhost:*",
        "http://127.0.0.1:*",
        "ws://localhost:*",
        "ws://127.0.0.1:*",
      ]),
].filter(Boolean);

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src ${connectSources.join(" ")}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
].join("; ");

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
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
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
