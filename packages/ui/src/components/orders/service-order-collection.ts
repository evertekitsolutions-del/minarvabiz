import type { ServiceOrder } from "@minarvabiz/types";

type CollectibleServiceOrder = Pick<ServiceOrder, "customerId" | "balance" | "status">;

/** Allow collection links only for valid, unpaid, noncancelled service orders. */
export function canCollectServiceOrderBalance(order: CollectibleServiceOrder): boolean {
  return Boolean(order.customerId) &&
    order.status !== "cancelled" &&
    Number.isFinite(order.balance) &&
    order.balance > 0 &&
    Number.isSafeInteger(Math.round(order.balance * 100));
}
