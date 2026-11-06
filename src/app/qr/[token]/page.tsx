import type { Metadata } from "next";
import { resolveTheme } from "@/modules/theme/themes";
import { ServiceButtons } from "@/modules/qr/components/service-buttons";
import { PublicMenuView } from "@/modules/qr/components/public-menu";
import { getPublicMenu } from "@/modules/qr/repository";

export const metadata: Metadata = {
  title: "Menü",
  robots: { index: false, follow: false, nocache: true },
};
export const dynamic = "force-dynamic";

export default async function QrMenuPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const menu = await getPublicMenu(token);

  if (!menu) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-6 text-center">
        <div>
          <h1 className="text-2xl font-black">Menü bulunamadı</h1>
          <p className="mt-2 text-sm font-semibold text-[#68736e]">
            Bu QR kod geçerli değil ya da menü şu anda kapalı. Lütfen garsondan yardım isteyin.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main data-theme={resolveTheme(menu.theme)} className="mx-auto min-h-dvh max-w-2xl px-4 pt-6">
      <header>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[color:var(--c-accent)]">
          {menu.branchName}
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-[-0.04em]">{menu.brandName}</h1>
        <p className="mt-2 inline-block rounded-full bg-[color:var(--c-ink)] px-3 py-1 text-xs font-black text-white">
          {menu.tableLabel}
        </p>
        <ServiceButtons token={token} />
        <p className="mt-4 rounded-2xl border border-[#dfe5e1] bg-white p-4 text-sm font-semibold text-[#68736e]">
          Siparişinizi garsonumuza iletebilirsiniz. Fiyatlara KDV dahildir.
        </p>
      </header>
      {menu.categories.length === 0 ? (
        <p className="mt-10 text-center text-sm font-semibold text-[#68736e]">
          Menü henüz hazırlanmadı.
        </p>
      ) : (
        <PublicMenuView menu={menu} />
      )}
    </main>
  );
}
