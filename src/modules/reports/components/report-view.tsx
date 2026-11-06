import { formatMoney } from "@/lib/money";
import { formatDay } from "@/modules/staff/dates";
import type { SalesReport } from "../types";

const timeFormatter = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function Tile({ label, value, hint, tone = "default" }: { label: string; value: string; hint?: string; tone?: "default" | "good" | "warn" }) {
  const color = tone === "good" ? "text-[#176e56]" : tone === "warn" ? "text-[color:var(--c-accent-d6)]" : "text-[color:var(--c-ink)]";
  return (
    <div className="rounded-[20px] border border-[#dfe5e1] bg-white p-4">
      <p className="text-[11px] font-black uppercase tracking-[0.1em] text-[#8a948f]">{label}</p>
      <p className={`mt-2 text-2xl font-black ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs font-semibold text-[#8a948f]">{hint}</p>}
    </div>
  );
}

function Bars({ rows, label }: { rows: { key: string; label: string; value: number; sub: string }[]; label: string }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <ul className="space-y-2" aria-label={label}>
      {rows.map((row) => (
        <li key={row.key} className="grid grid-cols-[72px_1fr_auto] items-center gap-3 text-xs font-bold">
          <span className="text-[#68736e]">{row.label}</span>
          <span className="h-5 overflow-hidden rounded-md bg-[#eef1ef]" role="img" aria-label={`${row.label}: ${row.sub}`}>
            <span className="block h-full rounded-md bg-[color:var(--c-accent)]" style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }} />
          </span>
          <span className="min-w-28 text-right">{row.sub}</span>
        </li>
      ))}
    </ul>
  );
}

function Card({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="rounded-[22px] border border-[#dfe5e1] bg-white p-5 sm:p-6">
      <h2 className="text-lg font-black">{title}</h2>
      {note && <p className="mt-1 text-xs font-semibold text-[#8a948f]">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function ReportView({ report }: { report: SalesReport }) {
  const { summary, payments } = report;
  const collected = payments.cashMinor + payments.cardMinor;
  const refunded = payments.cashRefundMinor + payments.cardRefundMinor;
  const empty = summary.orderCount === 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Tile label="Net satış" value={formatMoney(summary.netMinor)} hint={`${summary.orderCount} kapanan adisyon`} tone="good" />
        <Tile label="Ortalama adisyon" value={formatMoney(summary.averageMinor)} hint={summary.guestCount ? `${summary.guestCount} kişi` : undefined} />
        <Tile label="İndirim / promosyon" value={formatMoney(summary.discountMinor + (summary.promotionMinor ?? 0))} hint={`Brüt ${formatMoney(summary.grossMinor)} · indirim ${formatMoney(summary.discountMinor)} · promosyon ${formatMoney(summary.promotionMinor ?? 0)} · iade ${formatMoney(summary.refundMinor ?? 0)}`} tone={summary.discountMinor + (summary.promotionMinor ?? 0) > 0 ? "warn" : "default"} />
        <Tile label="KDV" value={formatMoney(summary.taxMinor)} hint={`KDV hariç ${formatMoney(summary.netMinor - summary.taxMinor)}`} />
        <Tile label="İptal / ikram" value={formatMoney((summary.voidMinor ?? 0) + (summary.compMinor ?? 0))} hint={`${summary.voidCount ?? 0} kayıt · iptal ${formatMoney(summary.voidMinor ?? 0)} · ikram ${formatMoney(summary.compMinor ?? 0)}`} tone={(summary.voidMinor ?? 0) + (summary.compMinor ?? 0) > 0 ? "warn" : "default"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Tahsilat" note="Ödeme saatine göre; iadeler iade saatine göre düşülür.">
          <dl className="space-y-3 text-sm font-bold">
            <div className="flex justify-between"><dt className="text-[#68736e]">Nakit</dt><dd>{formatMoney(payments.cashMinor)}{payments.cashRefundMinor > 0 && <span className="ml-2 text-xs text-[#b63b32]">−{formatMoney(payments.cashRefundMinor)} iade</span>}</dd></div>
            <div className="flex justify-between"><dt className="text-[#68736e]">Kart</dt><dd>{formatMoney(payments.cardMinor)}{payments.cardRefundMinor > 0 && <span className="ml-2 text-xs text-[#b63b32]">−{formatMoney(payments.cardRefundMinor)} iade</span>}</dd></div>
            <div className="flex justify-between border-t border-[#edf0ee] pt-3 text-base font-black"><dt>Net tahsilat</dt><dd>{formatMoney(collected - refunded)}</dd></div>
            <div className="flex justify-between text-xs text-[#8a948f]"><dt>İptal edilen adisyon</dt><dd>{summary.cancelledCount}</dd></div>
          </dl>
        </Card>

        <Card title="Kasa vardiyaları" note="Seçilen aralıkta açılan kasa oturumları.">
          <ul className="space-y-3">
            {report.sessions.map((session) => (
              <li key={`${session.registerName}-${session.openedAt}`} className="rounded-xl bg-[#f6f8f7] p-3 text-xs font-bold">
                <div className="flex justify-between"><span>{session.registerName}</span><span className="text-[#8a948f]">{timeFormatter.format(new Date(session.openedAt))} → {session.closedAt ? timeFormatter.format(new Date(session.closedAt)) : "açık"}</span></div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[#68736e]">
                  <span>Açılış {formatMoney(session.openingMinor)}</span>
                  <span>Beklenen {formatMoney(session.expectedMinor)}</span>
                  {session.countedMinor !== null && <span>Sayılan {formatMoney(session.countedMinor)}</span>}
                  {session.differenceMinor !== null && <span className={session.differenceMinor === 0 ? "text-[#176e56]" : "text-[#b63b32]"}>Fark {session.differenceMinor > 0 ? "+" : ""}{formatMoney(session.differenceMinor)}</span>}
                </div>
              </li>
            ))}
            {report.sessions.length === 0 && <li className="py-4 text-center text-xs font-semibold text-[#8a948f]">Bu aralıkta kasa oturumu yok.</li>}
          </ul>
        </Card>
      </div>

      {!empty && (
        <>
          <div className="grid gap-5 xl:grid-cols-2">
            {report.byDay.length > 1 && (
              <Card title="Günlük satış">
                <Bars label="Günlük net satış" rows={report.byDay.map((row) => ({ key: row.date, label: formatDay(row.date), value: row.netMinor, sub: `${formatMoney(row.netMinor)} · ${row.orderCount}` }))} />
              </Card>
            )}
            <Card title="Saatlere göre satış" note="Adisyonun kapandığı saat.">
              <Bars label="Saatlik net satış" rows={report.byHour.map((row) => ({ key: String(row.hour), label: `${String(row.hour).padStart(2, "0")}:00`, value: row.netMinor, sub: `${formatMoney(row.netMinor)} · ${row.orderCount}` }))} />
            </Card>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card title="En çok satan ürünler" note="Adisyon indirimi öncesi satır toplamları.">
              <table className="w-full text-left text-sm">
                <thead><tr className="text-[11px] font-black uppercase tracking-[0.1em] text-[#8a948f]"><th className="py-2">Ürün</th><th className="py-2 text-right">Adet</th><th className="py-2 text-right">Tutar</th></tr></thead>
                <tbody>{report.products.map((product) => <tr key={product.name} className="border-t border-[#edf0ee] font-bold"><td className="py-2">{product.name}</td><td className="py-2 text-right">{product.quantity}</td><td className="py-2 text-right">{formatMoney(product.revenueMinor)}</td></tr>)}</tbody>
              </table>
            </Card>
            <div className="space-y-5">
              <Card title="Kategoriler">
                <Bars label="Kategori satışları" rows={report.categories.map((row) => ({ key: row.name, label: row.name.slice(0, 10), value: row.revenueMinor, sub: `${formatMoney(row.revenueMinor)} · ${row.quantity}` }))} />
              </Card>
              <Card title="Personel bazlı satış" note="Adisyonu açan kişiye göre; QR siparişleri müşteri olarak gruplanır.">
                <table className="w-full text-left text-sm">
                  <tbody>{report.staff.map((person) => <tr key={person.name} className="border-t border-[#edf0ee] font-bold first:border-0"><td className="py-2">{person.name}</td><td className="py-2 text-right text-xs text-[#8a948f]">{person.orderCount} adisyon</td><td className="py-2 text-right">{formatMoney(person.netMinor)}</td></tr>)}</tbody>
                </table>
              </Card>
            </div>
          </div>
        </>
      )}
      {empty && <p className="rounded-2xl border border-dashed border-[#cdd5d1] p-10 text-center text-sm font-semibold text-[#8a948f]">Seçilen aralıkta kapanmış adisyon yok.</p>}
    </div>
  );
}
