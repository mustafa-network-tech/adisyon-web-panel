import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Hammer, LifeBuoy, Rocket } from "lucide-react";
import { requireWorkspaceAccess } from "@/lib/auth/access";
import { formatTl } from "@/lib/pricing";
import { CatalogManager } from "@/modules/catalog/components/catalog-manager";
import { getCatalogSnapshot } from "@/modules/catalog/repository";
import { chooseSelfSetupAction, completeSetupStepAction, reopenSetupStepAction } from "@/modules/onboarding/actions";
import { AssistedRequestForm } from "@/modules/onboarding/components/assisted-request-form";
import { SetupActionForm } from "@/modules/onboarding/components/setup-action-form";
import { StartTrialForm } from "@/modules/onboarding/components/start-trial-form";
import { planForCode } from "@/modules/onboarding/plans";
import { getOnboarding, getReadiness, isTenantOwner } from "@/modules/onboarding/repository";
import { deriveStatus, resolveStep, setupSteps, statusLabels, type OnboardingState, type Readiness } from "@/modules/onboarding/status";
import { getPlanUsage } from "@/modules/plan/repository";
import { StationManager } from "@/modules/stations/components/station-manager";
import { DiningManager } from "@/modules/tables/components/dining-manager";
import { getDiningSnapshot } from "@/modules/tables/repository";

export const metadata: Metadata = { title: "İlk kurulum" };
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tenant: string; branch: string }>;
  searchParams: Promise<{ adim?: string; yontem?: string }>;
};

const card = "rounded-[24px] border border-[#dfe5e1] bg-white p-5 sm:p-7";

export default async function SetupPage({ params, searchParams }: PageProps) {
  const { tenant, branch } = await params;
  const query = await searchParams;
  const context = await requireWorkspaceAccess(tenant, branch);
  const base = `/app/${tenant}/${branch}`;

  const onboarding = await getOnboarding(context.tenantId);
  // Businesses created before the setup flow existed, or users who cannot manage settings.
  if (!onboarding) redirect(`${base}/masalar`);

  const [usage, owner] = await Promise.all([getPlanUsage(context.tenantId, context.branchId), isTenantOwner(context.tenantId, context.userId)]);
  const derived = deriveStatus(onboarding, usage ? { status: usage.status ?? "trial", endsAt: usage.endsAt } : null);
  const plan = planForCode(onboarding.selectedPlan);

  return (
    <section className="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[color:var(--c-accent)]">İlk kurulum</p>
      <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">{context.tenantName}</h1>
      <p className="mt-2 text-sm font-semibold leading-6 text-[#5e6a65]">
        Seçtiğiniz paket: <strong>{plan.name}</strong> · Durum: <strong>{statusLabels[derived]}</strong>
      </p>
      <p className="mt-2 max-w-3xl rounded-2xl bg-[#f1f6f3] p-4 text-sm font-semibold leading-6 text-[#2f4f43]">
        Deneme süreniz, işletmenizin ilk kurulumu tamamlanıp kullanıma hazır hâle gelmesinden sonra başlar.
      </p>

      {!owner && (
        <p role="status" className="mt-5 rounded-2xl bg-[#fff8e7] p-4 text-sm font-bold text-[#8a6415]">
          Kurulumu yalnızca işletme sahibi yönetebilir. Durumu bu sayfadan izleyebilirsiniz.
        </p>
      )}

      <div className="mt-6">
        {derived === "trial_active" || derived === "trial_ended" || derived === "subscription_active"
          ? <Finished base={base} derived={derived} />
          : <SetupBody tenant={tenant} branch={branch} base={base} owner={owner} onboarding={onboarding} query={query} tenantId={context.tenantId} branchId={context.branchId} usage={usage} planPrice={formatTl(plan.regularPrice)} />}
      </div>
    </section>
  );
}

