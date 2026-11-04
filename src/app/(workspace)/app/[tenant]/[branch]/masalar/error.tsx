"use client";

import { AlertTriangle } from "lucide-react";

export default function TablesError({ reset }: { error: Error; reset: () => void }) {
  return <div className="grid min-h-[60vh] place-items-center p-6"><div className="max-w-md rounded-[22px] border border-[#f3d2c6] bg-white p-7 text-center"><AlertTriangle className="mx-auto text-[#d8542f]" /><h2 className="mt-4 text-xl font-black">Servis verileri yüklenemedi</h2><p className="mt-2 text-sm leading-6 text-[#7a8580]">Supabase bağlantısını ve şube yetkinizi kontrol edip tekrar deneyin.</p><button type="button" onClick={reset} className="mt-5 min-h-11 rounded-xl bg-[#17211d] px-5 text-sm font-black text-white">Tekrar dene</button></div></div>;
}
