import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Circle } from "lucide-react";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth/access";
import { planForCode } from "@/modules/onboarding/plans";
import { getReadiness } from "@/modules/onboarding/repository";
import { deriveStatus, isAssistedOpen, platformNextStatuses, setupSteps, statusLabels, type SetupStatus } from "@/modules/onboarding/status";
import { SectionForm, StatusForm } from "@/modules/platform-admin/components/setup-forms";
import { getSetupDetail } from "@/modules/platform-admin/setup-data";

export const metadata: Metadata = { title: "Kurulum talebi", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";

const sections = [
  { id: "areas", label: "Salonlar", hint: "Her satıra bir salon adı.", rows: 4 },
  { id: "tables", label: "Masalar", hint: "Salon adı: Masa 1-10, VIP (8)  — kapasite parantez içinde, isteğe bağlı. Masa başına QR kod otomatik oluşur.", rows: 5 },
  { id: "stations", label: "Mutfak istasyonları", hint: "İstasyon adı veya İstasyon adı: Kategori 1, Kategori 2 (kategorideki ürünler istasyona yönlendirilir).", rows: 4 },
  { id: "menu", label: "Menü", hint: "Kategori | Ürün | Fiyat | Açıklama | İstasyon — son iki alan isteğe bağlı. Salon, masa ve istasyonlar yukarıda oluşturulmuş olmalı.", rows: 8 },
] as const;

const actionLabels: Record<SetupStatus, string> = {
  method_pending: "",
  self_in_progress: "",
  assisted_requested: "Talebi al",
  info_needed: "Eksik bilgi iste",
  assisted_in_progress: "Hazırlığa başla",
  setup_completed: "Kurulum tamamlandı olarak işaretle",
  trial_ready: "Denemeye hazır yap",
};

export default async function SetupDetailPage({ params }: { params: Promise<{ tenantId: string }> }) {
  await requirePlatformAdmin();
  const { tenantId } = await params;
  if (!z.uuid().safeParse(tenantId).success) notFound();
  const detail = await getSetupDetail(tenantId);
  if (!detail) notFound();

  const { onboarding, tenantName, subscription } = detail;
  const readiness = await getReadiness(tenantId);
  const derived = deriveStatus(onboarding, subscription);
  const open = isAssistedOpen(onboarding.status, onboarding.method, onboarding.trialStartedAt);
  const next = onboarding.method === "assisted" && !onboarding.trialStartedAt ? platformNextStatuses(onboarding.status) : [];
  const plan = planForCode(onboarding.selectedPlan);

  return (
    <main className="min-h-dvh bg-[#f4f6f8]">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <Link href="/mk-admin" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dce3df] bg-white px-4 text-sm font-bold"><ArrowLeft size={16} aria-hidden="true" /> Platform yönetimi</Link>
        <p className="mt-6 text-xs font-black uppercase tracking-[0.16em] text-[color:var(--c-accent)]">Kurulum talebi</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">{tenantName}</h1>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Paket", plan.name],
            ["Kurulum yöntemi", onboarding.method === "assisted" ? "MK Digital Systems kursun" : onboarding.method === "self" ? "Kendim kuracağım" : "Seçilmedi"],
            ["Durum", statusLabels[derived]],
            ["Deneme", onboarding.trialStartedAt ? "Başlatıldı" : "Başlamadı"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-[#dfe5e1] bg-white p-4"><dt className="text-xs font-bold text-[#5e6a65]">{label}</dt><dd className="mt-1 text-sm font-black">{value}</dd></div>
          ))}
        </dl>

        <section className="mt-5 rounded-[22px] border border-[#dfe5e1] bg-white p-5" aria-labelledby="hazirlik">
          <h2 id="hazirlik" className="text-lg font-black">Kayıtlı veriler</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {setupSteps.map((step) => (
              <li key={step.id} className="flex items-center gap-2 text-sm font-bold">
                {readiness?.[step.id] ? <Check size={16} className="text-[#176e56]" aria-hidden="true" /> : <Circle size={16} className="text-[#aeb9b3]" aria-hidden="true" />}
                {step.label} <span className="sr-only">{readiness?.[step.id] ? "hazır" : "eksik"}</span>
              </li>
            ))}
          </ul>
        </section>

        {onboarding.adminNote && onboarding.status === "info_needed" && (
          <p className="mt-5 rounded-2xl bg-[#fff8e7] p-4 text-sm font-bold text-[#8a6415]">İşletmeden istenen bilgi: {onboarding.adminNote}</p>
        )}

        {onboarding.method !== "assisted" && (
          <p className="mt-5 rounded-2xl bg-white p-5 text-sm font-semibold text-[#5e6a65]">Bu işletme kurulum desteği istemedi. Platform bu işletme adına kurulum yapamaz.</p>
        )}

        {onboarding.method === "assisted" && (
          <>
            <section className="mt-5 rounded-[22px] border border-[#dfe5e1] bg-white p-5" aria-labelledby="durum">
              <h2 id="durum" className="text-lg font-black">Durum işlemleri</h2>
              {next.length === 0
                ? <p className="mt-2 text-sm text-[#5e6a65]">Bu durumda yapılacak bir geçiş yok.{onboarding.trialStartedAt ? " İşletme denemesini başlattı." : ""}</p>
                : <div className="mt-4 grid gap-4 sm:grid-cols-2">{next.map((status) => <StatusForm key={status} tenantId={tenantId} status={status} label={actionLabels[status]} needsNote={status === "info_needed"} primary={status === "trial_ready"} />)}</div>}
              <p className="mt-4 text-xs leading-5 text-[#5e6a65]">Denemeyi yalnızca işletme sahibi başlatır. &quot;Denemeye hazır&quot; için dört alanda da kayıt olmalıdır.</p>
            </section>

            <h2 className="mb-3 mt-8 text-lg font-black">İşletmenin ilettiği bilgiler ve kurulum</h2>
            {!open && <p className="mb-4 rounded-2xl bg-[#f1f6f3] p-4 text-sm font-semibold text-[#2f4f43]">Bu aşamada işletme adına kayıt oluşturulamaz.</p>}
            <div className="space-y-4">
              {sections.map((section) => (
                open
                  ? <SectionForm key={section.id} tenantId={tenantId} section={section.id} label={section.label} hint={section.hint} initial={onboarding.requestPayload[section.id] ?? ""} rows={section.rows} />
                  : <div key={section.id} className="rounded-[22px] border border-[#dfe5e1] bg-white p-5"><h3 className="text-sm font-black">{section.label}</h3><pre className="mt-2 whitespace-pre-wrap text-sm text-[#5e6a65]">{onboarding.requestPayload[section.id] || "—"}</pre></div>
              ))}
              {onboarding.requestPayload.notes && <p className="rounded-2xl bg-white p-5 text-sm"><strong>Ek not:</strong> {onboarding.requestPayload.notes}</p>}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
