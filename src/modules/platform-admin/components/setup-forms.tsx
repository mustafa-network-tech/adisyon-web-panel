"use client";

import { useActionState } from "react";
import { initialCrudActionState } from "@/modules/settings/action-state";
import { applySetupSectionAction, setSetupStatusAction } from "../setup-actions";

const field = "w-full rounded-xl border border-[#dce3df] bg-[#f9faf9] px-3 py-3 text-sm leading-6 outline-none focus:border-[color:var(--c-accent)] focus:bg-white";

function Message({ state }: { state: { status: string; message: string | null } }) {
  if (!state.message) return null;
  return (
    <p role={state.status === "error" ? "alert" : "status"} className={`mt-3 rounded-xl p-3 text-xs font-semibold leading-5 ${state.status === "error" ? "bg-[#fff7f3] text-[#9e4328]" : "bg-[#eaf6f0] text-[#176e56]"}`}>
      {state.message}
    </p>
  );
}

/** Applies one of the four setup sections for the business from the text the business sent. */
export function SectionForm({ tenantId, section, label, hint, initial, rows }: { tenantId: string; section: "areas" | "tables" | "stations" | "menu"; label: string; hint: string; initial: string; rows: number }) {
  const [state, action, pending] = useActionState(applySetupSectionAction, initialCrudActionState);
  return (
    <form action={action} className="rounded-[22px] border border-[#dfe5e1] bg-white p-5">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="section" value={section} />
      <label htmlFor={`section-${section}`} className="block text-sm font-black">{label}</label>
      <p className="mt-1 text-xs leading-5 text-[#5e6a65]">{hint}</p>
      <textarea id={`section-${section}`} name="text" rows={rows} defaultValue={initial} className={`mt-3 font-mono ${field}`} />
      <button type="submit" disabled={pending} className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-[color:var(--c-ink)] px-5 text-sm font-black text-white disabled:opacity-55">
        {pending ? "Uygulanıyor…" : "İşletme adına oluştur"}
      </button>
      <Message state={state} />
    </form>
  );
}

/** One status change button; "bilgi bekleniyor" asks for the note shown to the business. */
export function StatusForm({ tenantId, status, label, needsNote, primary }: { tenantId: string; status: string; label: string; needsNote?: boolean; primary?: boolean }) {
  const [state, action, pending] = useActionState(setSetupStatusAction, initialCrudActionState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="status" value={status} />
      {needsNote && (
        <div>
          <label htmlFor={`note-${status}`} className="block text-xs font-bold">İşletmeye gösterilecek eksik bilgi notu</label>
          <textarea id={`note-${status}`} name="note" rows={2} required minLength={5} maxLength={1000} className={`mt-1 ${field}`} />
        </div>
      )}
      <button type="submit" disabled={pending} className={`inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-black disabled:opacity-55 ${primary ? "bg-[color:var(--c-accent-d3)] text-white" : "border border-[#d6ddd9] bg-white"}`}>
        {pending ? "Kaydediliyor…" : label}
      </button>
      <Message state={state} />
    </form>
  );
}
