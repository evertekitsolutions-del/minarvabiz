import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
  transpilePackages: ["@minarvabiz/ui", "@minarvabiz/types", "@minarvabiz/utils", "@minarvabiz/licensing"],
};

export default nextConfig;
