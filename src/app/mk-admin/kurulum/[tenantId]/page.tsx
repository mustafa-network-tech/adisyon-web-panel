import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Circle } from "lucide-react";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth/access";
import { planForCode } from "@/modules/onboarding/plans";
import { getReadiness } from "@/modules/onboarding/repository";
import { deriveStatus, platformNextStatuses, setupSteps, statusLabels, type SetupStatus } from "@/modules/onboarding/status";
import { SectionForm, StatusForm } from "@/modules/platform-admin/components/setup-forms";
import { getSetupDetail } from "@/modules/platform-admin/setup-data";

export const metadata: Metadata = { title: "İşletme kurulumu", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";

const sections = [
  { id: "areas", label: "Salonlar", hint: "Her satıra bir salon adı.", rows: 4, placeholder: "Salon\nBahçe" },
  { id: "tables", label: "Masalar", hint: "Salon adı: 8 masa — ya da — Salon adı: Masa 1-10, VIP (8). Kapasite parantez içinde, isteğe bağlı. Masa başına QR kod otomatik oluşur. Önce salonları oluşturun.", rows: 5, placeholder: "Salon: 8 masa\nBahçe: 3 masa (4)" },
  { id: "stations", label: "Mutfak istasyonları", hint: "İstasyon adı veya İstasyon adı: Kategori 1, Kategori 2 (o kategorideki ürünler istasyona yönlendirilir).", rows: 4, placeholder: "Mutfak\nBar: İçecek" },
  { id: "menu", label: "Menü", hint: "Kategori | Ürün | Fiyat | Açıklama | İstasyon — son iki alan isteğe bağlı. İstasyon adı yukarıda oluşturulmuş olmalı.", rows: 8, placeholder: "İçecek | Kola | 25\nMeze | Cacık | 30\nYemek | Adana kebap | 365 | Közde | Mutfak" },
] as const;

const actionLabels: Record<SetupStatus, string> = {
  method_pending: "",
  self_in_progress: "",
  assisted_requested: "Talebi al",
  info_needed: "Eksik bilgi iste",
  assisted_in_progress: "Kurulumu ben üstleniyorum",
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
  const derived = onboarding ? deriveStatus(onboarding, subscription) : null;
  // Status moves exist only while the business is still in setup.
  const next = onboarding && !onboarding.trialStartedAt ? platformNextStatuses(onboarding.status, onboarding.method) : [];
  const plan = onboarding ? planForCode(onboarding.selectedPlan).name : "—";
  const requested = onboarding?.requestPayload;

  return (
    <main className="min-h-dvh bg-[#f4f6f8]">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <Link href="/mk-admin" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dce3df] bg-white px-4 text-sm font-bold"><ArrowLeft size={16} aria-hidden="true" /> Platform yönetimi</Link>
        <p className="mt-6 text-xs font-black uppercase tracking-[0.16em] text-[color:var(--c-accent)]">İşletme kurulumu</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">{tenantName}</h1>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Paket", plan],
            ["Kurulum yöntemi", onboarding?.method === "assisted" ? "MK Digital Systems kursun" : onboarding?.method === "self" ? "Kendim kuracağım" : onboarding ? "Seçilmedi" : "Kurulum akışı öncesi işletme"],
            ["Durum", derived ? statusLabels[derived] : "—"],
            ["Deneme", onboarding?.trialStartedAt ? "Başlatıldı" : onboarding ? "Başlamadı" : "—"],
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

        {onboarding?.status === "info_needed" && onboarding.adminNote && (
          <p className="mt-5 rounded-2xl bg-[#fff8e7] p-4 text-sm font-bold text-[#8a6415]">İşletmeden istenen bilgi: {onboarding.adminNote}</p>
        )}

        {(requested?.details || requested?.areas || requested?.menu) && (
          <section className="mt-5 rounded-[22px] border border-[#dfe5e1] bg-white p-5" aria-labelledby="talep">
            <h2 id="talep" className="text-lg font-black">İşletmenin kurulum talebi</h2>
            {requested.details
              ? <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6 text-[#33413b]">{requested.details}</pre>
              : setupSteps.map((step) => <div key={step.id} className="mt-3"><h3 className="text-sm font-black">{step.label}</h3><pre className="whitespace-pre-wrap font-sans text-sm text-[#33413b]">{requested[step.id] || "—"}</pre></div>)}
            {requested.notes && <p className="mt-3 text-sm"><strong>Ek not:</strong> {requested.notes}</p>}
          </section>
        )}

        <section className="mt-5 rounded-[22px] border border-[#dfe5e1] bg-white p-5" aria-labelledby="durum">
          <h2 id="durum" className="text-lg font-black">Durum işlemleri</h2>
          {next.length === 0
            ? <p className="mt-2 text-sm text-[#5e6a65]">{onboarding ? (onboarding.trialStartedAt ? "İşletme denemesini başlattı; durum geçişi yok." : "Bu durumda yapılacak bir geçiş yok.") : "Bu işletme kurulum akışından önce oluşturuldu; durum takibi yok. Aşağıdan doğrudan kayıt oluşturabilirsiniz."}</p>
            : <div className="mt-4 grid gap-4 sm:grid-cols-2">{next.map((status) => <StatusForm key={status} tenantId={tenantId} status={status} label={actionLabels[status]} needsNote={status === "info_needed"} primary={status === "trial_ready" || status === "assisted_in_progress"} />)}</div>}
          <p className="mt-4 text-xs leading-5 text-[#5e6a65]">Denemeyi yalnızca işletme sahibi başlatır. &quot;Denemeye hazır&quot; için dört alanda da kayıt olmalıdır. WhatsApp veya e-postayla gelen işlerde önce &quot;Kurulumu ben üstleniyorum&quot; deyin.</p>
        </section>

        <h2 className="mb-1 mt-8 text-lg font-black">İşletme adına kurulum</h2>
        <p className="mb-4 text-sm leading-6 text-[#5e6a65]">Yalnızca salon, masa, mutfak istasyonu ve menü oluşturulur; mevcut kayıtlar silinmez, aynı isimliler atlanır. Sırayla uygulayın: salonlar, masalar, istasyonlar, menü. Her işlem denetim kaydına yazılır.</p>
        <div className="space-y-4">
          {sections.map((section) => (
            <SectionForm key={section.id} tenantId={tenantId} section={section.id} label={section.label} hint={section.hint} initial="" placeholder={section.placeholder} rows={section.rows} />
          ))}
        </div>
      </div>
    </main>
  );
}
