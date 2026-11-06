"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { CheckCheck, ChevronLeft, ChevronRight, Download, Trash2 } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { initialCrudActionState } from "@/modules/settings/action-state";
import { csvCell } from "@/lib/csv";
import { formatDay, formatDuration } from "@/modules/staff/dates";
import {
  addPayrollEntryAction,
  approveAttendanceAction,
  approveMonthAsPlannedAction,
  deletePayrollEntryAction,
  setStaffPayAction,
} from "../actions";
import { plannedShiftMinutes, shiftPeriod, type EntryKind } from "../calc";
import type { PayrollMember, PayrollSnapshot } from "../repository";

const inputClass = "min-h-11 w-full rounded-xl border border-[#dce3df] bg-[#f9faf9] px-3 text-sm outline-none focus:border-[color:var(--c-accent)] focus:bg-white";
const labelClass = "mb-2 block text-xs font-bold text-[#68736e]";
const kindLabel: Record<EntryKind, string> = { bonus: "Prim", deduction: "Kesinti", advance: "Avans" };

const monthFormatter = new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric", timeZone: "UTC" });
const monthLabel = (period: string) => monthFormatter.format(new Date(`${period}-01T00:00:00Z`));

function Message({ state }: { state: { status: string; message: string | null } }) {
  if (!state.message) return null;
  return <p role={state.status === "error" ? "alert" : "status"} className={`mt-3 rounded-xl p-3 text-xs font-semibold ${state.status === "error" ? "bg-[#fff7f3] text-[#9e4328]" : "bg-[#edf8f3] text-[#176e56]"}`}>{state.message}</p>;
}

