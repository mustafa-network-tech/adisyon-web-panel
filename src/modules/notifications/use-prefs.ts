"use client";

import { useCallback, useSyncExternalStore } from "react";
import { defaultPrefs, LEGACY_SOUND_KEY, loadPrefs, PREFS_KEY, savePrefs, type NotificationPrefs } from "./prefs";

const listeners = new Set<() => void>();
let lastRaw = "";
let lastPrefs: NotificationPrefs = defaultPrefs;

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Referentially stable between changes, as useSyncExternalStore requires. */
function snapshot(): NotificationPrefs {
  const storage = browserStorage();
  let raw = "";
  try {
    raw = `${storage?.getItem(PREFS_KEY) ?? ""}|${storage?.getItem(LEGACY_SOUND_KEY) ?? ""}`;
  } catch {
    raw = "";
  }
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastPrefs = loadPrefs(storage);
  }
  return lastPrefs;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Current prefs outside React (event handlers that must not use stale values). */
export function currentPrefs() {
  return snapshot();
}

export function useNotificationPrefs() {
  const prefs = useSyncExternalStore(subscribe, snapshot, () => defaultPrefs);
  const update = useCallback((patch: (current: NotificationPrefs) => NotificationPrefs) => {
    savePrefs(browserStorage(), patch(snapshot()));
    listeners.forEach((listener) => listener());
  }, []);
  return { prefs, update };
}
