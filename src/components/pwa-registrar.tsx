"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, RefreshCw, WifiOff, X } from "lucide-react";

type ConnectionNotice = "offline" | "restored" | null;

export function PwaRegistrar() {
  const [connectionNotice, setConnectionNotice] = useState<ConnectionNotice>(null);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const refreshRequested = useRef(false);
  const restoredTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const setOffline = () => {
      if (restoredTimer.current) clearTimeout(restoredTimer.current);
      setConnectionNotice("offline");
    };
    const setOnline = () => {
      setConnectionNotice((current) => (current === "offline" ? "restored" : null));
      if (restoredTimer.current) clearTimeout(restoredTimer.current);
      restoredTimer.current = setTimeout(() => setConnectionNotice(null), 4000);
    };

    if (!navigator.onLine) setOffline();
    window.addEventListener("offline", setOffline);
    window.addEventListener("online", setOnline);

    let removeRegistrationListeners = () => {};
    let cancelled = false;

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      const register = async () => {
        try {
          const registration = await navigator.serviceWorker.register("/sw.js", {
            scope: "/",
            updateViaCache: "none",
          });
          if (cancelled) return;

          const exposeWaitingWorker = () => {
            if (registration.waiting && navigator.serviceWorker.controller) {
              setWaitingWorker(registration.waiting);
            }
          };
          const handleUpdateFound = () => {
            const installing = registration.installing;
            if (!installing) return;
            const handleStateChange = () => {
              if (installing.state === "installed") exposeWaitingWorker();
            };
            installing.addEventListener("statechange", handleStateChange);
          };
          const checkForUpdate = () => {
            if (document.visibilityState === "visible") void registration.update();
          };

          exposeWaitingWorker();
          registration.addEventListener("updatefound", handleUpdateFound);
          document.addEventListener("visibilitychange", checkForUpdate);
          removeRegistrationListeners = () => {
            registration.removeEventListener("updatefound", handleUpdateFound);
            document.removeEventListener("visibilitychange", checkForUpdate);
          };
        } catch {
          // PWA support is progressive; the web application remains usable.
        }
      };

      if (document.readyState === "complete") void register();
      else window.addEventListener("load", register, { once: true });
    }

    const handleControllerChange = () => {
      if (refreshRequested.current) window.location.reload();
    };
    navigator.serviceWorker?.addEventListener("controllerchange", handleControllerChange);

    return () => {
      cancelled = true;
      if (restoredTimer.current) clearTimeout(restoredTimer.current);
      window.removeEventListener("offline", setOffline);
      window.removeEventListener("online", setOnline);
      navigator.serviceWorker?.removeEventListener("controllerchange", handleControllerChange);
      removeRegistrationListeners();
    };
  }, []);

  const applyUpdate = () => {
    if (!waitingWorker) return;
    refreshRequested.current = true;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  };

  if (!connectionNotice && !waitingWorker) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-3 px-4" aria-live="polite">
      {connectionNotice === "offline" && (
        <div role="status" className="pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-2xl border border-[#efc2b5] bg-[#fff7f3] p-4 text-[#8f3d27] shadow-[0_18px_50px_rgb(23_33_29/0.16)]">
          <WifiOff className="shrink-0" size={20} aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm font-bold">Bağlantı kesildi. Güvenli işlemler için bağlantının geri gelmesini bekleyin.</p>
        </div>
      )}
      {connectionNotice === "restored" && (
        <div role="status" className="pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-2xl border border-[#bddfcf] bg-[#edf8f3] p-4 text-[#176e56] shadow-[0_18px_50px_rgb(23_33_29/0.14)]">
          <CheckCircle2 className="shrink-0" size={20} aria-hidden="true" />
          <p className="text-sm font-bold">Bağlantı yeniden kuruldu.</p>
        </div>
      )}
      {waitingWorker && (
        <div role="status" className="pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-2xl border border-[#e7d49e] bg-[#fff9e8] p-4 text-[#725313] shadow-[0_18px_50px_rgb(23_33_29/0.16)]">
          <RefreshCw className="shrink-0" size={20} aria-hidden="true" />
          <div className="min-w-0 flex-1"><p className="text-sm font-black">Yeni sürüm hazır</p><p className="mt-0.5 text-xs font-semibold">Güncelleme sayfayı bir kez yeniler.</p></div>
          <button type="button" onClick={applyUpdate} className="min-h-10 rounded-xl bg-[#17211d] px-4 text-xs font-black text-white">Şimdi güncelle</button>
          <button type="button" onClick={() => setWaitingWorker(null)} aria-label="Güncellemeyi sonra yap" className="grid size-10 shrink-0 place-items-center rounded-xl hover:bg-black/5"><X size={18} /></button>
        </div>
      )}
    </div>
  );
}
