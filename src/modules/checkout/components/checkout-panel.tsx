"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banknote, CheckCircle2, CloudOff, CreditCard, LockKeyhole, PlusCircle, Printer, ReceiptText, Scissors, WalletCards } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CheckoutSnapshot, PaymentMethod } from "@/modules/cash-register/types";
import { buildBillReceipt } from "@/modules/receipts/builders";
import { PaperWidthSelect, useReceiptPrinter } from "@/modules/receipts/components/receipt-print";
import type { ReceiptBranding } from "@/modules/receipts/types";
import { closeCashSessionAction, openCashSessionAction, recordCashMovementAction, recordOrderPaymentsAction, refundPaymentAction } from "../actions";
import { moneyToMinor } from "../validation";
import { CashierTables } from "./cashier-tables";
import type { DiningArea, RestaurantTable } from "@/modules/tables/types";

type PaymentMode = "full" | "amount" | "mixed" | "items";
type CheckoutPanelProps = CheckoutSnapshot & {
  tenant: string;
  branch: string;
  branchId: string;
  canOpen: boolean;
  canClose: boolean;
  canPay: boolean;
  canRefund: boolean;
  areas: DiningArea[];
  tables: RestaurantTable[];
  branding: ReceiptBranding;
};

const inputClass = "min-h-11 w-full rounded-xl border border-[#dce3df] bg-[#f9faf9] px-3 text-sm outline-none focus:border-[color:var(--c-accent)]";

