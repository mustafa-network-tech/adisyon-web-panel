import type {
  ActiveKitchenTicketStatus,
  KitchenTicketStatus,
} from "./types";

const transitions: Record<
  ActiveKitchenTicketStatus,
  KitchenTicketStatus
> = {
  new: "preparing",
  preparing: "ready",
  ready: "served",
};

export function getNextKitchenStatus(
  status: ActiveKitchenTicketStatus,
): KitchenTicketStatus {
  return transitions[status];
}

export function getKitchenActionLabel(status: ActiveKitchenTicketStatus) {
  if (status === "new") return "Hazırlamaya başla";
  if (status === "preparing") return "Hazır olarak işaretle";
  return "Servise teslim et";
}
