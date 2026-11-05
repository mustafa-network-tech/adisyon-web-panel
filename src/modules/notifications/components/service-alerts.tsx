"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Ban, Bell, BellOff, BellRing, ChefHat, Receipt, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { acknowledgeWaiterCallAction } from "../actions";
import { describeVoid } from "@/modules/orders/void";
import { addAlert, callAlert, readyAlert, shouldNotifyReady, shouldNotifyVoid, voidAlert, type ServiceAlert } from "../alerts";

type Props = {
  tenant: string;
  branch: string;
  branchId: string;
  userId: string;
  /** Managers and floor planners also hear about orders they did not take. */
  overseesFloor: boolean;
  /** Has tables.read: hears ready orders and customer calls. */
  receivesCalls: boolean;
  /** Has kitchen.read: hears about cancelled items so nothing is cooked for nothing. */
  watchesKitchen: boolean;
};

const soundKey = "mk-alert-sound";
const soundListeners = new Set<() => void>();

function readSound() {
  try {
    return window.localStorage.getItem(soundKey) !== "off";
  } catch {
    return true;
  }
}

function subscribeSound(listener: () => void) {
  soundListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    soundListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function useSoundPreference() {
  const enabled = useSyncExternalStore(subscribeSound, readSound, () => true);
  const toggle = useCallback(() => {
    try {
      window.localStorage.setItem(soundKey, enabled ? "off" : "on");
    } catch {
      // Without storage the preference simply is not remembered.
    }
    soundListeners.forEach((listener) => listener());
  }, [enabled]);
  return { enabled, toggle };
}

let audioContext: AudioContext | null = null;

function beep() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    audioContext ||= new AudioContextClass();
    const context = audioContext;
    [0, 0.22].forEach((offset) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, context.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + offset + 0.16);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + offset);
      oscillator.stop(context.currentTime + offset + 0.18);
    });
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    // Browsers block sound until the page has been touched once; the toast still shows.
  }
}

const styles = {
  ready: { box: "border-[#bddfcf] bg-[#edf8f3]", icon: "bg-[#23866b]", Icon: ChefHat },
  waiter: { box: "border-[#f2cdbd] bg-[#fff4ee]", icon: "bg-[#e8623a]", Icon: BellRing },
  bill: { box: "border-[#c5d9ef] bg-[#eef5fc]", icon: "bg-[#285e9f]", Icon: Receipt },
  void: { box: "border-[#f0c6bb] bg-[#fff1ee]", icon: "bg-[#b63b32]", Icon: Ban },
} as const;

