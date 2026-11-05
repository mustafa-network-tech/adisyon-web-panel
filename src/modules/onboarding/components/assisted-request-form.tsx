"use client";

import { useActionState } from "react";
import { initialCrudActionState } from "@/modules/settings/action-state";
import { submitAssistedRequestAction } from "../actions";

const field = "w-full rounded-xl border border-[#dce3df] bg-[#f9faf9] px-3 py-3 text-sm leading-6 outline-none focus:border-[color:var(--c-accent)] focus:bg-white";

type Initial = Partial<Record<"areas" | "tables" | "stations" | "menu" | "notes", string>>;

const sections = [
  { name: "areas", label: "Salonlar ve servis alanları", rows: 4, hint: "Her satıra bir salon veya servis alanı yazın.", placeholder: "Salon\nBahçe\nTeras" },
  { name: "tables", label: "Masalar", rows: 5, hint: "Salon adı, iki nokta, masalar. Aralık yazabilirsiniz; kapasite için parantez kullanın.", placeholder: "Salon: Masa 1-10, VIP (8)\nBahçe: B1-B6 (4)" },
  { name: "stations", label: "Mutfak istasyonları", rows: 4, hint: "Her satıra bir istasyon. İstasyona gidecek menü kategorilerini iki noktadan sonra yazabilirsiniz.", placeholder: "Mutfak: Ana yemek, Çorba\nBar: İçecek, Tatlı" },
  { name: "menu", label: "Menü", rows: 8, hint: "Her satıra: Kategori | Ürün | Fiyat | Açıklama (isteğe bağlı) | İstasyon (isteğe bağlı)", placeholder: "Ana yemek | Adana kebap | 365 | Közde, lavaş ve salata | Mutfak\nİçecek | Çay | 25" },
] as const;

/** The four things MK Digital Systems prepares for the business, and nothing else. */
export function AssistedRequestForm({ tenant, branch, initial, submitLabel }: { tenant: string; branch: string; initial?: Initial; submitLabel: string }) {
  const [state, action, pending] = useActionState(submitAssistedRequestAction, initialCrudActionState);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="branch" value={branch} />
      {sections.map((section) => (
        <div key={section.name}>
          <label htmlFor={`req-${section.name}`} className="block text-sm font-black text-[#33413b]">{section.label}</label>
          <p id={`req-${section.name}-hint`} className="mt-1 text-xs leading-5 text-[#5e6a65]">{section.hint}</p>
          <textarea id={`req-${section.name}`} name={section.name} rows={section.rows} required minLength={2} maxLength={section.name === "menu" ? 20000 : 8000} defaultValue={initial?.[section.name] ?? ""} placeholder={section.placeholder} aria-describedby={`req-${section.name}-hint`} className={`mt-2 ${field}`} />
        </div>
      ))}
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
