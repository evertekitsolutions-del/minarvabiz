/**
 * Deterministic customer intelligence for CRM, dashboard and future AI surfaces.
 *
 * This module deliberately contains no database/UI dependencies. It turns order
 * history into stable RFM-style segments, spend/LTV estimates, churn risk and
 * follow-up opportunities. Financial values are calculated from supplied,
 * already-recorded transaction totals; AI must not replace these calculations.
 */

export type CustomerSegment =
  | "champion"
  | "loyal"
  | "promising"
  | "new"
  | "at_risk"
  | "lost"
  | "hibernating";

export type CustomerRisk = "low" | "medium" | "high";

export interface CustomerIntelligenceOrder {
  customerId: string;
  total: number;
  paid?: number;
  date: string;
  profit?: number;
  status?: string;
  cancelled?: boolean;
}

export interface CustomerIntelligenceCustomer {
  id: string;
  name: string;
  createdAt?: string;
  phone?: string | null;
}

export interface CustomerIntelligenceProfile {
  customerId: string;
  customerName: string;
  phone: string | null;
  orders: number;
  completedOrders: number;
  totalSpend: number;
  totalProfit: number;
  averageOrderValue: number;
  estimatedAnnualValue: number;
  daysSinceLastOrder: number | null;
  frequencyScore: number;
  monetaryScore: number;
  recencyScore: number;
  loyaltyScore: number;
  segment: CustomerSegment;
  churnRisk: CustomerRisk;
  followUp: "none" | "welcome" | "win_back" | "loyalty" | "vip" | "overdue_balance";
}

export interface CustomerIntelligenceSnapshot {
  customers: CustomerIntelligenceProfile[];
  segments: Record<CustomerSegment, number>;
  totalCustomerValue: number;
  averageCustomerValue: number;
  highRiskCount: number;
  followUpCount: number;
}

const ACTIVE_ORDER_STATUSES = new Set([
  "pending",
  "received",
  "cutting",
  "stitching",
  "alteration",
  "qc",
  "processing",
  "ready_to_deliver",
  "delivered",
]);

function dayStart(value: Date): number {
  return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((dayStart(to) - dayStart(from)) / 86_400_000));
}

function scoreDescending(value: number, values: number[]): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  let rank = 1;
  for (const candidate of sorted) if (value >= candidate) rank += 1;
  return Math.min(5, Math.max(1, Math.ceil((rank / (sorted.length + 1)) * 5)));
}

function scoreRecency(days: number | null): number {
  if (days === null) return 1;
  if (days <= 30) return 5;
  if (days <= 60) return 4;
  if (days <= 120) return 3;
  if (days <= 240) return 2;
  return 1;
}

function segmentFor(profile: Pick<CustomerIntelligenceProfile, "orders" | "totalSpend" | "recencyScore" | "frequencyScore" | "monetaryScore" | "daysSinceLastOrder">): CustomerSegment {
  if (profile.orders === 0) return "new";
  if (profile.daysSinceLastOrder !== null && profile.daysSinceLastOrder > 365) return "hibernating";
  if (profile.daysSinceLastOrder !== null && profile.daysSinceLastOrder > 180) return "lost";
  if (profile.recencyScore <= 2 && (profile.monetaryScore >= 3 || profile.frequencyScore >= 3)) return "at_risk";
  if (profile.recencyScore >= 4 && profile.frequencyScore >= 4 && profile.monetaryScore >= 4) return "champion";
  if (profile.frequencyScore >= 3 && profile.monetaryScore >= 3) return "loyal";
  if (profile.orders <= 1) return "new";
  return "promising";
}

function riskFor(days: number | null, frequencyScore: number, monetaryScore: number): CustomerRisk {
  if (days === null) return "low";
  if (days > 180 || (days > 120 && (frequencyScore >= 3 || monetaryScore >= 4))) return "high";
  if (days > 60) return "medium";
  return "low";
}

