/** Structural business records shared with the core store consumers. */
import type { UUID, CartLine } from "@minarvabiz/types";

export interface StockTransferRecord {
  id: UUID;
  referenceNumber: string;
  sourceProductId: UUID;
  destinationProductId: UUID;
  sourceBranchId?: UUID | null;
  destinationBranchId?: UUID | null;
  quantity: number;
  notes?: string | null;
  createdAt: string;
}

export interface HeldSale {
  id: UUID;
  holdNumber: string;
  customerId?: UUID | null;
  customerName?: string | null;
  lines: CartLine[];
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  branchId?: UUID | null;
}

export interface CustomerReceivableItem {
  id: UUID;
  label: string;
  date: string;
  balance: number;
  postedReceivable: boolean;
  sourceType: "service_order" | "laundry";
}

export interface CustomerReceivableProvider {
  list(customerId: UUID): CustomerReceivableItem[];
  validate(allocations: Array<{ item: CustomerReceivableItem; amount: number }>): string | null;
  apply(allocations: Array<{ item: CustomerReceivableItem; amount: number }>, now: string): void;
}
