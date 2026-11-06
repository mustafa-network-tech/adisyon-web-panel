import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Store } from "lucide-react";
import { Brand } from "@/components/brand";
import { requireAuthenticatedUser } from "@/lib/auth/access";
import { resolveDefaultDestination } from "@/lib/auth/destination";
import { signOutAction } from "@/modules/auth/actions";
import Link from "next/link";
import { BusinessForm } from "@/modules/auth/components/business-form";
import { JoinForm } from "@/modules/auth/components/join-form";
import { parseEntry } from "@/modules/onboarding/entry";
import { planIdForCode } from "@/modules/onboarding/plans";
import { formatTl, pricingPlans } from "@/lib/pricing";

export const metadata: Metadata = { title: "İşletmenizi kurun" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const entry = parseEntry(params);
  const joining = params.mod === "katil";
  const identity = await requireAuthenticatedUser("/baslangic");
  const destination = await resolveDefaultDestination(identity.userId);
  if (destination) redirect(destination);

  return (
    <main className="grid min-h-dvh place-items-center bg-[#f4f6f8] p-5">
      <section className="w-full max-w-md rounded-[28px] border border-[#dfe5e1] bg-white p-6 shadow-[0_28px_80px_rgb(23_33_29/0.08)] sm:p-9">
        <Brand />
        <div className="mt-9 grid size-12 place-items-center rounded-xl bg-[color:var(--c-accent-soft)] text-[color:var(--c-accent-d1)]">
          <Store size={22} aria-hidden="true" />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-[#eef1ef] p-1 text-center text-sm font-black">
          <Link href="/baslangic" className={`rounded-lg py-2.5 ${joining ? "text-[#68736e]" : "bg-white text-[color:var(--c-ink)] shadow-sm"}`}>İşletme oluştur</Link>
          <Link href="/baslangic?mod=katil" className={`rounded-lg py-2.5 ${joining ? "bg-white text-[color:var(--c-ink)] shadow-sm" : "text-[#68736e]"}`}>Mevcut işletmeye katıl</Link>
        </div>
        {joining ? (
          <>
            <h1 className="mt-5 text-3xl font-black tracking-[-0.04em] text-[color:var(--c-ink)]">İşletmeye katılın</h1>
            <p className="mt-3 text-sm leading-6 text-[#68736e]">{identity.email} hesabıyla giriş yaptınız. İşletmenizin adını ve yöneticinizden aldığınız katılım kodunu yazın.</p>
            <JoinForm />
          </>
        ) : (
          <>
            <h1 className="mt-5 text-3xl font-black tracking-[-0.04em] text-[color:var(--c-ink)]">İşletmenizi kurun</h1>
            <p className="mt-3 text-sm leading-6 text-[#68736e]">
              {identity.email} hesabıyla giriş yaptınız. Paketinizi seçip işletmenizi oluşturun. Ardından salonlarınızı, masalarınızı, mutfak istasyonlarınızı ve menünüzü kendiniz kurabilir veya MK Digital Systems ekibine bırakabilirsiniz. 7 günlük ücretsiz deneme, kurulum tamamlanıp kullanıma hazır olduktan sonra başlar.
            </p>
            <BusinessForm plans={pricingPlans.map((plan) => ({ id: plan.id, name: plan.name, tagline: plan.tagline, priceText: `${formatTl(plan.regularPrice)}/ay + KDV (normal fiyat)` }))} selectedPlan={entry.plan ? planIdForCode(entry.plan) : null} support={entry.support} />
          </>
        )}
        <form action={signOutAction} className="mt-5 text-center">
          <button type="submit" className="text-sm font-bold text-[#68736e] hover:text-[color:var(--c-ink)]">Çıkış yap</button>
        </form>
      </section>
    </main>
  );
}
