const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" });

/** Calendar day (YYYY-MM-DD) in Europe/Istanbul. */
export function istanbulDay(value: Date | string) {
  return dayFormatter.format(typeof value === "string" ? new Date(value) : value);
}

/**
 * A subscription or trial works until 23:59:59 (Istanbul) of its last day; the database applies the same rule
 * (private.tenant_is_writable, migration 0042). No end date = open ended.
 */
export function subscriptionEnded(endsAt: string | null | undefined, now: Date = new Date()) {
  if (!endsAt) return false;
  return istanbulDay(endsAt) < istanbulDay(now);
}
