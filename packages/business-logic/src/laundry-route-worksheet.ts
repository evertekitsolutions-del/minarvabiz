/** Local-only laundry pickup/drop route worksheet; no location tracking or false delivery proof. */
import type { Customer, LaundryOrder } from "@minarvabiz/types";
import { googleMapsServiceRouteLink } from "./service-visit-route-planner";

export type LaundryRouteLeg = "pickup" | "dropoff";
export interface LaundryRouteStop {
  id: string;
  customerId: string;
  customerName: string;
  address: string;
  branchId: string | null;
  orderNumbers: string[];
  orderIds: string[];
}
export interface LaundryRouteDraft {
  day: string;
  leg: LaundryRouteLeg;
  stops: LaundryRouteStop[];
  missingAddressOrders: number;
  notReadyOrders: number;
  /** Google Maps supports up to eight ordered stops per worksheet link. */
  mapLinks: Array<{ stopIds: string[]; url: string }>;
}

function assertDay(day: string) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(day)) throw new Error("Route day must be YYYY-MM-DD");
  const parsed = new Date(day + "T00:00:00.000Z");
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) throw new Error("Invalid route day");
}
function readyForHandover(order: LaundryOrder): boolean {
  if (order.mode === "outsourced" && order.status !== "received") return false;
  return !!order.items?.length && order.items.every(item =>
    (item.processingStatus === "ready" || item.processingStatus === "delivered")
    && item.qualityStatus === "passed");
}

export function buildLaundryRouteDraft(
  orders: readonly LaundryOrder[],
  customers: readonly Pick<Customer, "id" | "name" | "address" | "branchId" | "deletedAt">[],
  day: string,
  leg: LaundryRouteLeg,
): LaundryRouteDraft {
  assertDay(day);
  if (!["pickup", "dropoff"].includes(leg) || !Array.isArray(orders) || !Array.isArray(customers)
    || orders.length > 100000 || customers.length > 100000) throw new Error("Invalid laundry route input");
  const byCustomer = new Map(customers.filter(c => c?.id && !c.deletedAt).map(c => [c.id, c]));
  const seen = new Set<string>(), stops = new Map<string, LaundryRouteStop>();
  let missingAddressOrders = 0, notReadyOrders = 0;
  for (const order of orders) {
    if (!order?.id || seen.has(order.id) || order.deletedAt || ["cancelled", "delivered"].includes(order.status)) continue;
    seen.add(order.id);
    const scheduled = (leg === "pickup" ? order.pickupAt : order.dueAt)?.slice(0, 10);
    if (scheduled !== day) continue;
    if (leg === "pickup" && order.status !== "pending") continue;
    if (leg === "dropoff" && !readyForHandover(order)) { notReadyOrders++; continue; }
    const customer = byCustomer.get(order.customerId);
    if (!customer || (customer.branchId && order.branchId && customer.branchId !== order.branchId)) {
      missingAddressOrders++; continue;
    }
    const address = customer.address?.trim();
    if (!address || address.length > 500 || /[\u0000-\u001f]/.test(address)) {
      missingAddressOrders++; continue;
    }
    const key = JSON.stringify([order.branchId || "", customer.id, address]);
    let stop = stops.get(key);
    if (!stop) {
      stop = {
        id: key, customerId: customer.id, customerName: customer.name,
        address, branchId: order.branchId || null, orderNumbers: [], orderIds: [],
      };
      stops.set(key, stop);
    }
    stop.orderNumbers.push(order.orderNumber);
    stop.orderIds.push(order.id);
  }
  const sorted = [...stops.values()].sort((a, b) => a.customerName.localeCompare(b.customerName)
    || a.address.localeCompare(b.address) || a.id.localeCompare(b.id));
  const mapLinks: LaundryRouteDraft["mapLinks"] = [];
  for (let index = 0; index < sorted.length; index += 8) {
    const chunk = sorted.slice(index, index + 8);
    mapLinks.push({ stopIds: chunk.map(x => x.id),
      url: googleMapsServiceRouteLink(chunk.map(x => ({ siteAddress: x.address }))) });
  }
  return { day, leg, stops: sorted, missingAddressOrders, notReadyOrders, mapLinks };
}