export function PayrollBoard({ tenant, branch, snapshot }: { tenant: string; branch: string; snapshot: PayrollSnapshot }) {
  const { period, members, canPayroll, canApprove } = snapshot;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = members.find((member) => member.membershipId === selectedId) || null;
  const [bulkState, bulkAction, bulkPending] = useActionState(approveMonthAsPlannedAction, initialCrudActionState);
  const base = `/app/${tenant}/${branch}/personel/puantaj`;
  const pendingTotal = members.reduce((sum, member) => sum + member.summary.pendingShifts, 0);

  function exportCsv() {
    const header = ["Personel", "Planlanan vardiya", "Planlanan saat", "Onaylanan vardiya", "Onaylanan saat", "Gelmedi", "Onay bekleyen"];
    if (canPayroll) header.push("Brüt", "Prim", "Kesinti", "Avans", "Net");
    const lines = members.map((member) => {
      const s = member.summary;
      const row: (string | number)[] = [member.fullName, s.plannedShifts, (s.plannedMinutes / 60).toFixed(2), s.approvedShifts, (s.approvedMinutes / 60).toFixed(2), s.absentShifts, s.pendingShifts];
      if (canPayroll) row.push(...[s.grossMinor, s.bonusMinor, s.deductionMinor, s.advanceMinor, s.netMinor].map((value) => (value === null ? "" : (value / 100).toFixed(2))));
      return row.map(csvCell).join(";");
    });
    const blob = new Blob(["﻿" + [header.map(csvCell).join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `puantaj-${period}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[22px] border border-[#dfe5e1] bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <Link href={`${base}?ay=${shiftPeriod(period, -1)}`} className="grid size-11 place-items-center rounded-xl border border-[#dce3df]" aria-label="Önceki ay"><ChevronLeft size={18} /></Link>
            <h2 className="min-w-44 text-center text-lg font-black capitalize">{monthLabel(period)}</h2>
            <Link href={`${base}?ay=${shiftPeriod(period, 1)}`} className="grid size-11 place-items-center rounded-xl border border-[#dce3df]" aria-label="Sonraki ay"><ChevronRight size={18} /></Link>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canApprove && <form action={bulkAction}>
              <input type="hidden" name="tenant" value={tenant} /><input type="hidden" name="branch" value={branch} /><input type="hidden" name="period" value={period} />
              <button disabled={bulkPending || pendingTotal === 0} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[color:var(--c-ink)] px-4 text-sm font-black text-white disabled:opacity-45"><CheckCheck size={16} />{bulkPending ? "Onaylanıyor…" : `Bekleyen ${pendingTotal} vardiyayı planlandığı gibi onayla`}</button>
            </form>}
            <button type="button" onClick={exportCsv} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dce3df] px-4 text-sm font-black"><Download size={16} />Excel (CSV)</button>
          </div>
        </div>
        <Message state={bulkState} />

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="text-[11px] font-black uppercase tracking-[0.1em] text-[#8a948f]">
                <th className="p-2">Personel</th><th className="p-2">Planlanan</th><th className="p-2">Onaylanan</th><th className="p-2">Gelmedi</th><th className="p-2">Bekleyen</th>
                {canPayroll && <><th className="p-2">Brüt</th><th className="p-2">Prim</th><th className="p-2">Kesinti+Avans</th><th className="p-2">Net</th></>}
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const s = member.summary;
                return (
                  <tr key={member.membershipId} onClick={() => setSelectedId(member.membershipId)} className={`cursor-pointer border-t border-[#edf0ee] text-sm ${member.membershipId === selectedId ? "bg-[#fff8f4]" : "hover:bg-[#fafbfa]"}`}>
                    <td className="p-2"><p className="font-black">{member.fullName}</p><p className="text-[11px] font-semibold text-[#8a948f]">{member.positionTitle}</p></td>
                    <td className="p-2 font-bold">{s.plannedShifts} · {formatDuration(s.plannedMinutes)}</td>
                    <td className="p-2 font-bold">{s.approvedShifts} · {formatDuration(s.approvedMinutes)}</td>
                    <td className="p-2 font-bold">{s.absentShifts}</td>
                    <td className="p-2">{s.pendingShifts > 0 ? <span className="rounded-md bg-[#fff2ed] px-2 py-0.5 text-xs font-black text-[#9e4328]">{s.pendingShifts}</span> : <span className="text-[#8a948f]">–</span>}</td>
                    {canPayroll && <>
                      <td className="p-2 font-bold">{s.grossMinor === null ? <span className="text-[#8a948f]">Ücret girilmedi</span> : formatMoney(s.grossMinor)}</td>
                      <td className="p-2 font-bold">{s.bonusMinor ? formatMoney(s.bonusMinor) : "–"}</td>
                      <td className="p-2 font-bold">{s.deductionMinor + s.advanceMinor ? formatMoney(s.deductionMinor + s.advanceMinor) : "–"}</td>
                      <td className="p-2 font-black text-[#176e56]">{s.netMinor === null ? "–" : formatMoney(s.netMinor)}</td>
                    </>}
                  </tr>
                );
              })}
              {members.length === 0 && <tr><td colSpan={9} className="p-10 text-center text-sm font-semibold text-[#8a948f]">Bu şubede personel yok.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
          <ShiftApprovals key={`shifts-${selected.membershipId}-${period}`} tenant={tenant} branch={branch} member={selected} today={snapshot.today} canApprove={canApprove} />
          {canPayroll && <PayrollPanel key={`pay-${selected.membershipId}-${period}`} tenant={tenant} branch={branch} period={period} member={selected} />}
        </div>
      )}
    </div>
  );
}

