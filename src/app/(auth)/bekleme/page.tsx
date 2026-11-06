import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Hourglass } from "lucide-react";
import { Brand } from "@/components/brand";
import { requireAuthenticatedUser } from "@/lib/auth/access";
import { resolveDefaultDestination } from "@/lib/auth/destination";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOutAction } from "@/modules/auth/actions";
import { joinWaitingMessage } from "@/modules/settings/role-rules";

export const metadata: Metadata = { title: "Onay bekleniyor" };
export const dynamic = "force-dynamic";

type JoinRequestRow = { status: string; tenantName: string };

/** Waiting screen: no business data is shown until a manager approves and sets role and branches. */
export default async function WaitingPage() {
  const identity = await requireAuthenticatedUser("/bekleme");
  const destination = await resolveDefaultDestination(identity.userId);
  if (destination && destination !== "/bekleme") redirect(destination);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("my_join_requests");
  const requests = (Array.isArray(data) ? data : []) as JoinRequestRow[];
  const pending = requests.find((item) => item.status === "pending");
  if (!pending) redirect("/baslangic");

  return (
    <main className="grid min-h-dvh place-items-center bg-[#f4f6f8] p-5">
      <section className="w-full max-w-md rounded-[28px] border border-[#dfe5e1] bg-white p-6 shadow-[0_28px_80px_rgb(23_33_29/0.08)] sm:p-9">
        <Brand />
        <div className="mt-9 grid size-12 place-items-center rounded-xl bg-[color:var(--c-accent-soft)] text-[color:var(--c-accent-d1)]">
          <Hourglass size={22} aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-3xl font-black tracking-[-0.04em] text-[color:var(--c-ink)]">Onay bekleniyor</h1>
        <p className="mt-3 text-sm leading-6 text-[#68736e]">{joinWaitingMessage}</p>
        <p className="mt-3 text-xs font-semibold text-[#8a948f]">{pending.tenantName} · {identity.email}</p>
        <form action={signOutAction} className="mt-6 text-center">
          <button type="submit" className="text-sm font-bold text-[#68736e] hover:text-[color:var(--c-ink)]">Çıkış yap</button>
        </form>
      </section>
    </main>
  );
}
