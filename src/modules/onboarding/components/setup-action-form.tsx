"use client";

import { useActionState } from "react";
import { initialCrudActionState, type CrudActionState } from "@/modules/settings/action-state";

type SetupAction = (previous: CrudActionState, formData: FormData) => Promise<CrudActionState>;

const variants = {
  primary: "bg-[color:var(--c-accent-d3)] text-white hover:bg-[color:var(--c-accent-d5)]",
  dark: "bg-[color:var(--c-ink)] text-white hover:bg-[color:var(--c-ink-2)]",
  light: "border border-[#d6ddd9] bg-white text-[color:var(--c-ink)] hover:border-[#aeb9b3]",
} as const;

/** A single-button form for a setup server action; shows the result message under the button. */
export function SetupActionForm({
  action,
  tenant,
  branch,
  hidden = {},
  label,
  pendingLabel = "Kaydediliyor…",
  variant = "dark",
  className = "",
}: {
  action: SetupAction;
  tenant: string;
  branch: string;
  hidden?: Record<string, string>;
  label: string;
  pendingLabel?: string;
  variant?: keyof typeof variants;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialCrudActionState);
  return (
    <form action={formAction} className={className}>
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="branch" value={branch} />
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" disabled={pending} className={`inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-sm font-black transition disabled:opacity-55 ${variants[variant]}`}>
        {pending ? pendingLabel : label}
      </button>
      {state.message && (
        <p role={state.status === "error" ? "alert" : "status"} className={`mt-3 rounded-xl p-3 text-xs font-semibold leading-5 ${state.status === "error" ? "bg-[#fff7f3] text-[#9e4328]" : "bg-[#eaf6f0] text-[#176e56]"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
