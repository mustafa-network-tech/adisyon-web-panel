"use client";

import { useActionState } from "react";
import { Save, ShieldCheck } from "lucide-react";
import { saveTenantConfigurationAction } from "../actions";
import { initialSettingsActionState, type TenantConfiguration } from "../management-types";

const inputClass = "min-h-11 w-full rounded-xl border border-[#dce3df] bg-[#f9faf9] px-3 text-sm outline-none focus:border-[color:var(--c-accent)] focus:bg-white";

export function TenantSettingsManager({ tenant, branch, configuration }: { tenant: string; branch: string; configuration: TenantConfiguration }) {
  const [state, action, pending] = useActionState(saveTenantConfigurationAction, initialSettingsActionState);
  return <form action={action} className="rounded-[24px] border border-[#dfe5e1] bg-white p-5 sm:p-7">
    <input type="hidden" name="tenant" value={tenant} /><input type="hidden" name="branch" value={branch} />
    <div className="grid gap-5 md:grid-cols-2">
      <label><span className="mb-2 block text-xs font-bold text-[#68736e]">İşletme adı</span><input className={inputClass} name="tenantName" defaultValue={configuration.tenantName} required /></label>
      <label><span className="mb-2 block text-xs font-bold text-[#68736e]">Ticari unvan</span><input className={inputClass} name="legalName" defaultValue={configuration.legalName} /></label>
      <label><span className="mb-2 block text-xs font-bold text-[#68736e]">Şube adı</span><input className={inputClass} name="branchName" defaultValue={configuration.branchName} required /></label>
      <label><span className="mb-2 block text-xs font-bold text-[#68736e]">Marka adı</span><input className={inputClass} name="brandName" defaultValue={configuration.brandName} required /></label>
      <label><span className="mb-2 block text-xs font-bold text-[#68736e]">Kurumsal renk</span><span className="flex items-center gap-3"><input className="size-11 rounded-xl border border-[#dce3df] bg-white p-1" type="color" name="primaryColor" defaultValue={configuration.primaryColor} /><span className="text-xs font-semibold text-[#68736e]">Tema ve marka vurgusu</span></span></label>
      <label><span className="mb-2 block text-xs font-bold text-[#68736e]">Sipariş numarası öneki</span><input className={inputClass} name="orderNumberPrefix" defaultValue={configuration.orderNumberPrefix} maxLength={8} required /></label>
      <label className="md:col-span-2"><span className="mb-2 block text-xs font-bold text-[#68736e]">Fiş alt bilgisi</span><textarea className={`${inputClass} min-h-24 py-3`} name="receiptFooter" defaultValue={configuration.receiptFooter} maxLength={500} /></label>
    </div>
    {state.message && <p role={state.status === "error" ? "alert" : "status"} className={`mt-5 rounded-xl p-3 text-xs font-semibold ${state.status === "error" ? "bg-[#fff7f3] text-[#9e4328]" : "bg-[#edf8f3] text-[#176e56]"}`}>{state.message}</p>}
    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="flex items-center gap-2 text-xs font-semibold text-[#68736e]"><ShieldCheck size={16} className="text-[#23866b]" /> Değişiklikler tenant kapsamı ve audit kaydıyla korunur.</p><button disabled={pending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[color:var(--c-ink)] px-5 text-sm font-black text-white disabled:opacity-50"><Save size={16} />{pending ? "Kaydediliyor…" : "Ayarları kaydet"}</button></div>
  </form>;
}
