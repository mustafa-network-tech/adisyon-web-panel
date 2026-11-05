"use client";

import { useActionState } from "react";
import { initialCrudActionState } from "@/modules/settings/action-state";
import { submitAssistedRequestAction } from "../actions";

const field = "w-full rounded-xl border border-[#dce3df] bg-[#f9faf9] px-3 py-3 text-sm leading-6 outline-none focus:border-[color:var(--c-accent)] focus:bg-white";

type Initial = Partial<Record<"details" | "areas" | "tables" | "stations" | "menu" | "notes", string>>;

/** Older requests were entered in four boxes; show them together so nothing is lost. */
function initialDetails(initial?: Initial) {
  if (!initial) return "";
  if (initial.details) return initial.details;
  return [initial.areas && `Salonlar:\n${initial.areas}`, initial.tables && `Masalar:\n${initial.tables}`, initial.stations && `Mutfak istasyonları:\n${initial.stations}`, initial.menu && `Menü:\n${initial.menu}`]
    .filter(Boolean)
    .join("\n\n");
}

const example = `Salonlar ve masalar:
Salon 8 masa, bahçe 3 masa

Mutfak istasyonları:
Mutfak, bar

Menü:
Kola 25 lira
Cacık 30 lira
Adana kebap 365 lira (mutfak)`;

/** One free-text box: the business writes what MK Digital Systems should prepare (halls, tables, stations, menu). */
export function AssistedRequestForm({ tenant, branch, initial, submitLabel }: { tenant: string; branch: string; initial?: Initial; submitLabel: string }) {
  const [state, action, pending] = useActionState(submitAssistedRequestAction, initialCrudActionState);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="branch" value={branch} />
      <div>
        <label htmlFor="req-details" className="block text-sm font-black text-[#33413b]">Kurulum bilgileriniz</label>
        <p id="req-details-hint" className="mt-1 text-xs leading-5 text-[#5e6a65]">
          Salonlarınızı ve her salondaki masa sayısını, mutfak istasyonlarınızı ve menünüzü (ürün ve fiyatlar) serbestçe yazın. Yalnızca bu dört konu hazırlanır.
        </p>
        <textarea id="req-details" name="details" rows={14} required minLength={5} maxLength={20000} defaultValue={initialDetails(initial)} placeholder={example} aria-describedby="req-details-hint" className={`mt-2 ${field}`} />
      </div>
      <div>
        <label htmlFor="req-notes" className="block text-sm font-black text-[#33413b]">Ek not (isteğe bağlı)</label>
        <textarea id="req-notes" name="notes" rows={2} maxLength={1000} defaultValue={initial?.notes ?? ""} className={`mt-2 ${field}`} />
      </div>
      {state.message && (
        <p role={state.status === "error" ? "alert" : "status"} className={`rounded-xl p-3 text-xs font-semibold leading-5 ${state.status === "error" ? "bg-[#fff7f3] text-[#9e4328]" : "bg-[#eaf6f0] text-[#176e56]"}`}>{state.message}</p>
      )}
      <button type="submit" disabled={pending} className="inline-flex min-h-13 w-full items-center justify-center rounded-xl bg-[color:var(--c-accent-d3)] px-5 text-sm font-black text-white transition hover:bg-[color:var(--c-accent-d5)] disabled:opacity-55 sm:w-auto">
        {pending ? "Gönderiliyor…" : submitLabel}
      </button>
    </form>
  );
}
