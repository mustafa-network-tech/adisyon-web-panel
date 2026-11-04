"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { acceptInvitationAction } from "../actions";
import { initialSettingsActionState } from "../management-types";

export function InvitationAcceptForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInvitationAction, initialSettingsActionState);
  return <form action={action} className="mt-6"><input type="hidden" name="token" value={token} />{state.message && <p role="alert" className="mb-3 rounded-xl bg-[#fff7f3] p-3 text-xs font-semibold text-[#9e4328]">{state.message}</p>}<button disabled={pending} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#17211d] px-5 text-sm font-black text-white disabled:opacity-50"><CheckCircle2 size={17} />{pending ? "Davet kabul ediliyor…" : "Daveti kabul et"}</button></form>;
}
