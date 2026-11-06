"use client";

import { useActionState } from "react";
import { Copy, KeyRound, ShieldCheck, UserRoundCog } from "lucide-react";
import { decideJoinRequestAction, rotateJoinCodeAction, setMemberExtrasAction, updateMemberAccessAction } from "../actions";
import { statusOptionsFor } from "../role-rules";
import { grantablePermissions, initialSettingsActionState, type JoinRequest, type TeamMember, type TeamSnapshot } from "../management-types";

const inputClass = "min-h-11 w-full rounded-xl border border-[#dce3df] bg-[#f9faf9] px-3 text-sm outline-none focus:border-[color:var(--c-accent)] focus:bg-white";
const statusLabel = { active: "Aktif", invited: "Bekliyor", suspended: "Askıda" } as const;

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
      <select name="status" defaultValue={member.status} className={`${inputClass} lg:w-32`}>{statusOptionsFor(member.status, snapshot.canGrantExtras).map((value) => <option key={value} value={value}>{statusLabel[value]}</option>)}</select>
    </div>
    {member.status === "suspended" && !snapshot.canGrantExtras && <p className="mt-3 text-xs font-semibold text-[#8a948f]">Bu kullanıcı askıda. Yeniden etkinleştirmek için işletme yöneticinize başvurun.</p>}
    <fieldset className="mt-3"><legend className="text-[11px] font-black uppercase tracking-[0.1em] text-[#8a948f]">Şube erişimi</legend><div className="mt-2 flex flex-wrap gap-2">{snapshot.branches.map((item) => <label key={item.id} className="flex min-h-9 items-center gap-2 rounded-lg border border-[#dce3df] bg-white px-3 text-xs font-bold"><input type="checkbox" name="branchIds" value={item.id} defaultChecked={member.branchIds.includes(item.id)} />{item.name}</label>)}</div></fieldset>
    {state.message && <p role={state.status === "error" ? "alert" : "status"} className={`mt-3 text-xs font-semibold ${state.status === "error" ? "text-[#9e4328]" : "text-[#176e56]"}`}>{state.message}</p>}
    <button disabled={pending} className="mt-3 min-h-10 rounded-xl bg-[color:var(--c-ink)] px-4 text-xs font-black text-white disabled:opacity-50">{pending ? "Güncelleniyor…" : "Erişimi güncelle"}</button>
  </form>;
}

function JoinRequestCard({ tenant, branch, request, snapshot }: { tenant: string; branch: string; request: JoinRequest; snapshot: TeamSnapshot }) {
  const [state, action, pending] = useActionState(decideJoinRequestAction, initialSettingsActionState);
  return <form action={action} className="rounded-2xl border border-[#e2e7e4] bg-[#fafbfa] p-4">
    <input type="hidden" name="tenant" value={tenant} /><input type="hidden" name="branch" value={branch} /><input type="hidden" name="requestId" value={request.id} />
    <p className="text-sm font-black">{request.fullName || request.email}</p>
    <p className="mt-1 text-xs font-semibold text-[#8a948f]">{request.email} · {new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(request.createdAt))}</p>
    <select name="roleId" defaultValue="" className={`${inputClass} mt-3`}><option value="">Rol seçin</option>{assignableRoles(snapshot).map((role) => <option key={role.id} value={role.id}>{role.name}{role.scope === "tenant" ? " (tüm şubeler)" : ""}</option>)}</select>
    <fieldset className="mt-3"><legend className="text-[11px] font-black uppercase tracking-[0.1em] text-[#8a948f]">Şube erişimi</legend><div className="mt-2 flex flex-wrap gap-2">{snapshot.branches.map((item) => <label key={item.id} className="flex min-h-9 items-center gap-2 rounded-lg border border-[#dce3df] bg-white px-3 text-xs font-bold"><input type="checkbox" name="branchIds" value={item.id} />{item.name}</label>)}</div></fieldset>
    {state.message && <p role={state.status === "error" ? "alert" : "status"} className={`mt-3 text-xs font-semibold ${state.status === "error" ? "text-[#9e4328]" : "text-[#176e56]"}`}>{state.message}</p>}
    <div className="mt-3 flex gap-2">
      <button disabled={pending} name="decision" value="approve" className="min-h-10 rounded-xl bg-[color:var(--c-accent)] px-4 text-xs font-black text-white disabled:opacity-50">Onayla</button>
      <button disabled={pending} name="decision" value="reject" className="min-h-10 rounded-xl border border-[#dce3df] px-4 text-xs font-black disabled:opacity-50">Reddet</button>
    </div>
  </form>;
}

