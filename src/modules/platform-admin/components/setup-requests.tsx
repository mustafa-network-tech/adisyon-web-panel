import Link from "next/link";
import { ArrowRight, LifeBuoy } from "lucide-react";
import { planForCode } from "@/modules/onboarding/plans";
import { statusLabels } from "@/modules/onboarding/status";
import type { SetupRequestSummary } from "../setup-data";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

/** "Kurulum Talepleri": businesses that asked MK Digital Systems to prepare their setup. */
export function SetupRequests({ requests }: { requests: SetupRequestSummary[] }) {
  return (
    <section aria-labelledby="kurulum-talepleri" className="mt-5 overflow-hidden rounded-[24px] border border-[#dfe5e1] bg-white">
      <div className="flex items-center gap-3 border-b border-[#e5e9e7] p-5">
        <span className="grid size-10 place-items-center rounded-xl bg-[#e8f0fb] text-[#285e9f]"><LifeBuoy size={19} aria-hidden="true" /></span>
        <div><h2 id="kurulum-talepleri" className="text-xl font-black">Kurulum Talepleri</h2><p className="mt-1 text-xs font-semibold text-[#5e6a65]">Salon, masa, mutfak istasyonu ve menü kurulumu isteyen işletmeler</p></div>
      </div>
      {requests.length === 0
        ? <p className="px-5 py-10 text-center text-sm font-semibold text-[#5e6a65]">Bekleyen kurulum talebi yok.</p>
        : (
          <ul className="divide-y divide-[#edf0ee]">
            {requests.map((request) => (
              <li key={request.tenantId}>
                <Link href={`/mk-admin/kurulum/${request.tenantId}`} className="flex flex-col gap-2 px-5 py-4 hover:bg-[#fafbfa] sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    <span className="block text-sm font-black">{request.tenantName}</span>
                    <span className="mt-1 block text-xs font-semibold text-[#5e6a65]">{planForCode(request.selectedPlan).name} · {formatDate(request.requestedAt)}</span>
                  </span>
                  <span className="flex items-center gap-3 text-sm font-black">
                    <span className="rounded-full bg-[#f1f3f2] px-3 py-1 text-xs">{request.trialStartedAt ? "Deneme başlatıldı" : statusLabels[request.status]}</span>
                    <ArrowRight size={16} aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
