"use client";

import { useActionState } from "react";
import { Copy, MailPlus, ShieldCheck, UserRoundCog } from "lucide-react";
import { createInvitationAction, setMemberExtrasAction, updateMemberAccessAction } from "../actions";
import { grantablePermissions, initialSettingsActionState, type TeamMember, type TeamSnapshot } from "../management-types";

const inputClass = "min-h-11 w-full rounded-xl border border-[#dce3df] bg-[#f9faf9] px-3 text-sm outline-none focus:border-[color:var(--c-accent)] focus:bg-white";
const statusLabel = { active: "Aktif", invited: "Davetli", suspended: "Askıda" } as const;

function assignableRoles(snapshot: TeamSnapshot) {
  return snapshot.canGrantExtras ? snapshot.roles : snapshot.roles.filter((role) => role.scope === "branch");
}

function MemberExtrasForm({ tenant, branch, member, snapshot }: { tenant: string; branch: string; member: TeamMember; snapshot: TeamSnapshot }) {
  const [state, action, pending] = useActionState(setMemberExtrasAction, initialSettingsActionState);
  return <form action={action} className="mt-3 rounded-xl border border-dashed border-[#cfd8d3] bg-white p-3">
    <input type="hidden" name="tenant" value={tenant} /><input type="hidden" name="branch" value={branch} /><input type="hidden" name="membershipId" value={member.id} />
    <fieldset><legend className="text-[11px] font-black uppercase tracking-[0.1em] text-[#8a948f]">Ek yetkiler</legend><div className="mt-2 flex flex-wrap gap-2">{grantablePermissions.map((item) => <label key={item.code} className="flex min-h-9 items-center gap-2 rounded-lg border border-[#dce3df] px-3 text-xs font-bold"><input type="checkbox" name="permissionCodes" value={item.code} defaultChecked={member.permissionCodes.includes(item.code)} />{item.label}</label>)}</div></fieldset>
    {snapshot.stations.length > 0 && <fieldset className="mt-3"><legend className="text-[11px] font-black uppercase tracking-[0.1em] text-[#8a948f]">Mutfak istasyonları <span className="normal-case tracking-normal">(seçilmezse tüm istasyonlar)</span></legend><div className="mt-2 flex flex-wrap gap-2">{snapshot.stations.map((item) => <label key={item.id} className="flex min-h-9 items-center gap-2 rounded-lg border border-[#dce3df] px-3 text-xs font-bold"><input type="checkbox" name="stationIds" value={item.id} defaultChecked={member.stationIds.includes(item.id)} />{item.name} · {item.branchName}</label>)}</div></fieldset>}
    {state.message && <p role={state.status === "error" ? "alert" : "status"} className={`mt-3 text-xs font-semibold ${state.status === "error" ? "text-[#9e4328]" : "text-[#176e56]"}`}>{state.message}</p>}
    <button disabled={pending} className="mt-3 min-h-10 rounded-xl border border-[color:var(--c-ink)] px-4 text-xs font-black disabled:opacity-50">{pending ? "Kaydediliyor…" : "Ek yetkileri kaydet"}</button>
  </form>;
}

