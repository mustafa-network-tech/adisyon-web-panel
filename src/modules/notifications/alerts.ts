export type AlertKind = "ready" | "waiter" | "bill" | "void";

export type ServiceAlert = {
  id: string;
  kind: AlertKind;
  title: string;
  text: string;
  /** Present for customer calls, which staff acknowledge in the database. */
  callId?: string;
};

/**
 * "Order ready" alerts go to the person who took the order, for customer (QR)
 * orders to everyone, and to planners/managers who oversee the floor.
 */
export function shouldNotifyReady(input: {
  orderCreatedBy: string | null;
  userId: string;
  overseesFloor: boolean;
}) {
  return input.orderCreatedBy === null || input.orderCreatedBy === input.userId || input.overseesFloor;
}

export function readyAlert(ticketId: string, tableLabel: string, orderNumber: number, stationName?: string): ServiceAlert {
  return {
    id: `ready:${ticketId}`,
    kind: "ready",
    title: `${tableLabel} · sipariş hazır`,
    text: `#${orderNumber}${stationName ? ` · ${stationName}` : ""} servise hazır.`,
  };
}

export function callAlert(callId: string, kind: "waiter" | "bill", tableLabel: string): ServiceAlert {
  return {
    id: `call:${callId}`,
    kind,
    callId,
    title: kind === "waiter" ? `${tableLabel} · garson çağırıyor` : `${tableLabel} · hesap istiyor`,
    text: kind === "waiter" ? "Müşteri QR menüden garson çağırdı." : "Müşteri QR menüden hesap istedi.",
  };
}

/** Who hears about a cancelled or comped item: managers (not the person who did it) and, for cancellations, the kitchen. */
export function shouldNotifyVoid(input: {
  mode: "void" | "comp";
  actorUserId: string | null;
  userId: string;
  overseesFloor: boolean;
  watchesKitchen: boolean;
}) {
  if (input.actorUserId === input.userId) return false;
  return input.overseesFloor || (input.watchesKitchen && input.mode === "void");
}

export function voidAlert(input: { id: string; tableLabel: string | null; text: string; mode: "void" | "comp" }): ServiceAlert {
  return {
    id: `void:${input.id}`,
    kind: "void",
    title: `${input.tableLabel || "Masa"} · ${input.mode === "void" ? "ürün iptali" : "ikram"}`,
    text: input.text,
  };
}

/** Adds an alert unless one with the same id is already shown. */
export function addAlert(alerts: ServiceAlert[], next: ServiceAlert, limit = 6) {
  if (alerts.some((alert) => alert.id === next.id)) return alerts;
  return [next, ...alerts].slice(0, limit);
}
