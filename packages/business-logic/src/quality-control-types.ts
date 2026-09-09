import type { ISODateString, UUID, ServiceOrder } from "@minarvabiz/types";

export type QualityCheckStatus = "pending" | "passed" | "failed";

export interface OrderQualityCheck {
  status: QualityCheckStatus;
  checkedAt: ISODateString;
  checkedBy?: UUID | null;
  notes?: string | null;
  issues: string[];
}

declare module "@minarvabiz/types" {
  interface ServiceOrder {
    qualityCheck?: OrderQualityCheck | null;
  }
}

export type QualityCheckedOrder = ServiceOrder & { qualityCheck?: OrderQualityCheck | null };
