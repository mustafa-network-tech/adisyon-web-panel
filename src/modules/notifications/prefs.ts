import type { AlertKind } from "./alerts";

/**
 * Notification preferences of one device (phone, tablet, kitchen screen).
 * They live in the browser, not in the database, because every device has
 * its own speaker, screen and permission.
 */
export type NotificationGroup = "ready" | "calls" | "voids";

export type NotificationPrefs = {
  /** Beep and vibrate when an alert arrives. */
  sound: boolean;
  /** Also show a system notification (phone / desktop) when the app is in the background. */
  system: boolean;
  groups: Record<NotificationGroup, boolean>;
};

export const PREFS_KEY = "mk-notification-prefs";
/** Older versions stored only the sound switch under this key. */
export const LEGACY_SOUND_KEY = "mk-alert-sound";

export const defaultPrefs: NotificationPrefs = {
  sound: true,
  system: false,
  groups: { ready: true, calls: true, voids: true },
};

export const groupLabels: Record<NotificationGroup, { title: string; text: string }> = {
  ready: { title: "Sipariş hazır", text: "Mutfakta hazırlanan sipariş servise hazır olduğunda." },
  calls: { title: "Müşteri çağrıları", text: "Müşteri QR menüden garson çağırdığında veya hesap istediğinde." },
  voids: { title: "İptal ve ikramlar", text: "Gönderilmiş bir ürün iptal veya ikram edildiğinde." },
};

export function groupOf(kind: AlertKind): NotificationGroup {
  if (kind === "ready") return "ready";
  if (kind === "void") return "voids";
  return "calls";
}

/** Whether an alert of this kind should be shown on this device. */
export function allows(prefs: NotificationPrefs, kind: AlertKind) {
  return prefs.groups[groupOf(kind)];
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function parsePrefs(raw: string | null, legacySound: string | null = null): NotificationPrefs {
  const base: NotificationPrefs = {
    sound: legacySound !== "off",
    system: defaultPrefs.system,
    groups: { ...defaultPrefs.groups },
  };
  if (!raw) return base;
  try {
    const value = JSON.parse(raw) as Partial<NotificationPrefs> & { groups?: Partial<Record<NotificationGroup, unknown>> };
    return {
      sound: typeof value.sound === "boolean" ? value.sound : base.sound,
      system: typeof value.system === "boolean" ? value.system : base.system,
      groups: {
        ready: typeof value.groups?.ready === "boolean" ? value.groups.ready : base.groups.ready,
        calls: typeof value.groups?.calls === "boolean" ? value.groups.calls : base.groups.calls,
        voids: typeof value.groups?.voids === "boolean" ? value.groups.voids : base.groups.voids,
      },
    };
  } catch {
    return base;
  }
}

export function loadPrefs(storage: StorageLike | null): NotificationPrefs {
  if (!storage) return { ...defaultPrefs, groups: { ...defaultPrefs.groups } };
  try {
    return parsePrefs(storage.getItem(PREFS_KEY), storage.getItem(LEGACY_SOUND_KEY));
  } catch {
    return { ...defaultPrefs, groups: { ...defaultPrefs.groups } };
  }
}

export function savePrefs(storage: StorageLike | null, prefs: NotificationPrefs) {
  try {
    storage?.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Without storage the choice only lasts until the page is closed.
  }
}
