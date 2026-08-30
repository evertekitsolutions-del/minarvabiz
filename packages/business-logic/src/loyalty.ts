/**
 * Practical loyalty: earn/redeem, history, settings, manual adjust
 */
import type { UUID } from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { touchPersistence } from "./autosave";
import { auditAction } from "./audit-actions";

export interface LoyaltySettings {
  enabled: boolean;
  pointsPerHundred: number; // earn
  redemptionValue: number; // ₹ per point when redeeming
  minRedeemPoints: number;
}

export interface LoyaltyAccount {
  customerId: UUID;
  points: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
  tier: "standard" | "silver" | "gold";
}

export interface LoyaltyTxn {
  id: UUID;
  customerId: UUID;
  type: "earn" | "redeem" | "adjust";
  points: number;
  balanceAfter: number;
  reference?: string | null;
  notes?: string | null;
  createdAt: string;
  createdBy?: string | null;
}

const settings: LoyaltySettings = {
  enabled: false,
  pointsPerHundred: 1,
  redemptionValue: 1,
  minRedeemPoints: 10,
};

const accounts = new Map<string, LoyaltyAccount>();
const history: LoyaltyTxn[] = [];

export function getLoyaltySettings(): LoyaltySettings {
  return { ...settings };
}

export function setLoyaltySettings(patch: Partial<LoyaltySettings>) {
  assertPermission("settings.manage");
  Object.assign(settings, patch);
  touchPersistence();
}

export function getLoyalty(customerId: UUID): LoyaltyAccount {
  let a = accounts.get(customerId);
  if (!a) {
    a = { customerId, points: 0, lifetimeEarned: 0, lifetimeRedeemed: 0, tier: "standard" };
    accounts.set(customerId, a);
  }
  return { ...a };
}

function tierFor(lifetime: number): LoyaltyAccount["tier"] {
  if (lifetime >= 5000) return "gold";
  if (lifetime >= 1000) return "silver";
  return "standard";
}

function pushTxn(
  customerId: UUID,
  type: LoyaltyTxn["type"],
  points: number,
  balanceAfter: number,
  reference?: string | null,
  notes?: string | null
) {
  history.push({
    id: generateId(),
    customerId,
    type,
    points,
    balanceAfter,
    reference: reference ?? null,
    notes: notes ?? null,
    createdAt: nowISO(),
  });
}

export function earnLoyalty(customerId: UUID, amountSpent: number, reference?: string): LoyaltyAccount {
  if (!settings.enabled || amountSpent <= 0) return getLoyalty(customerId);
  const earned = Math.floor(amountSpent / 100) * settings.pointsPerHundred;
  if (earned <= 0) return getLoyalty(customerId);
  const a = accounts.get(customerId) || getLoyalty(customerId);
  a.points += earned;
  a.lifetimeEarned += earned;
  a.tier = tierFor(a.lifetimeEarned);
  accounts.set(customerId, a);
  pushTxn(customerId, "earn", earned, a.points, reference);
  touchPersistence();
  return { ...a };
}

export function redeemLoyalty(
  customerId: UUID,
  points: number,
  reference?: string
): { ok: boolean; account?: LoyaltyAccount; discountAmount?: number; error?: string } {
  if (!settings.enabled) return { ok: false, error: "Loyalty disabled" };
  if (points <= 0) return { ok: false, error: "Invalid points" };
  if (points < settings.minRedeemPoints) {
    return { ok: false, error: `Minimum redeem is ${settings.minRedeemPoints} points` };
  }
  const a = accounts.get(customerId) || getLoyalty(customerId);
  if (a.points < points) return { ok: false, error: "Insufficient points" };
  a.points -= points;
  a.lifetimeRedeemed += points;
  accounts.set(customerId, a);
  const discountAmount = points * settings.redemptionValue;
  pushTxn(customerId, "redeem", -points, a.points, reference);
  touchPersistence();
  return { ok: true, account: { ...a }, discountAmount };
}

export function adjustLoyalty(
  customerId: UUID,
  delta: number,
  notes: string
): { ok: boolean; account?: LoyaltyAccount; error?: string } {
  assertPermission("settings.manage");
  const a = accounts.get(customerId) || getLoyalty(customerId);
  const next = a.points + delta;
  if (next < 0) return { ok: false, error: "Would go negative" };
  a.points = next;
  if (delta > 0) a.lifetimeEarned += delta;
  accounts.set(customerId, a);
  pushTxn(customerId, "adjust", delta, a.points, null, notes);
  auditAction("loyalty.adjust", "loyalty", customerId, null, { delta, notes });
  touchPersistence();
  return { ok: true, account: { ...a } };
}

export function listLoyaltyAccounts(): LoyaltyAccount[] {
  return [...accounts.values()];
}

export function listLoyaltyHistory(customerId?: UUID): LoyaltyTxn[] {
  let list = [...history];
  if (customerId) list = list.filter((h) => h.customerId === customerId);
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function hydrateLoyalty(data: {
  accounts?: LoyaltyAccount[];
  history?: LoyaltyTxn[];
  settings?: LoyaltySettings;
}) {
  accounts.clear();
  for (const a of data.accounts || []) accounts.set(a.customerId, a);
  if (data.history) {
    history.length = 0;
    history.push(...data.history);
  }
  if (data.settings) Object.assign(settings, data.settings);
}

export function exportLoyaltyState() {
  return {
    accounts: listLoyaltyAccounts(),
    history: [...history],
    settings: { ...settings },
  };
}
