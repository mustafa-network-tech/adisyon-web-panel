"use client";

import { useState, useTransition } from "react";
import { BellRing, Receipt } from "lucide-react";
import { callWaiterAction } from "../actions";

type Kind = "waiter" | "bill";

const labels: Record<Kind, { idle: string; sent: string }> = {
  waiter: { idle: "Garson çağır", sent: "Garson çağrıldı" },
  bill: { idle: "Hesap iste", sent: "Hesap istendi" },
};

/** Lets a guest call the waiter or ask for the bill without placing an order. */
export function ServiceButtons({ token }: { token: string }) {
  const [sent, setSent] = useState<Record<Kind, boolean>>({ waiter: false, bill: false });
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function call(kind: Kind) {
    setMessage(null);
    startTransition(async () => {
      const result = await callWaiterAction({ token, kind });
      if (!result.ok) {
        setMessage({ type: "error", text: result.message });
        return;
      }
      setSent((current) => ({ ...current, [kind]: true }));
      setMessage({ type: "success", text: "Çalışanlarımıza haber verdik, birazdan yanınızda olacağız." });
    });
  }

  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-2">
        {(["waiter", "bill"] as Kind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => call(kind)}
            disabled={pending || sent[kind]}
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#dfe5e1] bg-white px-3 text-sm font-black disabled:opacity-60"
          >
            {kind === "waiter" ? <BellRing size={17} /> : <Receipt size={17} />}
            {sent[kind] ? labels[kind].sent : labels[kind].idle}
          </button>
        ))}
      </div>
      {message && (
        <p role={message.type === "error" ? "alert" : "status"} className={`mt-2 rounded-xl p-3 text-xs font-bold ${message.type === "error" ? "bg-[#fff7f3] text-[#9e4328]" : "bg-[#edf8f3] text-[#176e56]"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
