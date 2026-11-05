"use client";

import { useState, useSyncExternalStore } from "react";
import { BellRing, Smartphone, Volume2 } from "lucide-react";
import { groupLabels, type NotificationGroup } from "../prefs";
import { requestSystemPermission, showSystemNotification, systemPermission, type SystemPermission } from "../system-notify";
import { useNotificationPrefs } from "../use-prefs";

type Props = {
  /** Groups this person can actually receive, based on their permissions. */
  availableGroups: NotificationGroup[];
};

const permissionText: Record<SystemPermission, string> = {
  granted: "İzin verildi.",
  denied: "İzin reddedildi. Tarayıcı veya telefon ayarlarından bu site için bildirimlere izin verin.",
  default: "Henüz izin istenmedi.",
  unsupported: "Bu tarayıcı sistem bildirimlerini desteklemiyor. iPhone'da önce uygulamayı ana ekrana ekleyin.",
};

const subscribeNever = () => () => {};
const serverPermission = (): SystemPermission => "default";

export function NotificationSettings({ availableGroups }: Props) {
  const { prefs, update } = useNotificationPrefs();
  // Re-read on every render; the counter below forces one after the permission prompt.
  const permission = useSyncExternalStore(subscribeNever, systemPermission, serverPermission);
  const [, refresh] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  async function toggleSystem(enabled: boolean) {
    setMessage(null);
    if (!enabled) {
      update((current) => ({ ...current, system: false }));
      return;
    }
    const result = permission === "granted" ? "granted" : await requestSystemPermission();
    refresh((count) => count + 1);
    if (result === "granted") update((current) => ({ ...current, system: true }));
    else setMessage(permissionText[result]);
  }

  async function sendTest() {
    setMessage(null);
    window.dispatchEvent(new Event("mk-test-alert"));
    if (prefs.system && systemPermission() === "granted") {
      const shown = await showSystemNotification({ title: "Test bildirimi", text: "Sistem bildirimleri bu cihazda çalışıyor.", tag: "mk-test" });
      if (!shown) setMessage("Sistem bildirimi gösterilemedi. Tarayıcı izinlerini kontrol edin.");
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[22px] border border-[#dfe5e1] bg-white p-5 sm:p-6">
        <h2 className="text-lg font-black">Bu cihazda</h2>
        <p className="mt-1 text-xs font-semibold text-[#8a948f]">Tercihler yalnızca bu cihaz (telefon, tablet, mutfak ekranı) için geçerlidir.</p>
        <ul className="mt-4 space-y-3">
          <li className="flex items-start gap-3 rounded-xl bg-[#f6f8f7] p-4">
            <Volume2 size={19} className="mt-0.5 shrink-0 text-[#68736e]" aria-hidden="true" />
            <label className="flex-1 cursor-pointer">
              <span className="block text-sm font-black">Sesli uyarı</span>
              <span className="block text-xs font-semibold leading-5 text-[#68736e]">Yeni bildirimde ses çalar, destekleyen cihazlarda titreşir. Tarayıcılar, sayfaya ilk dokunuştan sonra ses çalmaya izin verir.</span>
            </label>
            <input type="checkbox" checked={prefs.sound} onChange={(event) => update((current) => ({ ...current, sound: event.target.checked }))} className="size-6 shrink-0 accent-[#e8623a]" aria-label="Sesli uyarı" />
          </li>
          <li className="flex items-start gap-3 rounded-xl bg-[#f6f8f7] p-4">
            <Smartphone size={19} className="mt-0.5 shrink-0 text-[#68736e]" aria-hidden="true" />
            <label className="flex-1 cursor-pointer">
              <span className="block text-sm font-black">Sistem bildirimi</span>
              <span className="block text-xs font-semibold leading-5 text-[#68736e]">Uygulama arka plandayken telefonun/bilgisayarın bildirim alanında gösterir. {permissionText[permission]}</span>
            </label>
            <input type="checkbox" checked={prefs.system && permission === "granted"} onChange={(event) => void toggleSystem(event.target.checked)} disabled={permission === "unsupported"} className="size-6 shrink-0 accent-[#e8623a]" aria-label="Sistem bildirimi" />
          </li>
        </ul>
        <p className="mt-3 text-[11px] font-semibold leading-5 text-[#8a948f]">Not: Bildirimler uygulama açıkken veya arka planda çalışırken gelir. Uygulama tamamen kapalıyken bildirim gönderilmez.</p>
      </section>

      <section className="rounded-[22px] border border-[#dfe5e1] bg-white p-5 sm:p-6">
        <h2 className="text-lg font-black">Hangi bildirimleri alayım?</h2>
        <ul className="mt-4 space-y-3">
          {availableGroups.map((group) => (
            <li key={group} className="flex items-start gap-3 rounded-xl bg-[#f6f8f7] p-4">
              <label className="flex-1 cursor-pointer">
                <span className="block text-sm font-black">{groupLabels[group].title}</span>
                <span className="block text-xs font-semibold leading-5 text-[#68736e]">{groupLabels[group].text}</span>
              </label>
              <input type="checkbox" checked={prefs.groups[group]} onChange={(event) => update((current) => ({ ...current, groups: { ...current.groups, [group]: event.target.checked } }))} className="size-6 shrink-0 accent-[#e8623a]" aria-label={groupLabels[group].title} />
            </li>
          ))}
          {availableGroups.length === 0 && <li className="text-sm font-semibold text-[#8a948f]">Rolünüz için bildirim türü bulunmuyor.</li>}
        </ul>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void sendTest()} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#17211d] px-6 text-sm font-black text-white"><BellRing size={17} />Test bildirimi gönder</button>
        {message && <p role="status" className="rounded-xl bg-[#fff8e7] px-3 py-2 text-xs font-semibold text-[#8a6415]">{message}</p>}
      </div>
    </div>
  );
}
