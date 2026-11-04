import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Clock3, ShieldCheck } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { InvitationAcceptForm } from "@/modules/settings/components/invitation-accept-form";
import { getInvitationPreview } from "@/modules/settings/repository";

export const metadata: Metadata = { title: "İşletme daveti" };
export const dynamic = "force-dynamic";

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await getInvitationPreview(token);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const authenticated = Boolean(data?.claims?.sub);
  if (!invitation) return <main className="grid min-h-dvh place-items-center bg-[#f4f6f8] p-5"><div className="w-full max-w-md rounded-[26px] border border-[#dfe5e1] bg-white p-7 text-center"><ShieldCheck className="mx-auto text-[#e8623a]" size={34} /><h1 className="mt-5 text-2xl font-black">Davet kullanılamıyor</h1><p className="mt-3 text-sm leading-6 text-[#68736e]">Bağlantı geçersiz, süresi dolmuş veya daha önce kullanılmış olabilir.</p><Link href="/giris" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-[#17211d] px-5 text-sm font-black text-white">Giriş sayfasına dön</Link></div></main>;
  return <main className="grid min-h-dvh place-items-center bg-[#f4f6f8] p-5"><div className="w-full max-w-md rounded-[26px] border border-[#dfe5e1] bg-white p-7"><span className="grid size-12 place-items-center rounded-xl bg-[#fff0ea] text-[#c94927]"><Building2 /></span><p className="mt-6 text-xs font-black uppercase tracking-[0.16em] text-[#e8623a]">İşletme daveti</p><h1 className="mt-2 text-3xl font-black">{invitation.tenantName}</h1><p className="mt-3 text-sm leading-6 text-[#68736e]">{invitation.branchName} şubesine <strong>{invitation.roleName}</strong> rolüyle davet edildiniz.</p><div className="mt-5 rounded-xl bg-[#f6f8f7] p-4 text-xs font-semibold text-[#68736e]"><p>{invitation.emailHint}</p><p className="mt-2 flex items-center gap-2"><Clock3 size={14} />{new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(invitation.expiresAt))} tarihine kadar geçerli</p></div>{authenticated ? <InvitationAcceptForm token={token} /> : <Link href={`/giris?next=${encodeURIComponent(`/davet/${token}`)}`} className="mt-6 flex min-h-12 items-center justify-center rounded-xl bg-[#17211d] px-5 text-sm font-black text-white">Davet edilen hesapla giriş yap</Link>}<p className="mt-4 text-center text-[11px] leading-5 text-[#8a948f]">Güvenlik için oturum e-postanız davet e-postasıyla aynı olmalıdır.</p></div></main>;
}
