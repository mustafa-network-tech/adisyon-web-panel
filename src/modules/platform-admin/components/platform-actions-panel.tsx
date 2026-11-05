"use client";

import { useActionState, useState } from "react";
import { CalendarClock, X } from "lucide-react";
import { initialSettingsActionState } from "@/modules/settings/management-types";
import { addMonthsLocal, localInputToIso, planPresets, toLocalInput, type PlanPresetCode } from "@/modules/plan/usage";
import { updateSubscriptionAction } from "../actions";

type TenantOption = { id: string; name: string; planCode: string; subscriptionStatus: string; userLimit: number; branchLimit: number };
const inputClass = "min-h-11 w-full rounded-xl border border-[#dce3df] bg-white px-3 text-sm outline-none focus:border-[color:var(--c-accent)]";

function Notice({ state }: { state: typeof initialSettingsActionState }) {
  return state.message ? <p role={state.status === "error" ? "alert" : "status"} className={`mt-3 rounded-xl p-3 text-xs font-semibold ${state.status === "error" ? "bg-[#fff7f3] text-[#9e4328]" : "bg-[#edf8f3] text-[#176e56]"}`}>{state.message}</p> : null;
}

export function PlatformActionsPanel({ tenants }: { tenants: TenantOption[] }) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<PlanPresetCode>("PRO");
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date()));
  const [endsAt, setEndsAt] = useState("");
  const [months, setMonths] = useState("");
  const chooseMonths = (value: string) => {
    setMonths(value);
    setEndsAt(value ? addMonthsLocal(startsAt, Number(value)) : "");
  };
  const [limits, setLimits] = useState({ userLimit: String(planPresets.PRO.userLimit), branchLimit: String(planPresets.PRO.branchLimit), tableLimit: "", stationLimit: "" });
  const choosePlan = (code: PlanPresetCode) => {
    const preset = planPresets[code];
    setPlan(code);
    setLimits({ userLimit: String(preset.userLimit), branchLimit: String(preset.branchLimit), tableLimit: preset.tableLimit === null ? "" : String(preset.tableLimit), stationLimit: preset.stationLimit === null ? "" : String(preset.stationLimit) });
  };
  const [subscriptionState, subscriptionAction, subscriptionPending] = useActionState(updateSubscriptionAction, initialSettingsActionState);
  return <div>
    <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setOpen(true)} disabled={tenants.length === 0} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[color:var(--c-accent)] px-5 text-sm font-black text-white disabled:opacity-50"><CalendarClock size={17} /> Plan ve limit ata</button></div>
    {open && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[color:var(--c-ink)]/55 p-4" role="dialog" aria-modal="true"><div className="my-8 w-full max-w-2xl rounded-[26px] bg-[#f7f9f8] p-5 shadow-2xl sm:p-7"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-[color:var(--c-accent-soft)] text-[color:var(--c-accent-d2)]"><CalendarClock /></span><h2 className="text-xl font-black">Plan ve limit ata</h2></div><button type="button" onClick={() => setOpen(false)} className="grid size-10 place-items-center rounded-xl hover:bg-black/5" aria-label="Kapat"><X size={20} /></button></div>
      <form action={subscriptionAction} className="mt-6"><div className="grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2"><span className="mb-2 block text-xs font-bold">İşletme</span><select className={inputClass} name="tenantId" required><option value="">İşletme seçin</option>{tenants.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.planCode}</option>)}</select></label><label><span className="mb-2 block text-xs font-bold">Plan (sınırları doldurur)</span><select className={inputClass} name="planCode" value={plan} onChange={(event) => choosePlan(event.target.value as PlanPresetCode)}><option value="TRIAL">Deneme (7 gün)</option><option value="START">Başlangıç</option><option value="PRO">Profesyonel</option><option value="MULTI">Çok Şubeli</option></select></label><label><span className="mb-2 block text-xs font-bold">Durum</span><select className={inputClass} name="status" defaultValue="active"><option value="trial">Deneme</option><option value="active">Aktif</option><option value="suspended">Askıda</option><option value="cancelled">İptal</option></select></label><label><span className="mb-2 block text-xs font-bold">Başlangıç</span><input className={inputClass} type="datetime-local" value={startsAt} onChange={(event) => { setStartsAt(event.target.value); if (months) setEndsAt(addMonthsLocal(event.target.value, Number(months))); }} required /></label><input type="hidden" name="startsAt" value={localInputToIso(startsAt)} /><label><span className="mb-2 block text-xs font-bold">Ödenen süre (bitişi doldurur)</span><select className={inputClass} value={months} onChange={(event) => chooseMonths(event.target.value)}><option value="">Süresiz / elle gireceğim</option><option value="1">1 ay</option><option value="3">3 ay</option><option value="6">6 ay</option><option value="12">12 ay</option></select></label><label className="sm:col-span-2"><span className="mb-2 block text-xs font-bold">Bitiş (süre dolunca hesap salt okunur olur)</span><input className={inputClass} type="datetime-local" value={endsAt} onChange={(event) => { setEndsAt(event.target.value); setMonths(""); }} /></label><input type="hidden" name="endsAt" value={localInputToIso(endsAt)} /><label><span className="mb-2 block text-xs font-bold">Kullanıcı limiti</span><input className={inputClass} type="number" name="userLimit" min={1} max={10000} value={limits.userLimit} onChange={(event) => setLimits({ ...limits, userLimit: event.target.value })} required /></label><label><span className="mb-2 block text-xs font-bold">Şube limiti</span><input className={inputClass} type="number" name="branchLimit" min={1} max={1000} value={limits.branchLimit} onChange={(event) => setLimits({ ...limits, branchLimit: event.target.value })} required /></label><label><span className="mb-2 block text-xs font-bold">Masa limiti (boş = sınırsız)</span><input className={inputClass} type="number" name="tableLimit" min={1} max={100000} value={limits.tableLimit} onChange={(event) => setLimits({ ...limits, tableLimit: event.target.value })} placeholder="Sınırsız" /></label><label><span className="mb-2 block text-xs font-bold">İstasyon limiti / şube (boş = sınırsız)</span><input className={inputClass} type="number" name="stationLimit" min={1} max={1000} value={limits.stationLimit} onChange={(event) => setLimits({ ...limits, stationLimit: event.target.value })} placeholder="Sınırsız" /></label><label className="sm:col-span-2"><span className="mb-2 block text-xs font-bold">Not</span><textarea className={`${inputClass} min-h-20 py-3`} name="notes" maxLength={500} /></label></div><p className="mt-3 text-xs leading-5 text-[#68736e]">Askıda veya iptal durumu çalışma alanı erişimini tamamen kapatır. Bitiş tarihi geçen deneme veya abonelikte işletme salt okunur olur (görür, kayıt yapamaz); yeni bir dönem eklediğinizde yeniden yazılabilir hâle gelir.</p><Notice state={subscriptionState} /><button disabled={subscriptionPending} className="mt-5 min-h-11 rounded-xl bg-[color:var(--c-ink)] px-5 text-sm font-black text-white disabled:opacity-50">{subscriptionPending ? "Kaydediliyor…" : "Kaydet"}</button></form>
    </div></div>}
  </div>;
}
