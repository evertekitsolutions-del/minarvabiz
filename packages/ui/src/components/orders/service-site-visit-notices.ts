/** SVC: accurate, opt-in, manual customer visit updates; no automatic API sends. */
export type VisitNoticeKind = "scheduled" | "arrived" | "completed" | "feedback" | "cancelled";
export type VisitNoticeStatus = "scheduled" | "arrived" | "completed" | "cancelled";
export interface VisitNoticeContext {
  status: VisitNoticeStatus;
  orderNumber: string;
  businessName: string;
  scheduledOn: string;
  siteAddress: string;
  arrivedAt: string | null;
  completedAt: string | null;
}

const noticeLabels: Record<VisitNoticeKind, string> = {
  scheduled: "Visit scheduled",
  arrived: "Technician arrived",
  completed: "Visit completed",
  feedback: "Request feedback",
  cancelled: "Visit cancelled",
};
export const serviceVisitNoticeLabel = (kind: VisitNoticeKind) => noticeLabels[kind];

export function availableVisitNoticeKinds(status: VisitNoticeStatus): readonly VisitNoticeKind[] {
  switch (status) {
    case "scheduled": return ["scheduled"];
    case "arrived": return ["arrived"];
    case "completed": return ["completed", "feedback"];
    case "cancelled": return ["cancelled"];
    default: return [];
  }
}

function safeDisplay(value: string, name: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max ||
    /[\u0000-\u001f\u007f]/u.test(value)) throw new Error("Invalid " + name);
  return value.trim();
}

/**
 * Formatting does not mutate the service order and does not assert
 * successful delivery. Only current, recorded visit states may be shared.
 */
export function buildVisitNoticeMessage(kind: VisitNoticeKind, info: VisitNoticeContext): string {
  if (!availableVisitNoticeKinds(info.status).includes(kind)) {
    throw new Error("Visit status does not permit this customer update.");
  }
  const order = safeDisplay(info.orderNumber, "service order", 128);
  const business = safeDisplay(info.businessName, "business name", 160);
  const address = safeDisplay(info.siteAddress, "visit address", 500);
  const day = safeDisplay(info.scheduledOn, "scheduled date", 10);
  if (!/^20\d{2}-\d\d-\d\d$/.test(day) ||
    !Number.isFinite(Date.parse(day + "T00:00:00Z")) ||
    new Date(day + "T00:00:00Z").toISOString().slice(0, 10) !== day) {
    throw new Error("Invalid planned visit date");
  }
  const prefix = "Service order " + order + " — ";
  let message: string;
  switch (kind) {
    case "scheduled":
      message = prefix + "a technician visit is scheduled for " + day + " at " + address + ".";
      break;
    case "arrived":
      if (!info.arrivedAt) throw new Error("Arrival has not been recorded.");
      message = prefix + "our technician has been marked arrived at " + address + ".";
      break;
    case "completed":
      if (!info.completedAt) throw new Error("Completion has not been recorded.");
      message = prefix + "the scheduled site visit has been marked completed. Please contact us if any issue remains.";
      break;
    case "feedback":
      if (!info.completedAt) throw new Error("Completion has not been recorded.");
      message = prefix + "thank you for the site visit. Please reply with your feedback on the service.";
      break;
    case "cancelled":
      message = prefix + "the planned visit for " + day + " has been cancelled. Please contact us to reschedule.";
      break;
  }
  return "Hello,\n" + message + "\n— " + business;
}
