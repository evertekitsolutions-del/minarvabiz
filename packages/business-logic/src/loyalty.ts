/** Simple loyalty points foundation */
import type { UUID } from "@minarvabiz/types";
import { touchPersistence } from "./autosave";

export interface LoyaltyAccount {
  customerId: UUID;
  points: number;
  lifetimeEarned: number;
}

const accounts = new Map<string, LoyaltyAccount>();
const POINTS_PER_100 = 1; // 1 point per ₹100 spent

export function getLoyalty(customerId: UUID): LoyaltyAccount {
  let a = accounts.get(customerId);
  if (!a) {
    a = { customerId, points: 0, lifetimeEarned: 0 };
    accounts.set(customerId, a);
  }
  return { ...a };
}

export function earnLoyalty(customerId: UUID, amountSpent: number): LoyaltyAccount {
  const earned = Math.floor(amountSpent / 100) * POINTS_PER_100;
  const a = getLoyalty(customerId);
  a.points += earned;
  a.lifetimeEarned += earned;
  accounts.set(customerId, a);
  touchPersistence();
  return { ...a };
}

export function redeemLoyalty(customerId: UUID, points: number): { ok: boolean; account?: LoyaltyAccount; error?: string } {
  const a = getLoyalty(customerId);
  if (points <= 0) return { ok: false, error: "Invalid points" };
  if (a.points < points) return { ok: false, error: "Insufficient points" };
  a.points -= points;
  accounts.set(customerId, a);
  touchPersistence();
  return { ok: true, account: { ...a } };
}

export function listLoyaltyAccounts(): LoyaltyAccount[] {
  return [...accounts.values()];
}

export function hydrateLoyalty(data: { accounts?: LoyaltyAccount[] }) {
  accounts.clear();
  for (const a of data.accounts || []) accounts.set(a.customerId, a);
}