function MemberAccessForm({ tenant, branch, member, snapshot }: { tenant: string; branch: string; member: TeamMember; snapshot: TeamSnapshot }) {
  const [state, action, pending] = useActionState(updateMemberAccessAction, initialSettingsActionState);
  return <form action={action} className="rounded-2xl border border-[#e2e7e4] bg-[#fafbfa] p-4">
    <input type="hidden" name="tenant" value={tenant} /><input type="hidden" name="branch" value={branch} /><input type="hidden" name="membershipId" value={member.id} />
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      <div className="min-w-44 flex-1"><p className="text-sm font-black">{member.fullName}</p><p className="mt-1 text-[11px] font-semibold text-[#8a948f]">{member.userId.slice(0, 8)} · {statusLabel[member.status]}</p></div>
      <select name="roleId" defaultValue={member.roleIds[0] || ""} className={`${inputClass} lg:w-48`} required><option value="" disabled>Rol seçin</option>{snapshot.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select>
      <select name="status" defaultValue={member.status} className={`${inputClass} lg:w-32`}><option value="active">Aktif</option><option value="suspended">Askıda</option><option value="invited">Davetli</option></select>
    </div>
    <fieldset className="mt-3"><legend className="text-[11px] font-black uppercase tracking-[0.1em] text-[#8a948f]">Şube erişimi</legend><div className="mt-2 flex flex-wrap gap-2">{snapshot.branches.map((item) => <label key={item.id} className="flex min-h-9 items-center gap-2 rounded-lg border border-[#dce3df] bg-white px-3 text-xs font-bold"><input type="checkbox" name="branchIds" value={item.id} defaultChecked={member.branchIds.includes(item.id)} />{item.name}</label>)}</div></fieldset>
    {state.message && <p role={state.status === "error" ? "alert" : "status"} className={`mt-3 text-xs font-semibold ${state.status === "error" ? "text-[#9e4328]" : "text-[#176e56]"}`}>{state.message}</p>}
    <button disabled={pending} className="mt-3 min-h-10 rounded-xl bg-[color:var(--c-ink)] px-4 text-xs font-black text-white disabled:opacity-50">{pending ? "Güncelleniyor…" : "Erişimi güncelle"}</button>
  </form>;
}

export function TeamManager({ tenant, branch, snapshot }: { tenant: string; branch: string; snapshot: TeamSnapshot }) {
  const [inviteState, inviteAction, invitePending] = useActionState(createInvitationAction, initialSettingsActionState);
  return <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
    <aside className="space-y-5">
      <form action={inviteAction} className="rounded-[22px] border border-[#dfe5e1] bg-white p-5">
        <input type="hidden" name="tenant" value={tenant} /><input type="hidden" name="branch" value={branch} />
        <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-[color:var(--c-accent)]">Güvenli davet</p><h2 className="mt-1 text-xl font-black">Ekip üyesi ekle</h2></div><MailPlus className="text-[#8a948f]" /></div>
        <label className="mt-5 block"><span className="mb-2 block text-xs font-bold text-[#68736e]">E-posta</span><input className={inputClass} type="email" name="email" required /></label>
        <label className="mt-3 block"><span className="mb-2 block text-xs font-bold text-[#68736e]">Rol</span><select className={inputClass} name="roleId" required><option value="">Rol seçin</option>{assignableRoles(snapshot).map((role) => <option key={role.id} value={role.id}>{role.name}{role.scope === "tenant" ? " (tüm şubeler)" : ""}</option>)}</select></label>
        <label className="mt-3 block"><span className="mb-2 block text-xs font-bold text-[#68736e]">Geçerlilik</span><select className={inputClass} name="validHours" defaultValue="72"><option value="24">24 saat</option><option value="72">3 gün</option><option value="168">7 gün</option></select></label>
        <p className="mt-3 text-[11px] leading-5 text-[#8a948f]">İlk erişim mevcut şube için verilir. Kullanıcı sonradan diğer şubelere atanabilir.</p>
        {inviteState.message && <p role={inviteState.status === "error" ? "alert" : "status"} className={`mt-3 rounded-xl p-3 text-xs font-semibold ${inviteState.status === "error" ? "bg-[#fff7f3] text-[#9e4328]" : "bg-[#edf8f3] text-[#176e56]"}`}>{inviteState.message}</p>}
        {inviteState.invitationUrl && <div className="mt-3 rounded-xl border border-[#dce3df] p-3"><input readOnly value={inviteState.invitationUrl} className="w-full truncate bg-transparent text-xs" /><button type="button" onClick={() => navigator.clipboard.writeText(inviteState.invitationUrl || "")} className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#eef1ef] px-3 text-xs font-black"><Copy size={14} /> Kopyala</button></div>}
        <button disabled={invitePending} className="mt-4 min-h-11 w-full rounded-xl bg-[color:var(--c-accent)] text-sm font-black text-white disabled:opacity-50">{invitePending ? "Oluşturuluyor…" : "Davet bağlantısı oluştur"}</button>
      </form>
      <div className="rounded-[22px] border border-[#cbded6] bg-[#edf8f3] p-4"><ShieldCheck size={19} className="text-[#23866b]" /><p className="mt-3 text-sm font-black text-[#176e56]">E-posta eşleşmesi zorunlu</p><p className="mt-1 text-xs leading-5 text-[#397a67]">Bağlantı yalnızca davet edilen e-postayla oturum açan hesap tarafından kullanılabilir.</p></div>
    </aside>
    <section className="space-y-5">
      <div className="rounded-[22px] border border-[#dfe5e1] bg-white p-5"><div className="flex items-center justify-between"><div><h2 className="text-lg font-black">Kullanıcılar ve erişimler</h2><p className="mt-1 text-xs font-semibold text-[#8a948f]">{snapshot.members.length} üyelik</p></div><UserRoundCog className="text-[#8a948f]" /></div><div className="mt-4 space-y-3">{snapshot.members.map((member) => { const hasTenantRole = member.roleIds.some((id) => snapshot.roles.find((role) => role.id === id)?.scope === "tenant"); return <div key={member.id}><MemberAccessForm tenant={tenant} branch={branch} member={member} snapshot={snapshot} />{snapshot.canGrantExtras && !hasTenantRole && <MemberExtrasForm tenant={tenant} branch={branch} member={member} snapshot={snapshot} />}</div>; })}{snapshot.members.length === 0 && <p className="py-8 text-center text-sm font-semibold text-[#8a948f]">Henüz ekip üyesi yok.</p>}</div></div>
      <div className="rounded-[22px] border border-[#dfe5e1] bg-white p-5"><h2 className="text-lg font-black">Bekleyen davetler</h2><div className="mt-4 space-y-2">{snapshot.invitations.map((item) => <div key={item.id} className="rounded-xl bg-[#f6f8f7] p-3"><p className="text-sm font-black">{item.email}</p><p className="mt-1 text-xs font-semibold text-[#8a948f]">{item.roleName} · {item.branchName} · {new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.expiresAt))}</p></div>)}{snapshot.invitations.length === 0 && <p className="py-5 text-center text-xs font-semibold text-[#8a948f]">Bekleyen davet yok.</p>}</div></div>
    </section>
  </div>;
}
