import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";
import { requireWorkspaceAccess } from "@/lib/auth/access";
import { formatTl, includedInAllPlans, pricingPlans } from "@/lib/pricing";
import { contactEmail, whatsappDisplay, whatsappLink } from "@/lib/site";
import { WhatsappIcon } from "@/components/marketing/whatsapp-icon";
import { getPlanUsage } from "@/modules/plan/repository";
import { planName, readOnlyBanner } from "@/modules/plan/usage";

export const metadata: Metadata = { title: "Paket etkinleştirme" };
export const dynamic = "force-dynamic";

/**
 * Where an owner lands when the free trial has ended. Subscriptions are
 * activated by hand (no online payment), so this page only explains how.
 */
export default async function ActivationPage({ params }: { params: Promise<{ tenant: string; branch: string }> }) {
  const { tenant, branch } = await params;
  const context = await requireWorkspaceAccess(tenant, branch);
  const usage = await getPlanUsage(context.tenantId, context.branchId);
  const ended = usage ? !usage.writable : false;
  const subject = encodeURIComponent(`Adisyon Web paket etkinleştirme - ${context.tenantName}`);

  return (
    <section className="mx-auto w-full max-w-4xl p-4 sm:p-6 lg:p-8">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[color:var(--c-accent)]">Paket etkinleştirme</p>
      <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">{context.tenantName}</h1>
      <p className="mt-3 text-sm font-semibold leading-6 text-[#5e6a65]">
        Mevcut paket: <strong>{planName(usage?.planCode ?? null)}</strong>
        {ended && usage ? ` · ${readOnlyBanner(usage.status)}` : ""}
      </p>
      <div className="mt-5 rounded-[24px] border border-[#dfe5e1] bg-white p-5 sm:p-7">
        <h2 className="text-xl font-black">Nasıl devam edersiniz?</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-[#33413b]">
          <li>Aşağıdaki paketlerden birini seçin.</li>
          <li>Bize e-posta veya WhatsApp ile yazın; paketinizi ekibimiz manuel olarak etkinleştirir. Çevrim içi ödeme veya otomatik tahsilat yoktur.</li>
          <li>Etkinleştirmeden sonra hesabınız yeniden yazılabilir olur. Verileriniz deneme süresince ve sonrasında silinmez.</li>
        </ol>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <a href={`mailto:${contactEmail}?subject=${subject}`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[color:var(--c-ink)] px-5 text-sm font-black text-white"><Mail size={16} aria-hidden="true" /> {contactEmail}</a>
          <a href={whatsappLink(`Merhaba, ${context.tenantName} için Adisyon Web paketini etkinleştirmek istiyorum.`)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#25d366] px-5 text-sm font-black text-white"><WhatsappIcon size={16} /> WhatsApp: {whatsappDisplay}</a>
        </div>
      </div>
      <ul className="mt-5 grid gap-4 md:grid-cols-3">
        {pricingPlans.map((plan) => (
          <li key={plan.id} className="rounded-[22px] border border-[#dfe5e1] bg-white p-5">
            <h3 className="text-lg font-black">{plan.name}</h3>
            <p className="mt-1 text-xs leading-5 text-[#5e6a65]">{plan.tagline}</p>
            <p className="mt-3 text-2xl font-black">{formatTl(plan.regularPrice)}<span className="text-sm font-bold text-[#5e6a65]">/ay + KDV</span></p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs leading-5 text-[#5e6a65]">Tüm paketlerde: {includedInAllPlans.slice(0, 3).join(", ").toLowerCase()} ve daha fazlası. Güncel kampanya koşulları için <Link href="/#fiyatlar" className="font-bold underline">fiyat listesine</Link> bakın.</p>
    </section>
  );
}
