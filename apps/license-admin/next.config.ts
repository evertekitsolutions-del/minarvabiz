import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "@minarvabiz/security-headers";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@minarvabiz/ui",
    "@minarvabiz/types",
    "@minarvabiz/utils",
    "@minarvabiz/licensing",
    "@minarvabiz/security-headers",
  ],
  async headers() {
    return [
      { source: "/(.*)", headers: [...SECURITY_HEADERS] },
      {
        source: "/api/trial/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Accept" },
          { key: "Access-Control-Max-Age", value: "86400" },
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
    ];
  },
};

export default nextConfig;
