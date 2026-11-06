"use client";

import { useCallback } from "react";

/**
 * Idempotency key that survives a page reload.
 *
 * A financial request (payment, cash movement, opening or closing a shift) is sent with a key. If the answer is
 * lost (network cut, page refreshed) and the cashier presses the button again, the SAME key must be used or the
 * server cannot recognise the repeat. The key is therefore kept in sessionStorage next to a fingerprint of the
 * request: the same request (same fingerprint) reuses the key, a changed request gets a fresh key, and a request
 * that succeeded forgets its key.
 */
type Stored = { fingerprint: string; key: string };

function read(storageKey: string): Stored | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    return typeof parsed.fingerprint === "string" && typeof parsed.key === "string" ? { fingerprint: parsed.fingerprint, key: parsed.key } : null;
  } catch {
    return null;
  }
}

export function useIdempotencyKey(scope: string) {
  const storageKey = `mk-idem:${scope}`;

  const keyFor = useCallback((request: unknown) => {
    const fingerprint = JSON.stringify(request);
    const stored = read(storageKey);
    if (stored && stored.fingerprint === fingerprint) return stored.key;
    const key = crypto.randomUUID();
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify({ fingerprint, key } satisfies Stored));
    } catch {
      /* storage unavailable: the key then lives only for this call, as before */
    }
    return key;
  }, [storageKey]);

  const clear = useCallback(() => {
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      /* nothing to forget */
    }
  }, [storageKey]);

  return { keyFor, clear };
}
