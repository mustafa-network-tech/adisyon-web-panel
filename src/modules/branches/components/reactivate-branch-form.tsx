"use client";

import { useActionState } from "react";
import { initialCrudActionState } from "@/modules/settings/action-state";
import { reactivateBranchAction } from "../actions";

export function ReactivateBranchForm({ tenant, branch, branchId }: { tenant: string; branch: string; branchId: string }) {
  const [state, action, pending] = useActionState(reactivateBranchAction, initialCrudActionState);
  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="tenant" value={tenant} /><input type="hidden" name="branch" value={branch} /><input type="hidden" name="branchId" value={branchId} />
      {state.message && <p role={state.status === "error" ? "alert" : "status"} className={`mb-2 text-xs font-semibold ${state.status === "error" ? "text-[#9e4328]" : "text-[#176e56]"}`}>{state.message}</p>}
      <button type="submit" disabled={pending} className="min-h-10 rounded-xl border border-[color:var(--c-ink)] px-4 text-xs font-black disabled:opacity-50">{pending ? "Açılıyor…" : "Şubeyi yeniden aç"}</button>
    </form>
  );
}