function ShiftApprovals({ tenant, branch, member, today, canApprove }: { tenant: string; branch: string; member: PayrollMember; today: string; canApprove: boolean }) {
  return (
    <div className="rounded-[22px] border border-[#dfe5e1] bg-white p-5 sm:p-6">
      <h3 className="text-lg font-black">{member.fullName} · vardiya onayı</h3>
      <p className="mt-1 text-xs font-semibold text-[#8a948f]">{canApprove ? "Fiilen çalışılan süreyi onaylayın; boş bırakırsanız planlanan süre geçerli olur." : "Süreleri yalnızca puantaj onay yetkisi olanlar değiştirebilir."}</p>
      <ul className="mt-4 divide-y divide-[#edf0ee]">
        {member.shifts.map((shift) => <ShiftApprovalRow key={shift.id} tenant={tenant} branch={branch} shift={shift} future={shift.date > today} canApprove={canApprove} />)}
        {member.shifts.length === 0 && <li className="py-8 text-center text-sm font-semibold text-[#8a948f]">Bu ay için vardiya yok.</li>}
      </ul>
    </div>
  );
}

function ShiftApprovalRow({ tenant, branch, shift, future, canApprove }: { tenant: string; branch: string; shift: PayrollMember["shifts"][number]; future: boolean; canApprove: boolean }) {
  const [state, action, pending] = useActionState(approveAttendanceAction, initialCrudActionState);
  const planned = plannedShiftMinutes(shift.startTime, shift.endTime);
  const attendance = shift.attendance;
  return (
    <li className="py-3">
      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="tenant" value={tenant} /><input type="hidden" name="branch" value={branch} /><input type="hidden" name="shiftId" value={shift.id} />
        <div className="min-w-36 flex-1">
          <p className="text-sm font-black">{formatDay(shift.date)}</p>
          <p className="text-xs font-semibold text-[#8a948f]">{shift.startTime}–{shift.endTime} · {formatDuration(planned)}</p>
        </div>
        <span className={`rounded-md px-2 py-1 text-[10px] font-black ${attendance?.status === "worked" ? "bg-[#e7f5ef] text-[#176e56]" : attendance?.status === "absent" ? "bg-[#fff0ee] text-[#b63b32]" : future ? "bg-[#eef0ef] text-[#68736e]" : "bg-[#fff8e7] text-[#8a6415]"}`}>
          {attendance?.status === "worked" ? `Onaylı · ${formatDuration(attendance.approvedMinutes)}` : attendance?.status === "absent" ? "Gelmedi" : future ? "Henüz olmadı" : "Onay bekliyor"}
        </span>
        {!future && canApprove && (
          <>
            <label className="w-28"><span className="sr-only">Çalışılan süre</span><input name="duration" className="min-h-10 w-full rounded-xl border border-[#dce3df] bg-[#f9faf9] px-3 text-xs" placeholder={`${Math.floor(planned / 60)}:${String(planned % 60).padStart(2, "0")}`} defaultValue={attendance?.status === "worked" && attendance.approvedMinutes !== planned ? `${Math.floor(attendance.approvedMinutes / 60)}:${String(attendance.approvedMinutes % 60).padStart(2, "0")}` : ""} /></label>
            <button name="status" value="worked" disabled={pending} className="min-h-10 rounded-xl bg-[color:var(--c-ink)] px-3 text-xs font-black text-white disabled:opacity-50">Onayla</button>
            <button name="status" value="absent" disabled={pending} className="min-h-10 rounded-xl border border-[#f0c6bb] px-3 text-xs font-black text-[#b63b32] disabled:opacity-50">Gelmedi</button>
          </>
        )}
      </form>
      <Message state={state} />
    </li>
  );
}

