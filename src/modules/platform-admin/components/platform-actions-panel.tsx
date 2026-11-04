"use client";

import { useActionState, useState } from "react";
import { CalendarClock, X } from "lucide-react";
import { initialSettingsActionState } from "@/modules/settings/management-types";
import { updateSubscriptionAction } from "../actions";

type TenantOption = { id: string; name: string; planCode: string; subscriptionStatus: string; userLimit: number; branchLimit: number };
const inputClass = "min-h-11 w-full rounded-xl border border-[#dce3df] bg-white px-3 text-sm outline-none focus:border-[#e8623a]";

function Notice({ state }: { state: typeof initialSettingsActionState }) {
  return state.message ? <p role={state.status === "error" ? "alert" : "status"} className={`mt-3 rounded-xl p-3 text-xs font-semibold ${state.status === "error" ? "bg-[#fff7f3] text-[#9e4328]" : "bg-[#edf8f3] text-[#176e56]"}`}>{state.message}</p> : null;
}

export function PlatformActionsPanel({ tenants }: { tenants: TenantOption[] }) {
  const [open, setOpen] = useState(false);
  const [subscriptionState, subscriptionAction, subscriptionPending] = useActionState(updateSubscriptionAction, initialSettingsActionState);
  return <div>
    <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setOpen(true)} disabled={tenants.length === 0} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#e8623a] px-5 text-sm font-black text-white disabled:opacity-50"><CalendarClock size={17} /> Plan ve limit ata</button></div>
    {open && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#17211d]/55 p-4" role="dialog" aria-modal="true"><div className="my-8 w-full max-w-2xl rounded-[26px] bg-[#f7f9f8] p-5 shadow-2xl sm:p-7"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-[#fff0ea] text-[#c94927]"><CalendarClock /></span><h2 className="text-xl font-black">Plan ve limit ata</h2></div><button type="button" onClick={() => setOpen(false)} className="grid size-10 place-items-center rounded-xl hover:bg-black/5" aria-label="Kapat"><X size={20} /></button></div>
      <form action={subscriptionAction} className="mt-6"><div className="grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2"><span className="mb-2 block text-xs font-bold">İşletme</span><select className={inputClass} name="tenantId" required><option value="">İşletme seçin</option>{tenants.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.planCode}</option>)}</select></label><label><span className="mb-2 block text-xs font-bold">Plan</span><input className={inputClass} name="planCode" defaultValue="PRO" required /></label><label><span className="mb-2 block text-xs font-bold">Durum</span><select className={inputClass} name="status" defaultValue="active"><option value="trial">Deneme</option><option value="active">Aktif</option><option value="suspended">Askıda</option><option value="cancelled">İptal</option></select></label><label><span className="mb-2 block text-xs font-bold">Başlangıç</span><input className={inputClass} type="datetime-local" name="startsAt" required /></label><label><span className="mb-2 block text-xs font-bold">Bitiş</span><input className={inputClass} type="datetime-local" name="endsAt" /></label><label><span className="mb-2 block text-xs font-bold">Kullanıcı limiti</span><input className={inputClass} type="number" name="userLimit" min={1} max={10000} defaultValue={5} required /></label><label><span className="mb-2 block text-xs font-bold">Şube limiti</span><input className={inputClass} type="number" name="branchLimit" min={1} max={1000} defaultValue={1} required /></label><label className="sm:col-span-2"><span className="mb-2 block text-xs font-bold">Not</span><textarea className={`${inputClass} min-h-20 py-3`} name="notes" maxLength={500} /></label></div><p className="mt-3 text-xs leading-5 text-[#68736e]">Askıda veya iptal durumu tenant çalışma alanı erişimini kapatır. Aktif ya da deneme durumu yeniden açar.</p><Notice state={subscriptionState} /><button disabled={subscriptionPending} className="mt-5 min-h-11 rounded-xl bg-[#17211d] px-5 text-sm font-black text-white disabled:opacity-50">{subscriptionPending ? "Kaydediliyor…" : "Kaydet"}</button></form>
    </div></div>}
  </div>;
}
