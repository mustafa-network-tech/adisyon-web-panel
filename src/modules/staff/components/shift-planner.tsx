"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Clock, Palmtree, Plus, Trash2 } from "lucide-react";
import { initialCrudActionState } from "@/modules/settings/action-state";
import { deleteShiftAction, saveShiftAction, saveShiftTemplateAction } from "../actions";
import { addDays, formatDay, formatDuration, shiftMinutes, weekDays } from "../dates";
import type { Shift, ShiftKind, ShiftTemplate, StaffMember } from "../types";

type Props = {
  tenant: string;
  branch: string;
  weekStart: string;
  today: string;
  members: StaffMember[];
  templates: ShiftTemplate[];
  shifts: Shift[];
};

type Editing = { shift?: Shift; membershipId?: string; date?: string };

const inputClass = "min-h-11 w-full rounded-xl border border-[#dce3df] bg-[#f9faf9] px-3 text-sm outline-none focus:border-[#e8623a] focus:bg-white";
const labelClass = "mb-2 block text-xs font-bold text-[#68736e]";

export function ShiftPlanner({ tenant, branch, weekStart, today, members, templates, shifts }: Props) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const days = weekDays(weekStart);
  const base = `/app/${tenant}/${branch}/personel`;
  const plannable = members.filter((member) => member.status === "active" && member.employmentStatus !== "terminated");
  const templateById = useMemo(() => new Map(templates.map((item) => [item.id, item])), [templates]);

  function shiftsFor(membershipId: string, date: string) {
    return shifts.filter((shift) => shift.membershipId === membershipId && shift.date === date);
  }

  function weeklyMinutes(membershipId: string) {
    return shifts
      .filter((shift) => shift.membershipId === membershipId && shift.kind === "work")
      .reduce((sum, shift) => sum + shiftMinutes(shift.startTime || "00:00", shift.endTime || "00:00"), 0);
  }

  return (
    <section className="space-y-5">
      <div className="rounded-[22px] border border-[#dfe5e1] bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black">Haftalık vardiya planı</h2>
            <p className="text-xs font-semibold text-[#8a948f]">{formatDay(days[0])} – {formatDay(days[6])}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`${base}?hafta=${addDays(weekStart, -7)}`} className="grid size-11 place-items-center rounded-xl border border-[#dce3df]" aria-label="Önceki hafta"><ChevronLeft size={18} /></Link>
            <Link href={base} className="inline-flex min-h-11 items-center rounded-xl border border-[#dce3df] px-4 text-sm font-black">Bu hafta</Link>
            <Link href={`${base}?hafta=${addDays(weekStart, 7)}`} className="grid size-11 place-items-center rounded-xl border border-[#dce3df]" aria-label="Sonraki hafta"><ChevronRight size={18} /></Link>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[820px] border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white p-2 text-xs font-black uppercase tracking-[0.1em] text-[#8a948f]">Personel</th>
                {days.map((day) => <th key={day} className={`p-2 text-xs font-black ${day === today ? "text-[#e8623a]" : "text-[#68736e]"}`}>{formatDay(day)}</th>)}
                <th className="p-2 text-xs font-black uppercase tracking-[0.1em] text-[#8a948f]">Toplam</th>
              </tr>
            </thead>
            <tbody>
              {plannable.map((member) => (
                <tr key={member.membershipId}>
                  <td className="sticky left-0 border-t border-[#edf0ee] bg-white p-2 align-top">
                    <p className="text-sm font-black">{member.fullName}</p>
                    <p className="text-[11px] font-semibold text-[#8a948f]">{member.positionTitle || member.roleNames.join(", ")}</p>
                  </td>
                  {days.map((day) => (
                    <td key={day} className="border-t border-[#edf0ee] p-1.5 align-top">
                      <div className="flex min-h-14 flex-col gap-1">
                        {shiftsFor(member.membershipId, day).map((shift) => {
                          const color = shift.kind === "leave" ? "#285e9f" : templateById.get(shift.templateId || "")?.color || "#17211d";
                          return (
                            <button key={shift.id} type="button" onClick={() => setEditing({ shift })} className="rounded-lg px-2 py-1.5 text-left text-[11px] font-black text-white" style={{ backgroundColor: color }}>
                              {shift.kind === "leave" ? <span className="inline-flex items-center gap-1"><Palmtree size={12} />İzin</span> : `${shift.startTime}–${shift.endTime}`}
                            </button>
                          );
                        })}
                        <button type="button" onClick={() => setEditing({ membershipId: member.membershipId, date: day })} className="grid h-7 place-items-center rounded-lg border border-dashed border-[#cdd5d1] text-[#8a948f] hover:border-[#e8623a] hover:text-[#e8623a]" aria-label={`${member.fullName} ${formatDay(day)} için ekle`}><Plus size={14} /></button>
                      </div>
                    </td>
                  ))}
                  <td className="border-t border-[#edf0ee] p-2 align-top text-xs font-black text-[#68736e]">{formatDuration(weeklyMinutes(member.membershipId))}</td>
                </tr>
              ))}
              {plannable.length === 0 && <tr><td colSpan={9} className="p-10 text-center text-sm font-semibold text-[#8a948f]">Bu şubede planlanabilecek aktif personel yok. Önce Ayarlar → Kullanıcılar bölümünden ekip üyesi ekleyin.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <ShiftForm
          key={editing.shift?.id || `${editing.membershipId}:${editing.date}`}
          tenant={tenant}
          branch={branch}
          editing={editing}
          members={plannable}
          templates={templates.filter((item) => item.isActive)}
          defaultDate={today}
          onClose={() => setEditing(null)}
        />
      )}

      <TemplateManager tenant={tenant} branch={branch} templates={templates} />
    </section>
  );
}

