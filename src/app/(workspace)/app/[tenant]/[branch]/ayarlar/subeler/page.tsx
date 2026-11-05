import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { contactEmail, whatsappDisplay, whatsappLink } from "@/lib/site";
import { BranchForm } from "@/modules/branches/components/branch-form";
import { getPlanUsage } from "@/modules/plan/repository";
import { planName } from "@/modules/plan/usage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Şubeler" };
export const dynamic = "force-dynamic";

export default async function BranchesSettingsPage({ params }: { params: Promise<{ tenant: string; branch: string }> }) {
  const { tenant, branch } = await params;
  const context = await requireWorkspacePermission(tenant, branch, ["settings.manage"]);
  const supabase = await createSupabaseServerClient();
  const [usage, { data }] = await Promise.all([
    getPlanUsage(context.tenantId, context.branchId),
    supabase.from("branches").select("slug, name, is_active").eq("tenant_id", context.tenantId).order("created_at", { ascending: true }),
  ]);
  const branches = (data ?? []).filter((item) => item.is_active) as Array<{ slug: string; name: string; is_active: boolean }>;
  const limit = usage?.branchLimit ?? 1;
  const full = branches.length >= limit;

  return (
    <section className="p-4 sm:p-6 lg:p-8">
      <Link href={`/app/${tenant}/${branch}/ayarlar`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dce3df] bg-white px-4 text-sm font-bold"><ArrowLeft size={16} aria-hidden="true" /> Ayarlara dön</Link>
      <div className="mb-7 mt-6">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[color:var(--c-accent)]">İşletme</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Şubeler</h1>
        <p className="mt-2 text-sm font-semibold text-[#5e6a65]">Paketiniz: <strong>{planName(usage?.planCode ?? null)}</strong> · Şube: <strong>{branches.length} / {limit}</strong></p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {branches.map((item) => (
          <li key={item.slug} className="rounded-[22px] border border-[#dfe5e1] bg-white p-5">
            <span className="grid size-10 place-items-center rounded-xl bg-[color:var(--c-accent-soft)] text-[color:var(--c-accent-d2)]"><Building2 size={18} aria-hidden="true" /></span>
            <h2 className="mt-3 text-lg font-black">{item.name}</h2>
            <Link href={`/app/${tenant}/${item.slug}/masalar`} className="mt-3 inline-block text-sm font-black text-[color:var(--c-accent-d4)] underline-offset-4 hover:underline">
              {item.slug === branch ? "Şu anki şube" : "Bu şubeye geç"}
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-6 max-w-xl rounded-[22px] border border-[#dfe5e1] bg-white p-5 sm:p-6">
        {full ? (
          <>
            <h2 className="text-lg font-black">Şube sınırına ulaştınız</h2>
            <p className="mt-2 text-sm leading-6 text-[#5e6a65]">
              {limit > 1
                ? `Paketiniz ${limit} şubeye kadar kullanım sunuyor.`
                : "Paketiniz tek şube içeriyor."}{" "}
              Daha fazla şube için Çok Şubeli pakete geçebilirsiniz; bize yazın, ekibimiz paketinizi etkinleştirsin.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <a href={`mailto:${contactEmail}?subject=${encodeURIComponent(`Çok Şubeli paket talebi - ${context.tenantName}`)}`} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[color:var(--c-ink)] px-4 text-sm font-black text-white">{contactEmail}</a>
              <a href={whatsappLink(`Merhaba, ${context.tenantName} için Çok Şubeli pakete geçmek istiyorum.`)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#25d366] px-4 text-sm font-black text-white">WhatsApp: {whatsappDisplay}</a>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-black">Yeni şube ekle</h2>
            <p className="mb-4 mt-1 text-sm leading-6 text-[#5e6a65]">Yeni şube boş başlar: salonlarını, masalarını ve menüsünü ayrıca kurarsınız. Kullanıcı yetkileri şube bazlıdır.</p>
            <BranchForm tenant={tenant} branch={branch} />
          </>
        )}
      </div>
    </section>
  );
}
