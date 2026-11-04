import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MK Adisyon — Restoran Yönetimi",
    short_name: "MK Adisyon",
    description: "Masa, sipariş, mutfak ve kasa operasyonları tek merkezde.",
    id: "/giris",
    start_url: "/giris",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f4f6f8",
    theme_color: "#17211d",
    lang: "tr",
    categories: ["business", "productivity", "food"],
    icons: [
      {
        src: "/icons/app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/app-icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/app-icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