function ShiftForm({ tenant, branch, editing, members, templates, defaultDate, onClose }: {
  tenant: string;
  branch: string;
  editing: Editing;
  members: StaffMember[];
  templates: ShiftTemplate[];
  defaultDate: string;
  onClose: () => void;
}) {
  const shift = editing.shift;
  const [state, action, pending] = useActionState(saveShiftAction, initialCrudActionState);
  const [deleteState, deleteAction, deleting] = useActionState(deleteShiftAction, initialCrudActionState);
  const [kind, setKind] = useState<ShiftKind>(shift?.kind || "work");
  const [templateId, setTemplateId] = useState(shift?.templateId || "");
  const [startTime, setStartTime] = useState(shift?.startTime || "");
  const [endTime, setEndTime] = useState(shift?.endTime || "");
  const message = state.message || deleteState.message;
  const status = state.message ? state.status : deleteState.status;

  function pickTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((item) => item.id === id);
    if (template) {
      setStartTime(template.startTime);
      setEndTime(template.endTime);
    }
  }

  return (
    <div className="rounded-[22px] border border-[#e8623a]/40 bg-white p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black">{shift ? "Kaydı düzenle" : "Yeni kayıt"}</h2>
        <button type="button" onClick={onClose} className="min-h-10 rounded-xl border border-[#dce3df] px-4 text-sm font-bold">Kapat</button>
      </div>
      <form action={action} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <input type="hidden" name="tenant" value={tenant} /><input type="hidden" name="branch" value={branch} /><input type="hidden" name="id" value={shift?.id || ""} />
        <label><span className={labelClass}>Personel</span><select name="membershipId" className={inputClass} defaultValue={shift?.membershipId || editing.membershipId || ""} required><option value="" disabled>Seçin</option>{members.map((member) => <option key={member.membershipId} value={member.membershipId}>{member.fullName}</option>)}</select></label>
        <label><span className={labelClass}>Tarih</span><input type="date" name="date" className={inputClass} defaultValue={shift?.date || editing.date || defaultDate} required /></label>
        <label><span className={labelClass}>Tür</span><select name="kind" className={inputClass} value={kind} onChange={(event) => setKind(event.target.value === "leave" ? "leave" : "work")}><option value="work">Vardiya</option><option value="leave">İzin (tüm gün)</option></select></label>
        {kind === "work" && (
          <>
            <label><span className={labelClass}>Şablon</span><select name="templateId" className={inputClass} value={templateId} onChange={(event) => pickTemplate(event.target.value)}><option value="">Özel saat</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.startTime}–{item.endTime})</option>)}</select></label>
            <label><span className={labelClass}>Başlangıç</span><input type="time" name="startTime" className={inputClass} value={startTime} onChange={(event) => { setStartTime(event.target.value); setTemplateId(""); }} required /></label>
            <label><span className={labelClass}>Bitiş</span><input type="time" name="endTime" className={inputClass} value={endTime} onChange={(event) => { setEndTime(event.target.value); setTemplateId(""); }} required /></label>
          </>
        )}
        <label className="sm:col-span-2 lg:col-span-3"><span className={labelClass}>Not</span><input name="notes" className={inputClass} maxLength={300} defaultValue={shift?.notes || ""} placeholder="İsteğe bağlı" /></label>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
          <button disabled={pending} className="min-h-11 rounded-xl bg-[#e8623a] px-6 text-sm font-black text-white disabled:opacity-50">{pending ? "Kaydediliyor…" : "Kaydet"}</button>
        </div>
      </form>
      {shift && (
        <form action={deleteAction} className="mt-3">
          <input type="hidden" name="tenant" value={tenant} /><input type="hidden" name="branch" value={branch} /><input type="hidden" name="id" value={shift.id} />
          <button disabled={deleting} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#f0c6bb] px-4 text-xs font-black text-[#b63b32] disabled:opacity-50"><Trash2 size={14} />{deleting ? "Siliniyor…" : "Bu kaydı sil"}</button>
        </form>
      )}
      {message && <p role={status === "error" ? "alert" : "status"} className={`mt-4 rounded-xl p-3 text-xs font-semibold ${status === "error" ? "bg-[#fff7f3] text-[#9e4328]" : "bg-[#edf8f3] text-[#176e56]"}`}>{message}</p>}
    </div>
  );
}