function Finished({ base, derived }: { base: string; derived: "trial_active" | "trial_ended" | "subscription_active" }) {
  return (
    <div className={card}>
      <h2 className="text-xl font-black">{derived === "trial_ended" ? "Deneme süreniz sona erdi" : "Kurulum tamamlandı"}</h2>
      <p className="mt-2 text-sm leading-6 text-[#5e6a65]">
        {derived === "trial_ended" ? "Verileriniz saklanıyor. Paketinizi etkinleştirmek için paket etkinleştirme sayfasına gidin." : "İşletmeniz kullanımda."}
      </p>
      <Link href={derived === "trial_ended" ? `${base}/paket` : `${base}/masalar`} className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl bg-[color:var(--c-ink)] px-5 text-sm font-black text-white">
        {derived === "trial_ended" ? "Paketi etkinleştir" : "Masalara git"} <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}

async function SetupBody({ tenant, branch, base, owner, onboarding, query, tenantId, branchId, usage, planPrice }: {
  tenant: string; branch: string; base: string; owner: boolean; onboarding: OnboardingState; query: { adim?: string; yontem?: string };
  tenantId: string; branchId: string; usage: Awaited<ReturnType<typeof getPlanUsage>>; planPrice: string;
}) {
  const { status } = onboarding;

  if (status === "trial_ready") {
    return (
      <div className={`${card} space-y-5`}>
        <div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-xl bg-[#dff3eb] text-[#176e56]"><Rocket size={22} aria-hidden="true" /></span><h2 className="text-xl font-black">İşletmeniz denemeye hazır</h2></div>
        <p className="text-sm leading-6 text-[#5e6a65]">Salonlar, masalar, mutfak istasyonları ve menü hazır. Masalarınızın QR kodları otomatik oluşturuldu; ayarlardaki QR menü sayfasından indirip yazdırabilirsiniz. Denemeyi başlattığınızda 7 gün işlemeye başlar. Sonrasında paket etkinleştirmesi manuel yapılır ({planPrice}/ay + KDV, kampanya koşulları fiyat listesindedir).</p>
        {owner && <StartTrialForm tenant={tenant} branch={branch} />}
        {owner && onboarding.method === "self" && (
          <SetupActionForm action={reopenSetupStepAction} tenant={tenant} branch={branch} hidden={{ step: "1" }} label="Kurulumu düzenlemeye devam et" variant="light" />
        )}
      </div>
    );
  }

  if (status === "method_pending" || query.yontem === "destek") {
    if (query.yontem === "destek" && status !== "assisted_in_progress" && status !== "setup_completed") {
      return <SupportRequest tenant={tenant} branch={branch} base={base} owner={owner} onboarding={onboarding} />;
    }
    return <MethodChooser tenant={tenant} branch={branch} base={base} owner={owner} />;
  }

  if (status === "self_in_progress") {
    return <Wizard tenant={tenant} branch={branch} base={base} owner={owner} onboarding={onboarding} requestedStep={Number(query.adim) || null} tenantId={tenantId} branchId={branchId} usage={usage} />;
  }

  return <AssistedStatus tenant={tenant} branch={branch} base={base} owner={owner} onboarding={onboarding} />;
}

function MethodChooser({ tenant, branch, base, owner }: { tenant: string; branch: string; base: string; owner: boolean }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-black tracking-[-0.03em]">Kurulumu nasıl yapmak istersiniz?</h2>
        <p className="mt-2 text-sm leading-6 text-[#5e6a65]">Adisyon Web&apos;i 7 gün ücretsiz deneyin. Salonlarınızı, masalarınızı, mutfak istasyonlarınızı ve menünüzü kendiniz oluşturabilir veya ilk kurulumu MK Digital Systems ekibine bırakabilirsiniz.</p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <div className={card}>
          <span className="grid size-12 place-items-center rounded-xl bg-[color:var(--c-accent-soft)] text-[color:var(--c-accent-d2)]"><Hammer size={22} aria-hidden="true" /></span>
          <h3 className="mt-4 text-xl font-black">Kendim kuracağım</h3>
          <p className="mt-2 text-sm leading-6 text-[#5e6a65]">Dört kısa adımda salonlarınızı, masalarınızı, mutfak istasyonlarınızı ve menünüzü kendiniz oluşturursunuz. İlerlemeniz kaydedilir; kaldığınız yerden devam edebilirsiniz.</p>
          {owner && <SetupActionForm action={chooseSelfSetupAction} tenant={tenant} branch={branch} label="Kendim kuracağım" pendingLabel="Hazırlanıyor…" variant="primary" className="mt-5" />}
        </div>
        <div className={card}>
          <span className="grid size-12 place-items-center rounded-xl bg-[#e8f0fb] text-[#285e9f]"><LifeBuoy size={22} aria-hidden="true" /></span>
          <h3 className="mt-4 text-xl font-black">MK Digital Systems kursun</h3>
          <p className="mt-2 text-sm leading-6 text-[#5e6a65]">Bize salonlarınızı, masalarınızı, mutfak istasyonlarınızı ve menünüzü iletirsiniz; ekibimiz bu dört alanı sizin adınıza hazırlar. Şube, personel, yetki ve ödeme ayarlarını siz yönetirsiniz.</p>
          {owner && <Link href={`${base}/kurulum?yontem=destek`} className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl border border-[#d6ddd9] bg-white px-5 text-sm font-black hover:border-[#aeb9b3]">Kurulum desteği al</Link>}
        </div>
      </div>
    </div>
  );
}

function SupportRequest({ tenant, branch, base, owner, onboarding }: { tenant: string; branch: string; base: string; owner: boolean; onboarding: OnboardingState }) {
  return (
    <div className={`${card} space-y-5`}>
      <Link href={`${base}/kurulum`} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#5e6a65] hover:text-[color:var(--c-ink)]"><ArrowLeft size={16} aria-hidden="true" /> Yönteme dön</Link>
      <h2 className="text-2xl font-black tracking-[-0.03em]">Kurulum desteği al</h2>
      <p className="text-sm leading-6 text-[#5e6a65]">MK Digital Systems ekibi yalnızca şu dört alanı sizin adınıza hazırlar: salonlar, masalar, mutfak istasyonları ve menü. Aşağıdaki bilgileri paylaşın. Daha önce kendi girdiğiniz kayıtlar silinmez.</p>
      {owner
        ? <AssistedRequestForm tenant={tenant} branch={branch} initial={onboarding.requestPayload} submitLabel="Kurulum talebini gönder" />
        : <p className="text-sm font-bold text-[#8a6415]">Talebi yalnızca işletme sahibi gönderebilir.</p>}
    </div>
  );
}

function AssistedStatus({ tenant, branch, base, owner, onboarding }: { tenant: string; branch: string; base: string; owner: boolean; onboarding: OnboardingState }) {
  const { status } = onboarding;
  const canSwitch = status === "assisted_requested" || status === "info_needed";
  return (
    <div className="space-y-5">
      <div className={`${card} space-y-4`}>
        <h2 className="text-xl font-black">{statusLabels[status]}</h2>
        {status === "assisted_requested" && <p className="text-sm leading-6 text-[#5e6a65]">Talebiniz MK Digital Systems ekibine ulaştı. Hazırlık başladığında durum burada güncellenir.</p>}
        {status === "assisted_in_progress" && <p className="text-sm leading-6 text-[#5e6a65]">Ekibimiz salonlarınızı, masalarınızı, mutfak istasyonlarınızı ve menünüzü hazırlıyor.</p>}
        {status === "setup_completed" && <p className="text-sm leading-6 text-[#5e6a65]">Hazırlık tamamlandı; son kontroller yapılıyor. Kısa süre içinde işletmeniz denemeye hazır olarak işaretlenecek.</p>}
        {status === "info_needed" && (
          <p role="status" className="rounded-xl bg-[#fff8e7] p-4 text-sm font-bold leading-6 text-[#8a6415]">Ekibimizden bilgi talebi: {onboarding.adminNote}</p>
        )}
      </div>
      {status === "info_needed" && owner && (
        <div className={card}>
          <h3 className="text-lg font-black">Bilgileri güncelleyin</h3>
          <p className="mb-4 mt-1 text-sm text-[#5e6a65]">Eksik bilgiyi ilgili alana ekleyip gönderin.</p>
          <AssistedRequestForm tenant={tenant} branch={branch} initial={onboarding.requestPayload} submitLabel="Bilgileri gönder" />
        </div>
      )}
      {status !== "info_needed" && (
        <details className={card}>
          <summary className="cursor-pointer text-sm font-black">İlettiğiniz bilgiler</summary>
          <dl className="mt-4 space-y-4 text-sm">
            {setupSteps.map((step) => (
              <div key={step.id}><dt className="font-black">{step.label}</dt><dd className="mt-1 whitespace-pre-wrap text-[#5e6a65]">{onboarding.requestPayload[step.id] || "—"}</dd></div>
            ))}
          </dl>
        </details>
      )}
      {canSwitch && owner && (
        <div className="flex flex-wrap items-center gap-3">
          <SetupActionForm action={chooseSelfSetupAction} tenant={tenant} branch={branch} label="Bunun yerine kendim kuracağım" pendingLabel="Hazırlanıyor…" variant="light" />
          <p className="text-xs leading-5 text-[#5e6a65]">Talebiniz iptal edilir; MK Digital Systems&apos;in girdiği kayıtlar varsa silinmez.</p>
        </div>
      )}
      <Link href={`${base}/ayarlar`} className="inline-block text-sm font-bold text-[#5e6a65] underline underline-offset-4">Ayarlara git</Link>
    </div>
  );
}

async function Wizard({ tenant, branch, base, owner, onboarding, requestedStep, tenantId, branchId, usage }: {
  tenant: string; branch: string; base: string; owner: boolean; onboarding: OnboardingState; requestedStep: number | null;
  tenantId: string; branchId: string; usage: Awaited<ReturnType<typeof getPlanUsage>>;
}) {
  const stepNumber = resolveStep(requestedStep, onboarding);
  const step = setupSteps[stepNumber - 1];
  const [readiness, dining, catalog] = await Promise.all([
    getReadiness(tenantId),
    stepNumber <= 2 ? getDiningSnapshot(tenantId, branchId) : Promise.resolve(null),
    stepNumber >= 3 ? getCatalogSnapshot(tenantId, branchId) : Promise.resolve(null),
  ]);
  const ready: Readiness = readiness ?? { areas: false, tables: false, stations: false, menu: false };
  const completed = onboarding.completedSteps;
  const stepReady = ready[step.id];

  return (
    <div className="space-y-5">
      <nav aria-label="Kurulum adımları">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {setupSteps.map((item, index) => {
            const number = index + 1;
            const done = completed.includes(item.id);
            const current = number === stepNumber;
            const reachable = done || number <= (completed.length === 4 ? 4 : setupSteps.findIndex((s) => !completed.includes(s.id)) + 1);
            const inner = (
              <>
                <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-black ${done ? "bg-[#176e56] text-white" : current ? "bg-[color:var(--c-accent-d3)] text-white" : "bg-[#e8ecea] text-[#5e6a65]"}`}>
                  {done ? <Check size={14} aria-hidden="true" /> : number}
                </span>
                <span className="text-sm font-black">{item.short}</span>
                {done && <span className="sr-only">(tamamlandı)</span>}
              </>
            );
            const classes = `flex min-h-12 items-center gap-2 rounded-xl border px-3 ${current ? "border-[color:var(--c-accent-d3)] bg-[color:var(--c-accent-soft)]" : "border-[#dfe5e1] bg-white"}`;
            return (
              <li key={item.id}>
                {reachable
                  ? <Link href={`${base}/kurulum?adim=${number}`} aria-current={current ? "step" : undefined} className={classes}>{inner}</Link>
                  : <span className={`${classes} opacity-60`}>{inner}</span>}
              </li>
            );
          })}
        </ol>
      </nav>

      <div>
        <h2 className="text-2xl font-black tracking-[-0.03em]">{stepNumber}. {step.label}</h2>
        <p className="mt-1 text-sm leading-6 text-[#5e6a65]">{step.help}</p>
      </div>

      {dining && stepNumber === 1 && <DiningManager tenant={tenant} branch={branch} {...dining} focus="areas" />}
      {dining && stepNumber === 2 && (dining.areas.length === 0
        ? <p className="rounded-2xl bg-[#fff8e7] p-4 text-sm font-bold text-[#8a6415]">Masa eklemek için önce bir salon oluşturun.</p>
        : <DiningManager tenant={tenant} branch={branch} {...dining} focus="tables" />)}
      {catalog && stepNumber === 3 && <StationManager tenant={tenant} branch={branch} stations={catalog.kitchenStations} products={catalog.products} categories={catalog.categories} usage={usage} />}
      {catalog && stepNumber === 4 && <CatalogManager tenant={tenant} branch={branch} canAvailability={false} {...catalog} />}

      <div className={`${card} flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`}>
        <div>
          <p className="text-sm font-black">{stepReady ? "Bu adım için kayıtlarınız hazır." : "Devam etmek için en az bir kayıt ekleyin."}</p>
          {stepNumber === 2 && <p className="mt-1 text-xs text-[#5e6a65]">Her masa için QR kod otomatik oluşur; ayrıca bir işlem gerekmez.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {stepNumber > 1 && <Link href={`${base}/kurulum?adim=${stepNumber - 1}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-[#d6ddd9] bg-white px-4 text-sm font-black"><ArrowLeft size={16} aria-hidden="true" /> Önceki adım</Link>}
          {owner && <SetupActionForm action={completeSetupStepAction} tenant={tenant} branch={branch} hidden={{ step: step.id }} label={stepNumber === 4 ? "Kurulumu tamamla" : "Adımı tamamla ve devam et"} pendingLabel="Kaydediliyor…" variant="primary" />}
        </div>
      </div>

      {owner && (
        <p className="text-sm text-[#5e6a65]">
          Yardım mı istiyorsunuz?{" "}
          <Link href={`${base}/kurulum?yontem=destek`} className="font-black text-[color:var(--c-accent-d4)] underline underline-offset-4">Kurulum desteği al</Link>
          . Şimdiye kadar eklediğiniz kayıtlar silinmez.
        </p>
      )}
    </div>
  );
}
