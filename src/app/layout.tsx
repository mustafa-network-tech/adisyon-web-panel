import type { Metadata } from "next";
import { PwaRegistrar } from "@/components/pwa-registrar";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "MK Adisyon | Yeni nesil restoran yönetimi",
    template: "%s | MK Adisyon",
  },
  description:
    "Masa, sipariş, mutfak ve kasa operasyonlarını tek merkezde buluşturan yeni nesil restoran yönetim platformu.",
  applicationName: "MK Adisyon",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/app-icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/app-icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MK Adisyon",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className="h-full antialiased">
      <body className="min-h-full">
        <PwaRegistrar />
        {children}
      </body>
    </html>
  );
}
