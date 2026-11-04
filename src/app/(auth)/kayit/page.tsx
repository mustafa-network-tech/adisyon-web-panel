import type { Metadata } from "next";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { Brand } from "@/components/brand";
import { SignupForm } from "@/modules/auth/components/signup-form";

export const metadata: Metadata = { title: "Üye ol" };

export default function SignupPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#f4f6f8] p-5">
      <section className="w-full max-w-md rounded-[28px] border border-[#dfe5e1] bg-white p-6 shadow-[0_28px_80px_rgb(23_33_29/0.08)] sm:p-9">
        <Brand />
        <div className="mt-9 grid size-12 place-items-center rounded-xl bg-[#fff0ea] text-[#d8542f]">
          <UserPlus size={22} aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-3xl font-black tracking-[-0.04em] text-[#17211d]">Üye olun</h1>
        <p className="mt-3 text-sm leading-6 text-[#68736e]">Üyeliğinizi oluşturduktan sonra işletmenizi kurabilirsiniz.</p>
        <SignupForm />
        <p className="mt-6 text-center text-sm font-semibold text-[#68736e]">
          Zaten üye misiniz?{" "}
          <Link href="/giris" className="font-black text-[#a73d21] hover:underline">Giriş yapın</Link>
        </p>
      </section>
    </main>
  );
}
