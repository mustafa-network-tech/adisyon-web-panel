import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PasswordUpdateForm } from "@/modules/auth/components/password-update-form";

export const metadata: Metadata = { title: "Yeni şifre" };
export const dynamic = "force-dynamic";

export default async function PasswordUpdatePage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims?.sub) redirect("/giris?error=auth-link");

  return (
    <main className="grid min-h-dvh place-items-center bg-[#f4f6f8] p-5">
      <section className="w-full max-w-md rounded-[28px] border border-[#dfe5e1] bg-white p-6 shadow-[0_28px_80px_rgb(23_33_29/0.08)] sm:p-9">
        <Brand />
        <h1 className="mt-9 text-3xl font-black tracking-[-0.04em] text-[#17211d]">Yeni şifrenizi belirleyin</h1>
        <p className="mt-3 text-sm leading-6 text-[#68736e]">En az 8 karakterden oluşan yeni şifrenizi iki kez girin.</p>
        <PasswordUpdateForm />
      </section>
    </main>
  );
}
