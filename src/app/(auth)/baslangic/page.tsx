import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Store } from "lucide-react";
import { Brand } from "@/components/brand";
import { requireAuthenticatedUser } from "@/lib/auth/access";
import { resolveDefaultDestination } from "@/lib/auth/destination";
import { signOutAction } from "@/modules/auth/actions";
import { BusinessForm } from "@/modules/auth/components/business-form";

export const metadata: Metadata = { title: "İşletmenizi kurun" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const identity = await requireAuthenticatedUser("/baslangic");
  const destination = await resolveDefaultDestination(identity.userId);
  if (destination) redirect(destination);

  return (
    <main className="grid min-h-dvh place-items-center bg-[#f4f6f8] p-5">
      <section className="w-full max-w-md rounded-[28px] border border-[#dfe5e1] bg-white p-6 shadow-[0_28px_80px_rgb(23_33_29/0.08)] sm:p-9">
        <Brand />
        <div className="mt-9 grid size-12 place-items-center rounded-xl bg-[#fff0ea] text-[#d8542f]">
          <Store size={22} aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-3xl font-black tracking-[-0.04em] text-[#17211d]">İşletmenizi kurun</h1>
        <p className="mt-3 text-sm leading-6 text-[#68736e]">
          {identity.email} hesabıyla giriş yaptınız. İşletmenizi oluşturun; 14 günlük deneme planıyla başlayacaksınız. Plan ve kullanıcı limitleri sonradan MK ekibi tarafından tanımlanır.
        </p>
        <BusinessForm />
        <form action={signOutAction} className="mt-5 text-center">
          <button type="submit" className="text-sm font-bold text-[#68736e] hover:text-[#17211d]">Çıkış yap</button>
        </form>
      </section>
    </main>
  );
}