function JoinCodeCard({ tenant, branch, snapshot }: { tenant: string; branch: string; snapshot: TeamSnapshot }) {
  const [state, action, pending] = useActionState(rotateJoinCodeAction, initialSettingsActionState);
  const code = state.joinCode ?? snapshot.joinCode;
  return <form action={action} className="rounded-[22px] border border-[#dfe5e1] bg-white p-5">
    <input type="hidden" name="tenant" value={tenant} /><input type="hidden" name="branch" value={branch} />
    <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-[color:var(--c-accent)]">Katılım kodu</p><h2 className="mt-1 text-xl font-black">Ekibi işletmeye katın</h2></div><KeyRound className="text-[#8a948f]" /></div>
    <p className="mt-3 text-xs leading-5 text-[#68736e]">Personel hesap açtıktan sonra “Mevcut işletmeye katıl” seçeneğinde işletme adını ve bu kodu yazar. Kodu bilmek erişim vermez: talebi siz onaylayıp rol ve şube belirlersiniz.</p>
    {code ? <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#dce3df] p-3"><span className="flex-1 font-mono text-sm font-black tracking-widest">{code}</span><button type="button" onClick={() => navigator.clipboard.writeText(code)} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#eef1ef] px-3 text-xs font-black"><Copy size={14} /> Kopyala</button></div> : <p className="mt-3 text-xs font-semibold text-[#8a948f]">Katılım kodunu yalnızca işletme düzeyindeki yöneticiler görür.</p>}
    {state.message && <p role={state.status === "error" ? "alert" : "status"} className={`mt-3 text-xs font-semibold ${state.status === "error" ? "text-[#9e4328]" : "text-[#176e56]"}`}>{state.message}</p>}
    {snapshot.canGrantExtras && <button disabled={pending} className="mt-4 min-h-11 w-full rounded-xl border border-[color:var(--c-ink)] text-sm font-black disabled:opacity-50">{pending ? "Yenileniyor…" : "Kodu yenile (eski kod geçersiz olur)"}</button>}
  </form>;
}

export function TeamManager({ tenant, branch, snapshot }: { tenant: string; branch: string; snapshot: TeamSnapshot }) {
  return <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
    <aside className="space-y-5">
      <JoinCodeCard tenant={tenant} branch={branch} snapshot={snapshot} />
      <div className="rounded-[22px] border border-[#cbded6] bg-[#edf8f3] p-4"><ShieldCheck size={19} className="text-[#23866b]" /><p className="mt-3 text-sm font-black text-[#176e56]">Onay olmadan erişim yok</p><p className="mt-1 text-xs leading-5 text-[#397a67]">Bekleyen, reddedilen veya askıdaki kullanıcılar hiçbir işletme verisini göremez.</p></div>
    </aside>
    <section className="space-y-5">
      <div className="rounded-[22px] border border-[#dfe5e1] bg-white p-5"><h2 className="text-lg font-black">Katılma talepleri</h2><div className="mt-4 space-y-3">{snapshot.joinRequests.map((item) => <JoinRequestCard key={item.id} tenant={tenant} branch={branch} request={item} snapshot={snapshot} />)}{snapshot.joinRequests.length === 0 && <p className="py-5 text-center text-xs font-semibold text-[#8a948f]">Bekleyen talep yok.</p>}</div></div>
      <div className="rounded-[22px] border border-[#dfe5e1] bg-white p-5"><div className="flex items-center justify-between"><div><h2 className="text-lg font-black">Kullanıcılar ve erişimler</h2><p className="mt-1 text-xs font-semibold text-[#8a948f]">{snapshot.members.length} üyelik</p></div><UserRoundCog className="text-[#8a948f]" /></div><div className="mt-4 space-y-3">{snapshot.members.map((member) => { const hasTenantRole = member.roleIds.some((id) => snapshot.roles.find((role) => role.id === id)?.scope === "tenant"); return <div key={member.id}><MemberAccessForm tenant={tenant} branch={branch} member={member} snapshot={snapshot} />{snapshot.canGrantExtras && !hasTenantRole && <MemberExtrasForm tenant={tenant} branch={branch} member={member} snapshot={snapshot} />}</div>; })}{snapshot.members.length === 0 && <p className="py-8 text-center text-sm font-semibold text-[#8a948f]">Henüz ekip üyesi yok.</p>}</div></div>
    </section>
  </div>;
}
