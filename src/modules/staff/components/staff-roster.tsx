"use client";

import { useActionState, useState } from "react";
import { Phone, ShieldAlert, UserRound } from "lucide-react";
import { initialCrudActionState } from "@/modules/settings/action-state";
import { saveStaffProfileAction } from "../actions";
import type { EmploymentStatus, StaffMember } from "../types";

const inputClass = "min-h-11 w-full rounded-xl border border-[#dce3df] bg-[#f9faf9] px-3 text-sm outline-none focus:border-[#e8623a] focus:bg-white";
const labelClass = "mb-2 block text-xs font-bold text-[#68736e]";

const statusLabel: Record<EmploymentStatus, string> = {
  active: "Çalışıyor",
  on_leave: "Uzun izinde",
  terminated: "İşten ayrıldı",
};

const statusStyle: Record<EmploymentStatus, string> = {
  active: "bg-[#e7f5ef] text-[#176e56]",
  on_leave: "bg-[#eaf2fb] text-[#285e9f]",
  terminated: "bg-[#eef0ef] text-[#68736e]",
};

export function StaffRoster({ tenant, branch, members }: { tenant: string; branch: string; members: StaffMember[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(members[0]?.membershipId || null);
  const selected = members.find((member) => member.membershipId === selectedId) || null;

  return (
    <section className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <div className="rounded-[22px] border border-[#dfe5e1] bg-white p-4">
        <div className="flex items-center justify-between px-1"><h2 className="text-lg font-black">Personel kartları</h2><span className="text-xs font-bold text-[#8a948f]">{members.length}</span></div>
        <ul className="mt-3 space-y-2">
          {members.map((member) => (
            <li key={member.membershipId}>
              <button type="button" onClick={() => setSelectedId(member.membershipId)} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left ${member.membershipId === selectedId ? "bg-[#17211d] text-white" : "bg-[#f6f8f7]"}`}>
                <UserRound size={18} className="shrink-0 opacity-70" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black">{member.fullName}</span>
                  <span className={`block truncate text-[11px] font-semibold ${member.membershipId === selectedId ? "text-white/65" : "text-[#8a948f]"}`}>{member.positionTitle || member.roleNames.join(", ") || "Rol yok"}</span>
                </span>
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-black ${statusStyle[member.employmentStatus]}`}>{statusLabel[member.employmentStatus]}</span>
              </button>
            </li>
          ))}
          {members.length === 0 && <li className="p-8 text-center text-xs font-semibold text-[#8a948f]">Bu şubede personel yok.</li>}
        </ul>
      </div>
      {selected ? <StaffCardForm key={selected.membershipId} tenant={tenant} branch={branch} member={selected} /> : <div className="grid place-items-center rounded-[22px] border border-dashed border-[#cdd5d1] p-10 text-sm font-semibold text-[#8a948f]">Bir personel seçin.</div>}
    </section>
  );
}

function StaffCardForm({ tenant, branch, member }: { tenant: string; branch: string; member: StaffMember }) {
  const [state, action, pending] = useActionState(saveStaffProfileAction, initialCrudActionState);
  const [status, setStatus] = useState<EmploymentStatus>(member.employmentStatus);

  return (
    <form action={action} className="rounded-[22px] border border-[#dfe5e1] bg-white p-5 sm:p-6">
      <input type="hidden" name="tenant" value={tenant} /><input type="hidden" name="branch" value={branch} /><input type="hidden" name="membershipId" value={member.membershipId} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">{member.fullName}</h2>
          <p className="mt-1 text-xs font-semibold text-[#8a948f]">{member.roleNames.join(", ") || "Rol atanmamış"} · Hesap: {member.status === "active" ? "Aktif" : member.status === "suspended" ? "Askıda" : "Davet bekliyor"}</p>
        </div>
        {member.phone && <span className="inline-flex items-center gap-2 text-xs font-bold text-[#68736e]"><Phone size={14} />{member.phone}</span>}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label><span className={labelClass}>Pozisyon / ünvan</span><input name="positionTitle" className={inputClass} maxLength={80} defaultValue={member.positionTitle || ""} placeholder="Örn. Servis şefi" /></label>
        <label><span className={labelClass}>İşe giriş tarihi</span><input type="date" name="hiredOn" className={inputClass} defaultValue={member.hiredOn || ""} /></label>
        <label><span className={labelClass}>Çalışma durumu</span><select name="status" className={inputClass} value={status} onChange={(event) => setStatus(event.target.value as EmploymentStatus)}><option value="active">Çalışıyor</option><option value="on_leave">Uzun izinde</option><option value="terminated">İşten ayrıldı</option></select></label>
        {status === "terminated" && <label><span className={labelClass}>İşten ayrılış tarihi</span><input type="date" name="terminatedOn" className={inputClass} defaultValue={member.terminatedOn || ""} required /></label>}
        <label><span className={labelClass}>Acil durum kişisi</span><input name="emergencyName" className={inputClass} maxLength={120} defaultValue={member.emergencyName || ""} /></label>
        <label><span className={labelClass}>Acil durum telefonu</span><input name="emergencyPhone" className={inputClass} maxLength={40} defaultValue={member.emergencyPhone || ""} /></label>
        <label className="sm:col-span-2"><span className={labelClass}>Yönetici notları (yalnızca şirket yöneticisi görür)</span><textarea name="notes" className={`${inputClass} min-h-24 py-3`} maxLength={1000} defaultValue={member.notes || ""} /></label>
      </div>

      {status === "terminated" && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-[#fff8e7] p-3 text-xs font-bold leading-5 text-[#8a6415]"><ShieldAlert size={16} className="mt-0.5 shrink-0" />“İşten ayrıldı” olarak kaydedince personelin sisteme erişimi hemen askıya alınır. Geçmiş siparişleri ve vardiyaları korunur.</p>
      )}
      {state.message && <p role={state.status === "error" ? "alert" : "status"} className={`mt-4 rounded-xl p-3 text-xs font-semibold ${state.status === "error" ? "bg-[#fff7f3] text-[#9e4328]" : "bg-[#edf8f3] text-[#176e56]"}`}>{state.message}</p>}
      <button disabled={pending} className="mt-5 min-h-11 rounded-xl bg-[#17211d] px-6 text-sm font-black text-white disabled:opacity-50">{pending ? "Kaydediliyor…" : "Kartı kaydet"}</button>
    </form>
  );
}