export function ServiceAlerts({ tenant, branch, branchId, userId, overseesFloor, receivesCalls, watchesKitchen }: Props) {
  const [alerts, setAlerts] = useState<ServiceAlert[]>([]);
  const { enabled: soundOn, toggle: toggleSound } = useSoundPreference();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const tableLabels = new Map<string, string>();
    let closed = false;

    const push = (alert: ServiceAlert, announce: boolean) => {
      if (closed) return;
      setAlerts((current) => {
        const next = addAlert(current, alert);
        if (announce && next !== current && readSound()) beep();
        return next;
      });
    };

    async function tableLabel(tableId: string | null) {
      if (!tableId) return "Paket";
      const cached = tableLabels.get(tableId);
      if (cached) return cached;
      const { data } = await supabase.from("restaurant_tables").select("label").eq("id", tableId).maybeSingle();
      const label = data?.label || "Masa";
      tableLabels.set(tableId, label);
      return label;
    }

    async function announceCall(call: { id: string; table_id: string; kind: "waiter" | "bill" }, announce: boolean) {
      push(callAlert(call.id, call.kind, await tableLabel(call.table_id)), announce);
    }

    async function announceReady(ticket: { id: string; order_id: string }) {
      const { data: order } = await supabase.from("orders").select("created_by, table_id, order_number").eq("id", ticket.order_id).maybeSingle();
      if (!order || !shouldNotifyReady({ orderCreatedBy: order.created_by, userId, overseesFloor })) return;
      push(readyAlert(ticket.id, await tableLabel(order.table_id), Number(order.order_number)), true);
    }

    if (receivesCalls) {
      // Calls that arrived while this device was closed or offline.
      void supabase
        .from("waiter_calls")
        .select("id, table_id, kind")
        .eq("branch_id", branchId)
        .is("acknowledged_at", null)
        .order("created_at")
        .limit(10)
        .then(({ data }) => {
          for (const call of data || []) void announceCall(call as { id: string; table_id: string; kind: "waiter" | "bill" }, false);
        });
    }

    let channel = supabase.channel(`alerts:${branchId}:${userId}`);
    if (receivesCalls) {
      channel = channel
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "waiter_calls", filter: `branch_id=eq.${branchId}` }, (payload) => {
          void announceCall(payload.new as { id: string; table_id: string; kind: "waiter" | "bill" }, true);
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "waiter_calls", filter: `branch_id=eq.${branchId}` }, (payload) => {
          const call = payload.new as { id: string; acknowledged_at: string | null };
          if (call.acknowledged_at) setAlerts((current) => current.filter((alert) => alert.callId !== call.id));
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "kitchen_tickets", filter: `branch_id=eq.${branchId}` }, (payload) => {
          const ticket = payload.new as { id: string; order_id: string; status: string };
          if (ticket.status === "ready") void announceReady(ticket);
        });
    }
    if (overseesFloor || watchesKitchen) {
      channel = channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "order_item_voids", filter: `branch_id=eq.${branchId}` }, (payload) => {
        const row = payload.new as { id: string; mode: "void" | "comp"; quantity: number; product_name: string; reason: string; actor_user_id: string | null; actor_name: string | null; table_label: string | null };
        if (!shouldNotifyVoid({ mode: row.mode, actorUserId: row.actor_user_id, userId, overseesFloor, watchesKitchen })) return;
        push(voidAlert({ id: row.id, tableLabel: row.table_label, mode: row.mode, text: describeVoid({ mode: row.mode, quantity: row.quantity, productName: row.product_name, reason: row.reason, actorName: row.actor_name }) }), true);
      });
    }
    channel.subscribe();

    return () => {
      closed = true;
      void supabase.removeChannel(channel);
    };
  }, [branchId, userId, overseesFloor, receivesCalls, watchesKitchen]);

  function dismiss(alert: ServiceAlert) {
    setAlerts((current) => current.filter((item) => item.id !== alert.id));
    if (alert.callId) void acknowledgeWaiterCallAction({ tenant, branch, callId: alert.callId });
  }

  return (
    <>
      <div aria-live="polite" className="pointer-events-none fixed right-3 top-20 z-50 flex w-[min(380px,calc(100vw-1.5rem))] flex-col gap-2">
        {alerts.map((alert) => {
          const style = styles[alert.kind];
          return (
            <div key={alert.id} role="status" className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-3 shadow-[0_12px_30px_rgb(23_33_29/0.16)] ${style.box}`}>
              <span className={`grid size-10 shrink-0 place-items-center rounded-xl text-white ${style.icon}`}><style.Icon size={19} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black">{alert.title}</span>
                <span className="block text-xs font-semibold text-[#4b5753]">{alert.text}</span>
              </span>
              <button type="button" onClick={() => dismiss(alert)} className="grid min-h-9 min-w-9 shrink-0 place-items-center rounded-lg bg-white/80 text-xs font-black" aria-label={alert.callId ? "Çağrıyı karşıla" : "Bildirimi kapat"}>
                {alert.callId ? "Tamam" : <X size={15} />}
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={toggleSound}
        aria-pressed={soundOn}
        aria-label={soundOn ? "Bildirim sesini kapat" : "Bildirim sesini aç"}
        className="fixed bottom-24 right-3 z-40 grid size-11 place-items-center rounded-full border border-[#dce3df] bg-white text-[#68736e] shadow-sm lg:bottom-5 lg:right-5"
      >
        {soundOn ? <Bell size={18} /> : <BellOff size={18} />}
      </button>
    </>
  );
}
