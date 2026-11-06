import type { DiscountAuditRow } from "../repository";

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
const when = new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });
const fmt = (minor: number) => money.format(minor / 100);

/** Discount / promotion audit: who gave how much, on which adisyon, at what original total. */
export function DiscountAudit({ rows }: { rows: DiscountAuditRow[] }) {
  const discount = rows.filter((row) => row.kind === "discount").reduce((sum, row) => sum + row.amountMinor, 0);
  const promotion = rows.filter((row) => row.kind === "promotion").reduce((sum, row) => sum + row.amountMinor, 0);
  return (
    <section className="rounded-[22px] border border-[#dfe5e1] bg-white p-5">
      <h2 className="text-lg font-black">İndirim ve promosyon denetimi</h2>
      <p className="mt-1 text-xs font-semibold text-[#8a948f]">Yalnızca kasada ödeme sırasında verilir; kayıtlar değiştirilemez. İndirim {fmt(discount)} · Promosyon {fmt(promotion)}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs font-bold">
          <thead className="text-[#8a948f]"><tr><th className="py-2">Zaman</th><th>Şube</th><th>Masa</th><th>Adisyon</th><th>Asıl tutar</th><th>Nakit</th><th>Kart</th><th>Tür</th><th>Tutar</th><th>Kasiyer</th><th>Neden</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.adjustmentId} className="border-t border-[#edf0ee]">
                <td className="py-2">{when.format(new Date(row.createdAt))}</td><td>{row.branchName}</td><td>{row.tableLabel ?? "—"}</td><td>{row.orderNumber}</td>
                <td>{fmt(row.originalTotalMinor)}</td><td>{fmt(row.cashMinor)}</td><td>{fmt(row.cardMinor)}</td>
                <td>{row.kind === "discount" ? "İndirim" : "Promosyon"}</td><td>{fmt(row.amountMinor)}</td><td>{row.cashierName}</td><td className="font-semibold text-[#68736e]">{row.reason ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={11} className="py-6 text-center text-[#8a948f]">Bu aralıkta indirim veya promosyon yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
