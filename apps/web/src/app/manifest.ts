import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Minarva Biz",
    short_name: "Minarva Biz",
    description: "Secure online ERP for boutiques, laundry, ironing and more.",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#1760e6",
    categories: ["business", "productivity"],
    icons: [
      { src: "/logo-mark.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/minarva-biz-mark.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
