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
