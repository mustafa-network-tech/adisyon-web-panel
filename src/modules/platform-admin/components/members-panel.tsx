"use client";

import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import { initialSettingsActionState } from "@/modules/settings/management-types";
import { assignMemberAction } from "../actions";
import type { PlatformMember } from "../types";

const inputClass = "min-h-10 rounded-lg border border-[#dce3df] bg-white px-2 text-xs outline-none focus:border-[#e8623a]";
const roles = [
  ["owner", "İşletme Sahibi"],
  ["tenant_admin", "İşletme Yöneticisi"],
  ["manager", "Müdür"],
  ["cashier", "Kasa"],
  ["kitchen", "Mutfak"],
  ["waiter", "Garson"],
] as const;

function AssignForm({ member, tenants }: { member: PlatformMember; tenants: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState(assignMemberAction, initialSettingsActionState);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="userId" value={member.userId} />
      <select name="tenantId" required defaultValue="" className={inputClass} aria-label="İşletme">
        <option value="" disabled>İşletme</option>
        {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
      </select>
      <select name="roleCode" defaultValue="owner" className={inputClass} aria-label="Rol">
        {roles.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
      </select>
      <button disabled={pending || tenants.length === 0} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[#17211d] px-3 text-xs font-black text-white disabled:opacity-50"><UserPlus size={14} /> {pending ? "Atanıyor…" : "Ata"}</button>
      {state.message && <span role={state.status === "error" ? "alert" : "status"} className={`w-full text-[11px] font-semibold ${state.status === "error" ? "text-[#9e4328]" : "text-[#176e56]"}`}>{state.message}</span>}
    </form>
  );
}

export function MembersPanel({ members, tenants }: { members: PlatformMember[]; tenants: Array<{ id: string; name: string }> }) {
  return (
    <div className="mt-5 overflow-hidden rounded-[24px] border border-[#dfe5e1] bg-white">
      <div className="border-b border-[#e5e9e7] p-5">
        <h2 className="text-xl font-black">Üyeler</h2>
        <p className="mt-1 text-xs font-semibold text-[#8a948f]">Sisteme kayıt olan hesaplar. İşletmesi olmayanları buradan bir işletmeye atayabilirsiniz.</p>
      </div>
      <div className="divide-y divide-[#edf0ee]">
        {members.map((member) => (
          <div key={member.userId} className="grid gap-3 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-sm font-black">{member.fullName || member.email}</p>
              <p className="mt-1 text-xs font-semibold text-[#8a948f]">{member.email}</p>
              <p className="mt-2 text-xs font-bold text-[#68736e]">
                {member.tenants.length === 0
                  ? "İşletmesi yok"
                  : member.tenants.map((item) => `${item.tenantName} · ${item.roles.join(", ") || "Rol yok"}`).join(" | ")}
              </p>
            </div>
            <AssignForm member={member} tenants={tenants} />
          </div>
        ))}
        {members.length === 0 && <p className="p-10 text-center text-sm font-semibold text-[#8a948f]">Henüz kayıtlı üye yok.</p>}
      </div>
    </div>
  );
}
