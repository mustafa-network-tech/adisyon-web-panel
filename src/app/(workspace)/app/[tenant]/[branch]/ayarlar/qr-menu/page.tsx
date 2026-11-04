import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { ArrowLeft } from "lucide-react";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { QrManager } from "@/modules/qr/components/qr-manager";
import { getQrAdminSnapshot } from "@/modules/qr/repository";

export const metadata: Metadata = { title: "QR menü" };
export const dynamic = "force-dynamic";

async function resolveOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
  const proto = requestHeaders.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

export default async function QrMenuSettingsPage({
  params,
}: {
  params: Promise<{ tenant: string; branch: string }>;
}) {
  const { tenant, branch } = await params;
  const context = await requireWorkspacePermission(tenant, branch, ["settings.manage"]);
  const [snapshot, origin] = await Promise.all([
    getQrAdminSnapshot(context.tenantId, context.branchId),
    resolveOrigin(),
  ]);

  const tables = await Promise.all(
    snapshot.tables.map(async (table) => {
      const url = `${origin}/qr/${table.qrToken}`;
      const svg = await QRCode.toString(url, {
        type: "svg",
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#17211d", light: "#ffffff" },
      });
      return { id: table.id, label: table.label, areaName: table.areaName, url, svg };
    }),
  );

  return (
    <section className="p-4 sm:p-6 lg:p-8">
      <Link
        href={`/app/${tenant}/${branch}/ayarlar`}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dce3df] bg-white px-4 text-sm font-bold print:hidden"
      >
        <ArrowLeft size={16} /> Ayarlara dön
      </Link>
      <div className="mb-7 mt-6 print:hidden">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#e8623a]">Dijital menü</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">QR menü</h1>
        <p className="mt-2 text-sm font-semibold text-[#7a8580]">
          {context.branchName} için masalara özel QR kodları oluşturun ve müşteri sipariş modunu seçin.
        </p>
      </div>
      <QrManager
        tenant={tenant}
        branch={branch}
        orderingEnabled={snapshot.orderingEnabled}
        tables={tables}
      />
    </section>
  );
}
