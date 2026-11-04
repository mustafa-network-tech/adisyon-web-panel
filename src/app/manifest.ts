import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MK Adisyon — Restoran Yönetimi",
    short_name: "MK Adisyon",
    description: "Masa, sipariş, mutfak ve kasa operasyonları tek merkezde.",
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
        src: "/icons/app-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/app-icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Masalar",
        short_name: "Masalar",
        url: "/app/demo-restoran/merkez/masalar",
        icons: [{ src: "/icons/app-icon.svg", sizes: "any" }],
      },
      {
        name: "Mutfak",
        short_name: "Mutfak",
        url: "/app/demo-restoran/merkez/mutfak",
        icons: [{ src: "/icons/app-icon.svg", sizes: "any" }],
      },
    ],
  };
}
