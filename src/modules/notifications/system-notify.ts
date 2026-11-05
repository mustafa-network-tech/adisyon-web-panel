"use client";

/** System (phone / desktop) notifications through the browser. They need the user's permission. */
export type SystemPermission = "granted" | "denied" | "default" | "unsupported";

export function systemPermission(): SystemPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function requestSystemPermission(): Promise<SystemPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * Shows a system notification. The service worker shows it when available
 * (works on phones and when the tab is in the background); otherwise the page does.
 */
export async function showSystemNotification(input: { title: string; text: string; tag: string; url?: string }) {
  if (systemPermission() !== "granted") return false;
  const options: NotificationOptions = {
    body: input.text,
    icon: "/icons/app-icon-192.png",
    badge: "/icons/app-icon-192.png",
    tag: input.tag,
    data: { url: input.url || window.location.href },
  };
  try {
    const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (registration) {
      await registration.showNotification(input.title, options);
      return true;
    }
    new Notification(input.title, options);
    return true;
  } catch {
    return false;
  }
}
