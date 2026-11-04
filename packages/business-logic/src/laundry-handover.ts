/** Device-local customer pickup/delivery acknowledgment; NEVER an SMS or courier dispatch. */
import { generateId, nowISO } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { auditAction } from "./audit-actions";
import { touchPersistence } from "./autosave";
import { listLaundryOrders } from "./phase5-store";
import type { LaundryOrder } from "@minarvabiz/types";

export type LaundryHandoverLeg = "pickup" | "dropoff";
export interface LaundryHandoverProof {
  id: string;
  orderId: string;
  customerId: string;
  branchId: string | null;
  leg: LaundryHandoverLeg;
  acknowledgedBy: string;
  verificationMethod: "in_person_code";
  verifiedAt: string;
}
type Challenge = { code: string; expiresAt: number; attempts: number };
const proofs: LaundryHandoverProof[] = [];
const challenges = new Map<string, Challenge>();
const CHALLENGE_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const key = (orderId: string, leg: LaundryHandoverLeg) => JSON.stringify([orderId, leg]);

function validDay(iso: string): boolean {
  return typeof iso === "string" && !Number.isNaN(Date.parse(iso));
}
function eligibility(order: LaundryOrder | undefined, leg: LaundryHandoverLeg): string | null {
  if (!order || order.deletedAt || order.status === "cancelled" || order.status === "delivered") {
    return "An active undelivered laundry ticket is required";
  }
  if (leg === "pickup") {
    if (order.status !== "pending") return "Pickup acknowledgment is only available while booking is pending";
    return null;
  }
  if (leg !== "dropoff") return "Invalid handover leg";
  if (order.mode === "outsourced" && order.status !== "received") {
    return "Partner laundry must be received back before customer delivery";
  }
  if (!order.items?.length || !order.items.every(item =>
    item.qualityStatus === "passed" && (item.processingStatus === "ready" || item.processingStatus === "delivered"))) {
    return "All garments must pass QC and be ready for customer delivery";
  }
  return null;
}
function currentOrder(orderId: string): LaundryOrder | undefined {
  return listLaundryOrders().find(order => order.id === orderId);
}
/** Caller is responsible for communicating this code directly to the customer. No code is persisted or logged. */
export function issueLaundryHandoverCode(orderId: string, leg: LaundryHandoverLeg): { code: string; expiresAt: string } {
  assertPermission("orders.manage");
  const error = eligibility(currentOrder(orderId), leg);
  if (error) throw new Error(error);
  if (proofs.some(proof => proof.orderId === orderId && proof.leg === leg)) {
    throw new Error("Customer acknowledgment already recorded for this ticket and leg");
  }
  const identity = key(orderId, leg);
  const active = challenges.get(identity);
  if (active && active.expiresAt > Date.now() && active.attempts < MAX_ATTEMPTS) {
    throw new Error("A code is already active for this ticket; verify it before requesting another");
  }
  const random = globalThis.crypto?.getRandomValues;
  if (typeof random !== "function") throw new Error("Secure random number generator unavailable");
  // Rejection-sampling prevents even the small modulo bias of a 32-bit random word.
  const bytes = new Uint32Array(1);
  let n: number;
  do {
    globalThis.crypto.getRandomValues(bytes);
    n = bytes[0];
  } while (n >= 4294000000);
  const code = String(n % 1000000).padStart(6, "0");
  const expiresAt = Date.now() + CHALLENGE_MS;
  challenges.set(identity, { code, expiresAt, attempts: 0 });
  return { code, expiresAt: new Date(expiresAt).toISOString() };
}
export function verifyLaundryHandoverCode(input: {
  orderId: string; leg: LaundryHandoverLeg; code: string; acknowledgedBy: string;
}): LaundryHandoverProof {
  assertPermission("orders.manage");
  const order = currentOrder(input.orderId);
  const error = eligibility(order, input.leg);
  if (error) throw new Error(error);
  if (proofs.some(proof => proof.orderId === input.orderId && proof.leg === input.leg)) {
    throw new Error("Customer acknowledgment already recorded");
  }
  const acknowledgedBy = input.acknowledgedBy?.trim();
  if (!acknowledgedBy || acknowledgedBy.length < 2 || acknowledgedBy.length > 120) {
    throw new Error("Customer/recipient name must be 2–120 characters");
  }
  if (!/^\d{6}$/.test(input.code)) throw new Error("Enter the six-digit verification code");
  const identity = key(input.orderId, input.leg);
  const active = challenges.get(identity);
  if (!active || Date.now() >= active.expiresAt || active.attempts >= MAX_ATTEMPTS) {
    challenges.delete(identity);
    throw new Error("Code expired or too many attempts; issue a new code");
  }
  active.attempts++;
  if (active.code !== input.code) {
    if (active.attempts >= MAX_ATTEMPTS) challenges.delete(identity);
    throw new Error("Incorrect code");
  }
  challenges.delete(identity);
  const proof: LaundryHandoverProof = {
    id: generateId(), orderId: order!.id, customerId: order!.customerId, branchId: order!.branchId ?? null,
    leg: input.leg, acknowledgedBy, verificationMethod: "in_person_code", verifiedAt: nowISO(),
  };
  proofs.push(proof);
  auditAction("laundry.handover_acknowledged", "laundry_handover", proof.id, null, { ...proof });
  touchPersistence();
  return { ...proof };
}
export function listLaundryHandoverProofs(orderId?: string): LaundryHandoverProof[] {
  return proofs.filter(x => !orderId || x.orderId === orderId).map(x => ({ ...x }))
    .sort((a, b) => b.verifiedAt.localeCompare(a.verifiedAt));
}
export function validateLaundryHandoverProofs(raw: unknown): LaundryHandoverProof[] {
  if (!Array.isArray(raw) || raw.length > 100000) throw new Error("Invalid handover proof archive");
  const ids = new Set<string>(), legs = new Set<string>();
  return raw.map(value => {
    if (!value || typeof value !== "object") throw new Error("Invalid handover proof");
    const row = value as LaundryHandoverProof;
    if (typeof row.id !== "string" || !row.id || ids.has(row.id)
      || typeof row.orderId !== "string" || !row.orderId
      || typeof row.customerId !== "string" || !row.customerId
      || (row.branchId != null && typeof row.branchId !== "string")
      || !["pickup", "dropoff"].includes(row.leg)
      || typeof row.acknowledgedBy !== "string" || row.acknowledgedBy.trim().length < 2
      || row.acknowledgedBy.length > 120
      || row.verificationMethod !== "in_person_code" || !validDay(row.verifiedAt)
      || legs.has(key(row.orderId, row.leg))) throw new Error("Invalid handover proof fields");
    ids.add(row.id);
    legs.add(key(row.orderId, row.leg));
    return { ...row, acknowledgedBy: row.acknowledgedBy.trim() };
  });
}
export function exportLaundryHandoverProofs(): LaundryHandoverProof[] {
  return listLaundryHandoverProofs();
}
export function hydrateLaundryHandoverProofs(raw: unknown): void {
  const validated = validateLaundryHandoverProofs(raw);
  proofs.splice(0, proofs.length, ...validated);
  challenges.clear();
}
