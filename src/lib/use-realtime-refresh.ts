"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type RealtimeListener = {
  table: string;
  /** postgres_changes filter, e.g. `branch_id=eq.<id>` */
  filter: string;
  event?: "*" | "INSERT" | "UPDATE" | "DELETE";
};

type Options = {
  /** Unique channel name per screen. */
  channel: string;
  listeners: RealtimeListener[];
  /** Called with false when the connection drops and true when it is (back) up. */
  onConnection?: (connected: boolean) => void;
};

const BURST_MS = 350;

/**
 * Keeps a server rendered screen in step with the database through Supabase Realtime.
 *
 *  - a burst of events costs ONE page refresh (events inside a short window are coalesced);
 *  - when the connection drops and comes back, nothing is assumed: the screen is refreshed from the
 *    database, so whatever happened meanwhile (a new kitchen ticket, a payment) is not lost;
 *  - the same catch-up runs when the tab becomes visible again and when the browser goes back online.
 */
export function useRealtimeRefresh({ channel, listeners, onConnection }: Options) {
  const router = useRouter();
  const connectionCallback = useRef(onConnection);
  useEffect(() => {
    connectionCallback.current = onConnection;
  });
  const listenersKey = JSON.stringify(listeners);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let timer: number | null = null;
    let lostConnection = false;
    const refresh = () => {
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        router.refresh();
      }, BURST_MS);
    };

    let realtime = supabase.channel(channel);
    for (const listener of JSON.parse(listenersKey) as RealtimeListener[]) {
      realtime = realtime.on(
        "postgres_changes",
        { event: listener.event ?? "*", schema: "public", table: listener.table, filter: listener.filter },
        refresh,
      );
    }
    realtime.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        connectionCallback.current?.(true);
        if (lostConnection) {
          lostConnection = false;
          refresh(); // catch up after a reconnect
        }
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        connectionCallback.current?.(false);
        lostConnection = true;
      }
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refresh);

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refresh);
      void supabase.removeChannel(realtime);
    };
  }, [channel, listenersKey, router]);
}
