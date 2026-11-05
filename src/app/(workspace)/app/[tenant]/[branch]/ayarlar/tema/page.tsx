import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ThemePicker } from "@/modules/theme/components/theme-picker";
import { resolveTheme } from "@/modules/theme/themes";

export const metadata: Metadata = { title: "Tema" };
export const dynamic = "force-dynamic";

export default async function ThemeSettingsPage({ params }: { params: Promise<{ tenant: string; branch: string }> }) {
  const { tenant, branch } = await params;
  const context = await requireWorkspacePermission(tenant, branch, ["settings.manage"]);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("tenant_settings").select("theme").eq("tenant_id", context.tenantId).maybeSingle();

  return (
    <section className="p-4 sm:p-6 lg:p-8">
      <Link href={`/app/${tenant}/${branch}/ayarlar`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dce3df] bg-white px-4 text-sm font-bold"><ArrowLeft size={16} /> Ayarlara dön</Link>
      <div className="mb-7 mt-6">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[color:var(--c-accent)]">Görünüm</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Tema</h1>
        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#7a8580]">İşletmenizin renklerini seçin. Tema tüm ekip ekranlarında ve müşterilerinizin gördüğü QR menüde uygulanır. İstediğiniz zaman değiştirebilirsiniz.</p>
      </div>
      <ThemePicker tenant={tenant} branch={branch} current={resolveTheme(data?.theme)} />
    </section>
  );
}
