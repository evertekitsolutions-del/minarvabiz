/** Read-only B6/C3 laundry throughput reporting from ticket snapshots. */
import type { LaundryOrder, LaundryItem, LaundryItemProcessingStatus } from "@minarvabiz/types";
import { addMinorUnits, fromMinorUnits, toMinorUnits } from "@minarvabiz/utils";

export interface LaundryServiceVolume { service: string; garmentCount: number; tickets: number }
export interface LaundryOperationsReport {
  from: string; through: string; asOfDay: string;
  bookedTickets: number; activeTickets: number; deliveredTickets: number; overdueOpenTickets: number;
  outsourcedTickets: number; inHouseTickets: number;
  garmentPieces: number; deliveredGarmentPieces: number; failedQcGarmentPieces: number;
  bookedCustomerCharge: number; supplierCommitment: number; contributionBeforeOverhead: number;
  serviceVolumes: LaundryServiceVolume[];
  stages: Record<LaundryItemProcessingStatus | "untracked", number>;
}

function assertDay(day: string): void {
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)
    || Number.isNaN(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day) {
    throw new Error("Laundry reporting date must be a valid YYYY-MM-DD");
  }
}

export function buildLaundryOperationsReport(
  orders: readonly LaundryOrder[],
  from: string,
  through: string,
  asOfDay: string,
): LaundryOperationsReport {
  assertDay(from); assertDay(through); assertDay(asOfDay);
  if (through < from) throw new Error("Laundry reporting start date must not exceed end date");
  const stages: LaundryOperationsReport["stages"] = {
    received: 0, washing: 0, ironing: 0, quality_check: 0, ready: 0, delivered: 0, untracked: 0,
  };
  const serviceVolume = new Map<string, { service: string; garmentCount: number; ticketIds: Set<string> }>();
  const seen = new Set<string>();
  let bookedTickets = 0, activeTickets = 0, deliveredTickets = 0, overdueOpenTickets = 0;
  let outsourcedTickets = 0, inHouseTickets = 0, garmentPieces = 0, deliveredGarmentPieces = 0, failedQcGarmentPieces = 0;
  let customerMinor = 0, supplierMinor = 0;
  for (const order of orders) {
    if (!order || seen.has(order.id) || order.deletedAt || order.status === "cancelled") continue;
    seen.add(order.id);
    const day = order.createdAt.slice(0, 10);
    if (day < from || day > through) continue;
    if (!Number.isFinite(order.quantity) || order.quantity <= 0) throw new Error("Invalid laundry ticket garment quantity");
    bookedTickets++;
    if (order.mode === "outsourced") outsourcedTickets++;
    else if (order.mode === "in_house_ironing") inHouseTickets++;
    if (order.status === "delivered") deliveredTickets++;
    else activeTickets++;
    if (order.status !== "delivered" && order.dueAt && order.dueAt.slice(0, 10) < asOfDay) overdueOpenTickets++;
    customerMinor = addMinorUnits(customerMinor, toMinorUnits(order.totalCustomerCharge));
    supplierMinor = addMinorUnits(supplierMinor, toMinorUnits(order.totalSupplierCost));
    garmentPieces += order.quantity;

    const items = order.items?.length ? order.items : null;
    if (!items) stages.untracked += order.quantity;
    const itemRows: Array<Pick<LaundryItem, "quantity" | "serviceCode" | "processingStatus" | "qualityStatus">> = items || [
      { quantity: order.quantity, serviceCode: "unspecified", processingStatus: "received", qualityStatus: "pending" },
    ];
    for (const item of itemRows) {
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error("Invalid laundry garment quantity");
      if (items) {
        if (!Object.hasOwn(stages, item.processingStatus)) throw new Error("Invalid laundry garment stage");
        stages[item.processingStatus] += item.quantity;
        if (item.processingStatus === "delivered") deliveredGarmentPieces += item.quantity;
        if (item.qualityStatus === "failed") failedQcGarmentPieces += item.quantity;
      }
      const code = item.serviceCode || "unspecified";
      const row = serviceVolume.get(code) || { service: code, garmentCount: 0, ticketIds: new Set<string>() };
      row.garmentCount += item.quantity;
      row.ticketIds.add(order.id);
      serviceVolume.set(code, row);
    }
  }
  const customerCharge = fromMinorUnits(customerMinor);
  const supplierCost = fromMinorUnits(supplierMinor);
  return {
    from, through, asOfDay, bookedTickets, activeTickets, deliveredTickets, overdueOpenTickets,
    outsourcedTickets, inHouseTickets, garmentPieces, deliveredGarmentPieces, failedQcGarmentPieces,
    bookedCustomerCharge: customerCharge, supplierCommitment: supplierCost,
    contributionBeforeOverhead: fromMinorUnits(customerMinor - supplierMinor),
    stages,
    serviceVolumes: [...serviceVolume.values()].map(row => ({
      service: row.service, garmentCount: row.garmentCount, tickets: row.ticketIds.size,
    })).sort((a,b) => b.garmentCount - a.garmentCount || a.service.localeCompare(b.service)),
  };
}