export function getCustomerIntelligenceSnapshot(
  customers: CustomerIntelligenceCustomer[],
  orders: CustomerIntelligenceOrder[],
  now = new Date()
): CustomerIntelligenceSnapshot {
  const validOrders = orders.filter((order) => {
    if (order.cancelled) return false;
    if (order.status && !ACTIVE_ORDER_STATUSES.has(order.status)) return false;
    return Boolean(order.customerId) && Number.isFinite(order.total) && !Number.isNaN(new Date(order.date).getTime());
  });

  const byCustomer = new Map<string, CustomerIntelligenceOrder[]>();
  for (const order of validOrders) {
    const list = byCustomer.get(order.customerId) || [];
    list.push(order);
    byCustomer.set(order.customerId, list);
  }

  const aggregates = customers.map((customer) => {
    const customerOrders = byCustomer.get(customer.id) || [];
    const dated = customerOrders
      .map((order) => ({ order, date: new Date(order.date) }))
      .filter(({ date }) => !Number.isNaN(date.getTime()))
      .sort((a, b) => b.date.getTime() - a.date.getTime());
    const totalSpend = customerOrders.reduce((sum, order) => sum + Math.max(0, order.total), 0);
    const totalProfit = customerOrders.reduce((sum, order) => sum + (Number.isFinite(order.profit) ? order.profit || 0 : 0), 0);
    const daysSinceLastOrder = dated.length ? daysBetween(dated[0].date, now) : null;
    const completedOrders = customerOrders.filter((order) => order.status === "delivered").length;
    const unpaid = customerOrders.some((order) => Number.isFinite(order.paid) && (order.paid || 0) < order.total);
    return { customer, customerOrders, totalSpend, totalProfit, daysSinceLastOrder, completedOrders, unpaid };
  });

  const frequencyValues = aggregates.map((x) => x.customerOrders.length);
  const monetaryValues = aggregates.map((x) => x.totalSpend);

  const profiles: CustomerIntelligenceProfile[] = aggregates.map((item) => {
    const ordersCount = item.customerOrders.length;
    const averageOrderValue = ordersCount ? item.totalSpend / ordersCount : 0;
    const frequencyScore = scoreDescending(ordersCount, frequencyValues);
    const monetaryScore = scoreDescending(item.totalSpend, monetaryValues);
    const recencyScore = scoreRecency(item.daysSinceLastOrder);
    const loyaltyScore = Math.round(((frequencyScore + monetaryScore + recencyScore) / 15) * 100);
    const estimatedAnnualValue = averageOrderValue * Math.max(1, ordersCount) * (ordersCount >= 2 ? 2 : 1);
    const base = {
      orders: ordersCount,
      totalSpend: item.totalSpend,
      recencyScore,
      frequencyScore,
      monetaryScore,
      daysSinceLastOrder: item.daysSinceLastOrder,
    };
    const segment = segmentFor(base);
    const churnRisk = riskFor(item.daysSinceLastOrder, frequencyScore, monetaryScore);
    let followUp: CustomerIntelligenceProfile["followUp"] = "none";
    if (item.unpaid) followUp = "overdue_balance";
    else if (segment === "champion") followUp = "vip";
    else if (segment === "at_risk" || segment === "lost") followUp = "win_back";
    else if (segment === "loyal") followUp = "loyalty";
    else if (ordersCount === 0) followUp = "welcome";

    return {
      customerId: item.customer.id,
      customerName: item.customer.name || "Unnamed customer",
      phone: item.customer.phone ?? null,
      orders: ordersCount,
      completedOrders: item.completedOrders,
      totalSpend: item.totalSpend,
      totalProfit: item.totalProfit,
      averageOrderValue,
      estimatedAnnualValue,
      daysSinceLastOrder: item.daysSinceLastOrder,
      frequencyScore,
      monetaryScore,
      recencyScore,
      loyaltyScore,
      segment,
      churnRisk,
      followUp,
    };
  });

  const segments: Record<CustomerSegment, number> = {
    champion: 0,
    loyal: 0,
    promising: 0,
    new: 0,
    at_risk: 0,
    lost: 0,
    hibernating: 0,
  };
  for (const profile of profiles) segments[profile.segment] += 1;

  const totalCustomerValue = profiles.reduce((sum, profile) => sum + profile.estimatedAnnualValue, 0);
  const highRiskCount = profiles.filter((profile) => profile.churnRisk === "high").length;
  const followUpCount = profiles.filter((profile) => profile.followUp !== "none").length;

  profiles.sort((a, b) => b.totalSpend - a.totalSpend || b.loyaltyScore - a.loyaltyScore || a.customerName.localeCompare(b.customerName));

  return {
    customers: profiles,
    segments,
    totalCustomerValue,
    averageCustomerValue: profiles.length ? totalCustomerValue / profiles.length : 0,
    highRiskCount,
    followUpCount,
  };
}
