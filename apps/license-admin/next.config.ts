import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@minarvabiz/ui","@minarvabiz/types","@minarvabiz/utils","@minarvabiz/licensing"],
};
export default nextConfig;