function TemplateManager({ tenant, branch, templates }: { tenant: string; branch: string; templates: ShiftTemplate[] }) {
  const [state, action, pending] = useActionState(saveShiftTemplateAction, initialCrudActionState);
  const [editing, setEditing] = useState<ShiftTemplate | null>(null);

  return (
    <div className="rounded-[22px] border border-[#dfe5e1] bg-white p-5 sm:p-6">
      <div className="flex items-center gap-2"><Clock size={18} className="text-[#8a948f]" /><h2 className="text-lg font-black">Vardiya şablonları</h2></div>
      <div className="mt-4 flex flex-wrap gap-2">
        {templates.map((item) => (
          <button key={item.id} type="button" onClick={() => setEditing(item)} className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-black ${item.isActive ? "border-[#dce3df]" : "border-dashed text-[#8a948f]"}`}>
            <span className="size-3 rounded-full" style={{ backgroundColor: item.color }} />{item.name} · {item.startTime}–{item.endTime}{!item.isActive && " (pasif)"}
          </button>
        ))}
        {templates.length === 0 && <p className="text-xs font-semibold text-[#8a948f]">Henüz şablon yok. Örn. “Sabah 08:00–16:00”.</p>}
      </div>
      <form key={editing?.id || "new"} action={action} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <input type="hidden" name="tenant" value={tenant} /><input type="hidden" name="branch" value={branch} /><input type="hidden" name="id" value={editing?.id || ""} />
        <label className="lg:col-span-2"><span className={labelClass}>Şablon adı</span><input name="name" className={inputClass} defaultValue={editing?.name} required minLength={2} maxLength={60} /></label>
        <label><span className={labelClass}>Başlangıç</span><input type="time" name="startTime" className={inputClass} defaultValue={editing?.startTime} required /></label>
        <label><span className={labelClass}>Bitiş</span><input type="time" name="endTime" className={inputClass} defaultValue={editing?.endTime} required /></label>
        <label><span className={labelClass}>Renk</span><input type="color" name="color" className="min-h-11 w-full rounded-xl border border-[#dce3df] bg-[#f9faf9] p-1" defaultValue={editing?.color || "#e8623a"} /></label>
        {editing && <label><span className={labelClass}>Durum</span><select name="isActive" className={inputClass} defaultValue={String(editing.isActive)}><option value="true">Aktif</option><option value="false">Pasif</option></select></label>}
        <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
          <button disabled={pending} className="min-h-11 rounded-xl bg-[#17211d] px-5 text-sm font-black text-white disabled:opacity-50">{pending ? "Kaydediliyor…" : editing ? "Şablonu güncelle" : "Şablon ekle"}</button>
          {editing && <button type="button" onClick={() => setEditing(null)} className="min-h-11 rounded-xl border border-[#dce3df] px-4 text-sm font-bold">Vazgeç</button>}
        </div>
      </form>
      {state.message && <p role={state.status === "error" ? "alert" : "status"} className={`mt-4 rounded-xl p-3 text-xs font-semibold ${state.status === "error" ? "bg-[#fff7f3] text-[#9e4328]" : "bg-[#edf8f3] text-[#176e56]"}`}>{state.message}</p>}
    </div>
  );
}