function PayrollPanel({ tenant, branch, period, member }: { tenant: string; branch: string; period: string; member: PayrollMember }) {
  const [payState, payAction, payPending] = useActionState(setStaffPayAction, initialCrudActionState);
  const [entryState, entryAction, entryPending] = useActionState(addPayrollEntryAction, initialCrudActionState);
  const [deleteState, deleteAction, deleting] = useActionState(deletePayrollEntryAction, initialCrudActionState);

  return (
    <div className="space-y-5">
      <form action={payAction} className="rounded-[22px] border border-[#dfe5e1] bg-white p-5 sm:p-6">
        <input type="hidden" name="tenant" value={tenant} /><input type="hidden" name="branch" value={branch} /><input type="hidden" name="membershipId" value={member.membershipId} />
        <h3 className="text-lg font-black">Ücret</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label><span className={labelClass}>Ücret türü</span><select name="payType" className={inputClass} defaultValue={member.pay?.type || "monthly"}><option value="monthly">Aylık sabit maaş</option><option value="hourly">Saatlik ücret</option></select></label>
          <label><span className={labelClass}>Tutar (₺)</span><input name="amount" inputMode="decimal" className={inputClass} defaultValue={member.pay ? (member.pay.amountMinor / 100).toFixed(2).replace(".", ",") : ""} placeholder="30000" required /></label>
        </div>
        <p className="mt-2 text-[11px] font-semibold leading-5 text-[#8a948f]">Aylık maaşta devamsızlık kesintisini siz “Kesinti” olarak girersiniz. Saatlik ücret, onaylanan çalışma süresiyle çarpılır.</p>
        <button disabled={payPending} className="mt-4 min-h-11 rounded-xl bg-[color:var(--c-ink)] px-5 text-sm font-black text-white disabled:opacity-50">{payPending ? "Kaydediliyor…" : "Ücreti kaydet"}</button>
        <Message state={payState} />
      </form>

      <div className="rounded-[22px] border border-[#dfe5e1] bg-white p-5 sm:p-6">
        <h3 className="text-lg font-black">{monthLabel(period)} · prim, kesinti ve avans</h3>
        <ul className="mt-3 divide-y divide-[#edf0ee]">
          {member.entries.map((entry) => (
            <li key={entry.id} className="flex items-center gap-3 py-2.5">
              <span className="w-16 text-xs font-black text-[#68736e]">{kindLabel[entry.kind]}</span>
              <span className="flex-1 text-sm font-bold">{entry.kind === "bonus" ? "+" : "−"}{formatMoney(entry.amountMinor)}<span className="ml-2 text-xs font-semibold text-[#8a948f]">{entry.note}</span></span>
              <form action={deleteAction}>
                <input type="hidden" name="tenant" value={tenant} /><input type="hidden" name="branch" value={branch} /><input type="hidden" name="entryId" value={entry.id} />
                <button disabled={deleting} className="grid size-9 place-items-center rounded-lg border border-[#f0c6bb] text-[#b63b32] disabled:opacity-50" aria-label="Kaydı sil"><Trash2 size={14} /></button>
              </form>
            </li>
          ))}
          {member.entries.length === 0 && <li className="py-4 text-center text-xs font-semibold text-[#8a948f]">Bu ay için kayıt yok. Prim vermek zorunlu değildir.</li>}
        </ul>
        <Message state={deleteState} />
        <form action={entryAction} className="mt-4 grid gap-3 sm:grid-cols-[130px_120px_1fr_auto]">
          <input type="hidden" name="tenant" value={tenant} /><input type="hidden" name="branch" value={branch} /><input type="hidden" name="membershipId" value={member.membershipId} /><input type="hidden" name="period" value={period} />
          <label><span className="sr-only">Tür</span><select name="kind" className={inputClass} defaultValue="deduction"><option value="bonus">Prim (isteğe bağlı)</option><option value="deduction">Kesinti</option><option value="advance">Avans</option></select></label>
          <label><span className="sr-only">Tutar</span><input name="amount" inputMode="decimal" className={inputClass} placeholder="Tutar ₺" required /></label>
          <label><span className="sr-only">Açıklama</span><input name="note" maxLength={200} className={inputClass} placeholder="Açıklama" /></label>
          <button disabled={entryPending} className="min-h-11 rounded-xl bg-[color:var(--c-accent)] px-4 text-sm font-black text-white disabled:opacity-50">Ekle</button>
        </form>
        <Message state={entryState} />
      </div>
    </div>
  );
}
