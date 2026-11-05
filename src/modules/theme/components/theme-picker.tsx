"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { setThemeAction } from "../actions";
import { themes, type ThemeId } from "../themes";

type Props = { tenant: string; branch: string; current: ThemeId };

export function ThemePicker({ tenant, branch, current }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<ThemeId>(current);
  const [feedback, setFeedback] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setFeedback(null);
    startTransition(async () => {
      const result = await setThemeAction({ tenant, branch, theme: selected });
      setFeedback({ type: result.ok ? "success" : "error", message: result.message });
      if (result.ok) router.refresh();
    });
  }

  return (
    <div>
      <fieldset>
        <legend className="sr-only">Tema seçin</legend>
        <div className="grid gap-5 md:grid-cols-3">
          {themes.map((theme) => {
            const active = selected === theme.id;
            const [ink, accent, soft] = theme.swatches;
            return (
              <label key={theme.id} className={`relative block cursor-pointer rounded-[22px] border-2 bg-white p-4 transition ${active ? "border-[#17211d] shadow-[0_14px_36px_rgb(23_33_29/0.12)]" : "border-[#dfe5e1] hover:border-[#aeb9b3]"}`}>
                <input type="radio" name="theme" value={theme.id} checked={active} onChange={() => setSelected(theme.id)} className="sr-only" />
                {/* Small mock of the panel in the theme's colours */}
                <div className="overflow-hidden rounded-xl border border-[#e3e8e5]" aria-hidden="true">
                  <div className="flex h-28">
                    <div className="w-1/4 p-2" style={{ backgroundColor: ink }}>
                      <div className="h-3 rounded-sm bg-white/90" />
                      <div className="mt-3 h-2 rounded-sm bg-white/25" />
                      <div className="mt-1.5 h-2 rounded-sm bg-white/25" />
                      <div className="mt-1.5 h-2 rounded-sm" style={{ backgroundColor: accent }} />
                    </div>
                    <div className="flex-1 bg-[#f4f6f8] p-2.5">
                      <div className="h-3 w-2/3 rounded-sm bg-[#17211d]/80" />
                      <div className="mt-2.5 flex gap-1.5">
                        <div className="h-9 flex-1 rounded-md" style={{ backgroundColor: soft }} />
                        <div className="h-9 flex-1 rounded-md bg-white" />
                      </div>
                      <div className="mt-2.5 h-5 w-1/2 rounded-md" style={{ backgroundColor: accent }} />
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-black">{theme.name}</p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-[#68736e]">{theme.description}</p>
                  </div>
                  <span className={`grid size-7 shrink-0 place-items-center rounded-full ${active ? "bg-[#17211d] text-white" : "border border-[#dce3df] text-transparent"}`}><Check size={15} /></span>
                </div>
                <div className="mt-3 flex gap-1.5" aria-hidden="true">
                  {theme.swatches.map((color) => <span key={color} className="size-5 rounded-full border border-black/10" style={{ backgroundColor: color }} />)}
                </div>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={isPending || selected === current} className="min-h-12 rounded-xl bg-[color:var(--c-accent)] px-7 text-sm font-black text-white disabled:opacity-45">{isPending ? "Kaydediliyor…" : "Temayı uygula"}</button>
        {feedback && <p role={feedback.type === "error" ? "alert" : "status"} className={`rounded-xl px-3 py-2 text-xs font-semibold ${feedback.type === "error" ? "bg-[#fff7f3] text-[#9e4328]" : "bg-[#edf8f3] text-[#176e56]"}`}>{feedback.message}</p>}
      </div>
    </div>
  );
}
