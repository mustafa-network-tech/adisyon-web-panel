import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { requireWorkspacePermission } from "@/lib/auth/access";
import { actionLabel, auditCategories, summarizeMetadata } from "@/modules/audit/labels";
import { getAuditPage } from "@/modules/audit/repository";

export const metadata: Metadata = { title: "Denetim kaydı" };
export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "Europe/Istanbul",
});

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string; branch: string }>;
  searchParams: Promise<{ kategori?: string; from?: string; to?: string; sayfa?: string }>;
}) {
  const [{ tenant, branch }, query] = await Promise.all([params, searchParams]);
  const context = await requireWorkspacePermission(tenant, branch, ["settings.manage"]);
  const result = await getAuditPage(context.tenantId, {
    category: query.kategori,
    from: query.from,
    to: query.to,
    page: Number(query.sayfa) || 1,
  });
  const base = `/app/${tenant}/${branch}/ayarlar/denetim`;
  const link = (page: number) => {
    const search = new URLSearchParams();
    if (query.kategori) search.set("kategori", query.kategori);
    if (query.from) search.set("from", query.from);
    if (query.to) search.set("to", query.to);
    search.set("sayfa", String(page));
    return `${base}?${search.toString()}`;
  };

  return (
    <section className="p-4 sm:p-6 lg:p-8">
      <Link href={`/app/${tenant}/${branch}/ayarlar`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dce3df] bg-white px-4 text-sm font-bold"><ArrowLeft size={16} /> Ayarlara dön</Link>
      <div className="mb-6 mt-6">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[color:var(--c-accent)]">Güvenlik</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Denetim kaydı</h1>
        <p className="mt-2 text-sm font-semibold text-[#7a8580]">Kim, ne zaman, neyi değiştirdi. Kayıtlar silinemez ve değiştirilemez; maaş tutarı ve kart bilgisi içermez.</p>
      </div>

      <form action={base} className="mb-5 flex flex-wrap items-end gap-3 rounded-[22px] border border-[#dfe5e1] bg-white p-4">
        <label className="text-xs font-bold text-[#68736e]">Kategori
          <select name="kategori" defaultValue={query.kategori || ""} className="mt-1 block min-h-10 rounded-xl border border-[#dce3df] bg-[#f9faf9] px-3 text-sm">
            <option value="">Tümü</option>
            {auditCategories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-[#68736e]">Başlangıç<input type="date" name="from" defaultValue={query.from || ""} className="mt-1 block min-h-10 rounded-xl border border-[#dce3df] bg-[#f9faf9] px-3 text-sm" /></label>
        <label className="text-xs font-bold text-[#68736e]">Bitiş<input type="date" name="to" defaultValue={query.to || ""} className="mt-1 block min-h-10 rounded-xl border border-[#dce3df] bg-[#f9faf9] px-3 text-sm" /></label>
        <button className="min-h-10 rounded-xl bg-[color:var(--c-ink)] px-5 text-sm font-black text-white">Filtrele</button>
        <Link href={base} className="inline-flex min-h-10 items-center rounded-xl border border-[#dce3df] px-4 text-sm font-bold">Temizle</Link>
      </form>

      <div className="overflow-x-auto rounded-[22px] border border-[#dfe5e1] bg-white">
        <table className="w-full min-w-[720px] text-left">
          <thead>
            <tr className="border-b border-[#edf0ee] text-[11px] font-black uppercase tracking-[0.1em] text-[#8a948f]">
              <th className="p-3">Zaman</th><th className="p-3">Kişi</th><th className="p-3">İşlem</th><th className="p-3">Ayrıntı</th>
            </tr>
          </thead>
          <tbody>
            {result.entries.map((entry) => (
              <tr key={entry.id} className="border-b border-[#f3f5f4] align-top text-sm last:border-0">
                <td className="whitespace-nowrap p-3 text-xs font-semibold text-[#68736e]">{dateTime.format(new Date(entry.createdAt))}</td>
                <td className="p-3 font-bold">{entry.actorName}</td>
                <td className="p-3 font-black">{actionLabel(entry.action)}</td>
                <td className="p-3 text-xs font-semibold text-[#68736e]">{summarizeMetadata(entry.metadata)}</td>
              </tr>
            ))}
            {result.entries.length === 0 && <tr><td colSpan={4} className="p-10 text-center text-sm font-semibold text-[#8a948f]">Bu filtreyle kayıt bulunamadı.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm font-bold text-[#68736e]">
        <span>{result.total} kayıt · sayfa {result.page}/{result.pageCount}</span>
        <div className="flex gap-2">
          {result.page > 1 && <Link href={link(result.page - 1)} className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-[#dce3df] bg-white px-3"><ChevronLeft size={16} />Önceki</Link>}
          {result.page < result.pageCount && <Link href={link(result.page + 1)} className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-[#dce3df] bg-white px-3">Sonraki<ChevronRight size={16} /></Link>}
        </div>
      </div>
    </section>
  );
}