export function CheckoutPanel(props: CheckoutPanelProps) {
  const { tenant, branch, branchId, registers, sessions, orders, recentPayments, cashTotalMinor, cardTotalMinor, refundTotalMinor, canOpen, canClose, canPay, canRefund, areas, tables, branding } = props;
  const { print, receiptArea } = useReceiptPrinter();
  const router = useRouter();
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [sessionId, setSessionId] = useState(sessions[0]?.id || "");
  const [selectedOrderId, setSelectedOrderId] = useState(orders[0]?.id || "");
  const [rawMode, setMode] = useState<PaymentMode>("full");
  const [method, setMethod] = useState<PaymentMethod>("card");
  const [amount, setAmount] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [cardAmount, setCardAmount] = useState("");
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>({});
  const [openingAmount, setOpeningAmount] = useState("0");
  const [registerId, setRegisterId] = useState(registers[0]?.id || "");
  const [movementType, setMovementType] = useState<"income" | "expense">("expense");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [closingAmount, setClosingAmount] = useState("");
  const [refundPaymentId, setRefundPaymentId] = useState(recentPayments[0]?.id || "");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [feedback, setFeedback] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestKey = useRef<string | null>(null);

  const session = sessions.find((item) => item.id === sessionId) || sessions[0];
  const selectedOrder = orders.find((item) => item.id === selectedOrderId) || orders[0];
  // Item-split payments do not add up once an adisyon discount exists.
  const mode: PaymentMode = rawMode === "items" && selectedOrder && selectedOrder.discountMinor > 0 ? "full" : rawMode;
  const refundablePayment = recentPayments.find((item) => item.id === refundPaymentId);

  useEffect(() => {
    const onOnline = () => { setOnline(true); router.refresh(); };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, [router]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const refresh = () => router.refresh();
    const channel = supabase.channel(`checkout:${branchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: `branch_id=eq.${branchId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_sessions", filter: `branch_id=eq.${branchId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_refunds", filter: `branch_id=eq.${branchId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `branch_id=eq.${branchId}` }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [branchId, router]);

  const itemSplitTotal = useMemo(() => selectedOrder?.items.reduce((sum, item) => sum + (itemQuantities[item.id] || 0) * item.unitPriceMinor, 0) || 0, [itemQuantities, selectedOrder]);
  function invalidate() { requestKey.current = null; setFeedback(null); }
  function execute(operation: () => Promise<{ ok: boolean; message: string }>) {
    if (!online) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await operation();
      setFeedback({ type: result.ok ? "success" : "error", message: result.message });
      if (result.ok) { requestKey.current = null; router.refresh(); }
    });
  }

  function openSession() {
    const openingMinor = moneyToMinor(openingAmount);
    if (!registerId || openingMinor === null) return setFeedback({ type: "error", message: "Açılış tutarını kontrol edin." });
    requestKey.current ||= crypto.randomUUID();
    execute(() => openCashSessionAction({ tenant, branch, registerId, openingMinor, idempotencyKey: requestKey.current }));
  }

  function takePayment() {
    if (!session || !selectedOrder) return;
    let payments: { method: PaymentMethod; amountMinor: number; allocations?: { orderItemId: string; quantity: number }[] }[] = [];
    if (mode === "full") payments = [{ method, amountMinor: selectedOrder.outstandingMinor }];
    if (mode === "amount") { const minor = moneyToMinor(amount); if (minor) payments = [{ method, amountMinor: minor }]; }
    if (mode === "mixed") {
      const cash = moneyToMinor(cashAmount) || 0; const card = moneyToMinor(cardAmount) || 0;
      if (cash > 0) payments.push({ method: "cash", amountMinor: cash });
      if (card > 0) payments.push({ method: "card", amountMinor: card });
    }
    if (mode === "items") {
      const allocations = selectedOrder.items.flatMap((item) => (itemQuantities[item.id] || 0) > 0 ? [{ orderItemId: item.id, quantity: itemQuantities[item.id] }] : []);
      if (itemSplitTotal > 0) payments = [{ method, amountMinor: itemSplitTotal, allocations }];
    }
    if (payments.length === 0) return setFeedback({ type: "error", message: "Ödeme tutarını kontrol edin." });
    requestKey.current ||= crypto.randomUUID();
    execute(() => recordOrderPaymentsAction({ tenant, branch, orderId: selectedOrder.id, cashSessionId: session.id, payments, idempotencyKey: requestKey.current }));
  }

  function recordMovement() {
    if (!session) return;
    const amountMinor = moneyToMinor(movementAmount);
    if (!amountMinor) return setFeedback({ type: "error", message: "Hareket tutarını kontrol edin." });
    requestKey.current ||= crypto.randomUUID();
    execute(() => recordCashMovementAction({ tenant, branch, cashSessionId: session.id, movementType, amountMinor, reason: movementReason, idempotencyKey: requestKey.current }));
  }

  function closeSession() {
    if (!session) return;
    const closingMinor = moneyToMinor(closingAmount);
    if (closingMinor === null) return setFeedback({ type: "error", message: "Sayım tutarını kontrol edin." });
    requestKey.current ||= crypto.randomUUID();
    execute(() => closeCashSessionAction({ tenant, branch, cashSessionId: session.id, closingMinor, idempotencyKey: requestKey.current }));
  }

  function refund() {
    if (!session || !refundablePayment) return;
    const amountMinor = moneyToMinor(refundAmount);
    if (!amountMinor) return setFeedback({ type: "error", message: "İade tutarını kontrol edin." });
    requestKey.current ||= crypto.randomUUID();
    execute(() => refundPaymentAction({ tenant, branch, paymentId: refundablePayment.id, cashSessionId: session.id, amountMinor, reason: refundReason, idempotencyKey: requestKey.current }));
  }

  if (!session) return <section className="p-4 sm:p-6 lg:p-8"><Header online={online} subtitle="Tahsilata başlamadan önce bir kasa vardiyası açın." /><CashierTables areas={areas} tables={tables} orders={orders} selectedOrderId={selectedOrder?.id} onSelectOrder={(id) => { setSelectedOrderId(id); setItemQuantities({}); invalidate(); }} /><div className="mt-5 max-w-xl rounded-[24px] border border-[#dfe5e1] bg-white p-6"><LockKeyhole className="text-[color:var(--c-accent)]" /><h2 className="mt-4 text-2xl font-black">Kasa vardiyası aç</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><label><span className="mb-2 block text-xs font-bold">Kasa</span><select value={registerId} onChange={(event) => { setRegisterId(event.target.value); invalidate(); }} className={inputClass}>{registers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span className="mb-2 block text-xs font-bold">Açılış nakdi</span><input value={openingAmount} onChange={(event) => { setOpeningAmount(event.target.value); invalidate(); }} inputMode="decimal" className={inputClass} /></label></div>{feedback && <Feedback {...feedback} />}<button type="button" onClick={openSession} disabled={!canOpen || !online || isPending || registers.length === 0} className="mt-5 min-h-12 w-full rounded-xl bg-[color:var(--c-ink)] text-sm font-black text-white disabled:opacity-45">{isPending ? "Açılıyor…" : "Vardiyayı aç"}</button>{registers.length === 0 && <p className="mt-3 text-xs font-bold text-[#9e4328]">Önce işletme ayarlarından aktif kasa oluşturulmalıdır.</p>}</div></section>;

  return <section className="p-4 sm:p-6 lg:p-8">{receiptArea}<Header online={online} subtitle={`${session.cashRegisterName} · ${new Intl.DateTimeFormat("tr-TR", { timeStyle: "short" }).format(new Date(session.openedAt))} tarihinde açıldı · ${session.openedByName}`} />{sessions.length > 1 && <label className="mt-4 block max-w-xs"><span className="mb-2 block text-xs font-bold text-[#68736e]">Aktif kasa vardiyası</span><select value={session.id} onChange={(event) => { setSessionId(event.target.value); invalidate(); }} className={inputClass}>{sessions.map((item) => <option key={item.id} value={item.id}>{item.cashRegisterName} · {item.openedByName}</option>)}</select></label>}
    <CashierTables areas={areas} tables={tables} orders={orders} selectedOrderId={selectedOrder?.id} onSelectOrder={(id) => { setSelectedOrderId(id); setItemQuantities({}); invalidate(); }} />
    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Açık hesap", String(orders.length), ReceiptText, "text-[color:var(--c-accent-d2)] bg-[color:var(--c-accent-soft)]"], ["Nakit", formatMoney(cashTotalMinor), Banknote, "text-[#176e56] bg-[#e7f5ef]"], ["Kart", formatMoney(cardTotalMinor), CreditCard, "text-[#285e9f] bg-[#eaf2fb]"], ["Beklenen nakit", formatMoney(session.expectedMinor), WalletCards, "text-[#6f4fa0] bg-[#f0eafb]"]].map(([label, value, Icon, style]) => { const ItemIcon = Icon as typeof ReceiptText; return <article key={label as string} className="rounded-2xl border border-[#dfe5e1] bg-white p-4"><span className={`grid size-10 place-items-center rounded-xl ${style}`}><ItemIcon size={19} /></span><p className="mt-5 text-xs font-bold text-[#8a948f]">{label as string}</p><p className="mt-1 text-xl font-black">{value as string}</p></article>; })}</div>
    {feedback && <Feedback {...feedback} />}
    <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_430px]"><div className="space-y-5"><div className="rounded-[24px] border border-[#dfe5e1] bg-white p-5"><div className="flex items-center justify-between"><h2 className="text-xl font-black">Tahsilat bekleyenler</h2><span className="rounded-lg bg-[#f0f2f1] px-3 py-2 text-xs font-bold">{orders.length} hesap</span></div><div className="mt-4 space-y-2">{orders.map((order) => <button key={order.id} type="button" onClick={() => { setSelectedOrderId(order.id); setItemQuantities({}); invalidate(); }} className={`flex min-h-20 w-full items-center gap-3 rounded-2xl border p-3 text-left ${selectedOrder?.id === order.id ? "border-[color:var(--c-accent)] bg-[#fff9f6] ring-4 ring-[color:var(--c-accent-soft)]" : "border-[#e1e6e3]"}`}><span className="grid size-12 place-items-center rounded-xl bg-[color:var(--c-ink)] text-sm font-black text-white">{order.tableLabel}</span><span className="min-w-0 flex-1"><span className="block text-sm font-black">#{order.orderNumber} · {order.serverName}</span><span className="mt-1 block text-xs font-bold text-[#8a948f]">Ödenen {formatMoney(order.paidMinor)}</span></span><span className="font-black">{formatMoney(order.outstandingMinor)}</span></button>)}{orders.length === 0 && <p className="py-10 text-center text-sm font-semibold text-[#8a948f]">Tahsilat bekleyen servis edilmiş sipariş yok.</p>}</div></div>
      <div className="grid gap-5 lg:grid-cols-2"><UtilityCard title="Kasa hareketi"><div className="grid grid-cols-2 gap-2"><select value={movementType} onChange={(e) => { setMovementType(e.target.value as "income" | "expense"); invalidate(); }} className={inputClass}><option value="income">Gelir</option><option value="expense">Gider</option></select><input value={movementAmount} onChange={(e) => { setMovementAmount(e.target.value); invalidate(); }} placeholder="Tutar" className={inputClass} /></div><input value={movementReason} onChange={(e) => { setMovementReason(e.target.value); invalidate(); }} placeholder="Açıklama" className={`${inputClass} mt-2`} /><button onClick={recordMovement} disabled={!canPay || !online || isPending} className="mt-3 min-h-11 w-full rounded-xl bg-[color:var(--c-ink)] text-xs font-black text-white disabled:opacity-45">Hareketi kaydet</button></UtilityCard><UtilityCard title="Vardiyayı kapat"><p className="text-xs font-semibold text-[#7a8580]">Beklenen: {formatMoney(session.expectedMinor)} · İadeler: {formatMoney(refundTotalMinor)}</p><input value={closingAmount} onChange={(e) => { setClosingAmount(e.target.value); invalidate(); }} placeholder="Sayılan nakit" className={`${inputClass} mt-3`} /><button onClick={closeSession} disabled={!canClose || !online || isPending} className="mt-3 min-h-11 w-full rounded-xl bg-[#9e4328] text-xs font-black text-white disabled:opacity-45">Vardiyayı kapat</button></UtilityCard></div>
      <UtilityCard title="Ödeme iadesi"><div className="grid gap-2 sm:grid-cols-3"><select value={refundPaymentId} onChange={(e) => { setRefundPaymentId(e.target.value); invalidate(); }} className={inputClass}>{recentPayments.map((payment) => <option key={payment.id} value={payment.id}>#{payment.orderNumber} · {formatMoney(payment.amountMinor - payment.refundedMinor)}</option>)}</select><input value={refundAmount} onChange={(e) => { setRefundAmount(e.target.value); invalidate(); }} placeholder="İade tutarı" className={inputClass} /><input value={refundReason} onChange={(e) => { setRefundReason(e.target.value); invalidate(); }} placeholder="İade nedeni" className={inputClass} /></div><button onClick={refund} disabled={!canRefund || !online || isPending || !refundablePayment} className="mt-3 min-h-11 rounded-xl border border-[#e4b8a9] px-5 text-xs font-black text-[#9e4328] disabled:opacity-45">İadeyi kaydet</button></UtilityCard></div>

      <aside id="odeme-paneli" className="scroll-mt-4 rounded-[24px] border border-[#dfe5e1] bg-white p-5 shadow-[0_14px_36px_rgb(23_33_29/0.05)]">{selectedOrder ? <><p className="text-[10px] font-black uppercase tracking-[0.15em] text-[color:var(--c-accent)]">Ödeme al</p><h2 className="mt-2 text-3xl font-black">{selectedOrder.tableLabel} · #{selectedOrder.orderNumber}</h2><div className="my-5 border-y border-dashed border-[#dce3df] py-5"><p className="text-xs font-bold text-[#8a948f]">Kalan hesap</p><p className="mt-2 text-4xl font-black">{formatMoney(selectedOrder.outstandingMinor)}</p>{selectedOrder.discountMinor > 0 && <p className="mt-2 text-xs font-bold text-[#c2522d]">İndirim −{formatMoney(selectedOrder.discountMinor)}{selectedOrder.discountReason ? ` · ${selectedOrder.discountReason}` : ""}</p>}</div><div className="grid grid-cols-4 gap-2">{(["full", "amount", "mixed", "items"] as PaymentMode[]).filter((item) => item !== "items" || selectedOrder.discountMinor === 0).map((item) => <button key={item} onClick={() => { setMode(item); invalidate(); }} className={`min-h-14 rounded-xl border text-[10px] font-black ${mode === item ? "border-[color:var(--c-ink)] bg-[color:var(--c-ink)] text-white" : "border-[#dce3df]"}`}>{item === "full" ? "Tam" : item === "amount" ? "Kısmi" : item === "mixed" ? "Karma" : "Ürün"}</button>)}</div>{mode !== "mixed" && <div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => { setMethod("cash"); invalidate(); }} className={`min-h-12 rounded-xl border text-xs font-black ${method === "cash" ? "bg-[#e7f5ef] text-[#176e56]" : "border-[#dce3df]"}`}><Banknote className="mr-1 inline" size={16} />Nakit</button><button onClick={() => { setMethod("card"); invalidate(); }} className={`min-h-12 rounded-xl border text-xs font-black ${method === "card" ? "bg-[#eaf2fb] text-[#285e9f]" : "border-[#dce3df]"}`}><CreditCard className="mr-1 inline" size={16} />Kart</button></div>}{mode === "amount" && <input value={amount} onChange={(e) => { setAmount(e.target.value); invalidate(); }} placeholder="Tahsil edilecek tutar" className={`${inputClass} mt-3`} />}{mode === "mixed" && <div className="mt-3 grid grid-cols-2 gap-2"><input value={cashAmount} onChange={(e) => { setCashAmount(e.target.value); invalidate(); }} placeholder="Nakit" className={inputClass} /><input value={cardAmount} onChange={(e) => { setCardAmount(e.target.value); invalidate(); }} placeholder="Kart" className={inputClass} /></div>}{mode === "items" && <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">{selectedOrder.items.map((item) => { const available = item.quantity - item.allocatedQuantity; return <label key={item.id} className="flex items-center gap-3 rounded-xl bg-[#f5f7f6] p-3"><span className="min-w-0 flex-1"><span className="block truncate text-xs font-black">{item.name}</span>{item.options.length > 0 && <span className="block truncate text-[11px] font-semibold text-[#68736e]">{item.options.join(" · ")}</span>}<span className="text-[11px] font-bold text-[#8a948f]">{available} adet · {formatMoney(item.unitPriceMinor)}</span></span><input type="number" min="0" max={available} value={itemQuantities[item.id] || 0} onChange={(e) => { setItemQuantities((current) => ({ ...current, [item.id]: Number(e.target.value) })); invalidate(); }} className="h-10 w-16 rounded-lg border border-[#dce3df] text-center text-sm font-black" /></label>; })}<p className="text-right text-xs font-black">Seçilen: {formatMoney(itemSplitTotal)}</p></div>}<div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" onClick={() => print(buildBillReceipt({ orderNumber: selectedOrder.orderNumber, tableLabel: selectedOrder.tableLabel, serverName: selectedOrder.staffName, openedAt: selectedOrder.openedAt, items: selectedOrder.items.map((item) => ({ name: item.name, quantity: item.quantity, unitPriceMinor: item.unitPriceMinor, taxRate: item.taxRate, source: item.source, listUnitPriceMinor: item.listUnitPriceMinor, options: item.options })), discountMinor: selectedOrder.discountMinor, discountReason: selectedOrder.discountReason, paidMinor: selectedOrder.paidMinor, branding }))} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dce3df] px-4 text-xs font-black"><Printer size={15} />Hesap fişi</button><PaperWidthSelect /></div><button onClick={takePayment} disabled={!canPay || !online || isPending} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--c-accent)] text-sm font-black text-white disabled:opacity-45"><CheckCircle2 size={18} />{isPending ? "İşleniyor…" : "Ödemeyi kaydet"}</button>{!online && <p className="mt-3 text-center text-xs font-bold text-[#9e4328]"><CloudOff className="mr-1 inline" size={14} />Çevrimdışıyken ödeme alınamaz.</p>}</> : <div className="grid min-h-80 place-items-center text-center"><div><Scissors className="mx-auto text-[#9aa39f]" /><p className="mt-3 text-sm font-bold text-[#7a8580]">Tahsilat için bir sipariş seçin.</p></div></div>}</aside>
    </div>
  </section>;
}

function Header({ online, subtitle }: { online: boolean; subtitle: string }) { return <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[color:var(--c-accent)]">Kasa ekranı</p><h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Ödeme &amp; vardiya</h1><p className="mt-2 text-sm font-semibold text-[#7a8580]">{subtitle}</p></div><span className={`inline-flex min-h-10 w-fit items-center gap-2 rounded-xl px-3 text-xs font-black ${online ? "bg-[#e7f5ef] text-[#176e56]" : "bg-[#fff2ed] text-[#9e4328]"}`}>{online ? <CheckCircle2 size={15} /> : <CloudOff size={15} />}{online ? "Çevrimiçi" : "Çevrimdışı"}</span></div>; }
function Feedback({ type, message }: { type: "error" | "success"; message: string }) { return <p role={type === "error" ? "alert" : "status"} className={`mt-4 rounded-xl p-3 text-sm font-bold ${type === "error" ? "bg-[#fff2ed] text-[#9e4328]" : "bg-[#e7f5ef] text-[#176e56]"}`}>{message}</p>; }
function UtilityCard({ title, children }: { title: string; children: React.ReactNode }) { return <div className="rounded-[24px] border border-[#dfe5e1] bg-white p-5"><div className="mb-4 flex items-center gap-2"><PlusCircle size={18} className="text-[color:var(--c-accent)]" /><h2 className="text-base font-black">{title}</h2></div>{children}</div>; }
