/**
 * Inventory Intelligence — deterministic planning signals for boutique stock.
 *
 * Financial quantities are calculated without AI or heuristic black boxes so the
 * same dataset always produces the same operational recommendation.
 */

import { roundMoney } from "@minarvabiz/utils";

export interface InventoryIntelligenceItem {
  productId: string;
  name: string;
  sku?: string | null;
  category?: string | null;
  unit: string;
  stockQuantity: number;
  minimumStock: number;
  costPrice: number;
  sellingPrice: number;
  /** Quantity sold during the analysis window. */
  unitsSold: number;
  /** Analysis-window length in days. */
  periodDays: number;
  /** Supplier lead time in days. */
  leadTimeDays?: number | null;
  /** Desired safety-stock coverage in days. */
  safetyStockDays?: number | null;
  /** Optional maximum desired stock level. */
  maximumStock?: number | null;
  /** Days since the last sale; null means never sold. */
  daysSinceLastSale?: number | null;
}

export type InventoryHealth =
  | "out_of_stock"
  | "critical"
  | "reorder"
  | "healthy"
  | "overstocked"
  | "dead_stock";

export type InventoryAbcClass = "A" | "B" | "C";

export interface InventoryIntelligenceResult {
  productId: string;
  name: string;
  sku?: string | null;
  averageDailySales: number;
  daysOfCover: number | null;
  reorderPoint: number;
  recommendedOrderQty: number;
  stockValue: number;
  grossMarginPercent: number;
  health: InventoryHealth;
  abcClass: InventoryAbcClass;
  deadStock: boolean;
  slowMoving: boolean;
}

export interface InventoryIntelligenceSummary {
  totalProducts: number;
  totalStockUnits: number;
  totalStockValue: number;
  reorderProducts: number;
  outOfStockProducts: number;
  deadStockProducts: number;
  overstockedProducts: number;
  estimatedReorderValue: number;
}

export interface InventoryIntelligenceSnapshot {
  items: InventoryIntelligenceResult[];
  summary: InventoryIntelligenceSummary;
  generatedAt: string;
}

function nonNegative(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value as number) : 0;
}

function roundQty(value: number): number {
  return Math.max(0, Math.ceil(value * 100) / 100);
}

/** Calculate average daily sales for an analysis window. */
export function averageDailySales(unitsSold: number, periodDays: number): number {
  const days = Math.max(1, periodDays);
  return roundQty(nonNegative(unitsSold) / days);
}

/** Reorder point = expected lead-time demand + safety stock. */
export function calculateReorderPoint(
  dailySales: number,
  leadTimeDays: number,
  safetyStockDays: number,
): number {
  const daily = nonNegative(dailySales);
  const lead = nonNegative(leadTimeDays);
  const safetyDays = nonNegative(safetyStockDays);
  return roundQty(daily * (lead + safetyDays));
}

/** Recommended purchase quantity to reach the desired stock level. */
export function calculateRecommendedOrderQty(
  stockQuantity: number,
  dailySales: number,
  leadTimeDays: number,
  safetyStockDays: number,
  minimumStock: number,
  maximumStock?: number | null,
): number {
  const target = nonNegative(maximumStock) ||
    Math.max(nonNegative(minimumStock), calculateReorderPoint(dailySales, leadTimeDays, safetyStockDays));
  return roundQty(Math.max(0, target - nonNegative(stockQuantity)));
}

function classifyHealth(item: InventoryIntelligenceItem, dailySales: number, reorderPoint: number): InventoryHealth {
  const stock = nonNegative(item.stockQuantity);
  const daysCover = dailySales > 0 ? stock / dailySales : null;
  const daysSinceLastSale = item.daysSinceLastSale;

  if (stock <= 0) return "out_of_stock";
  if (daysSinceLastSale != null && daysSinceLastSale >= 180 && item.unitsSold <= 0) return "dead_stock";
  if (stock <= reorderPoint) return "critical";
  if (daysCover != null && daysCover < 14) return "reorder";

  const maximum = nonNegative(item.maximumStock);
  if (maximum > 0 && stock > maximum) return "overstocked";
  return "healthy";
}

/**
 * ABC classification from stock value. A ≈ top 80% cumulative value,
 * B ≈ next 15%, C ≈ final 5%.
 */
export function classifyAbcByValue(
  values: Array<{ productId: string; stockValue: number }>,
): Map<string, InventoryAbcClass> {
  const total = values.reduce((sum, item) => sum + Math.max(0, item.stockValue), 0);
  const sorted = [...values].sort((a, b) => b.stockValue - a.stockValue);
  const result = new Map<string, InventoryAbcClass>();
  let cumulative = 0;

  for (const item of sorted) {
    cumulative += Math.max(0, item.stockValue);
    const ratio = total > 0 ? cumulative / total : 1;
    result.set(item.productId, ratio <= 0.8 ? "A" : ratio <= 0.95 ? "B" : "C");
  }

  return result;
}

export function buildInventoryIntelligence(
  items: InventoryIntelligenceItem[],
  generatedAt = new Date().toISOString(),
): InventoryIntelligenceSnapshot {
  const stockValuePairs = items.map((item) => ({
    productId: item.productId,
    stockValue: nonNegative(item.stockQuantity) * nonNegative(item.costPrice),
  }));
  const abc = classifyAbcByValue(stockValuePairs);

  const results = items.map<InventoryIntelligenceResult>((item) => {
    const daily = averageDailySales(item.unitsSold, item.periodDays);
    const reorderPoint = Math.max(
      nonNegative(item.minimumStock),
      calculateReorderPoint(daily, item.leadTimeDays ?? 7, item.safetyStockDays ?? 7),
    );
    const recommendedOrderQty = calculateRecommendedOrderQty(
      item.stockQuantity,
      daily,
      item.leadTimeDays ?? 7,
      item.safetyStockDays ?? 7,
      item.minimumStock,
      item.maximumStock,
    );
    const stockValue = nonNegative(item.stockQuantity) * nonNegative(item.costPrice);
    const grossMarginPercent = item.sellingPrice > 0
      ? ((item.sellingPrice - item.costPrice) / item.sellingPrice) * 100
      : 0;
    const daysOfCover = daily > 0 ? nonNegative(item.stockQuantity) / daily : null;
    const slowMoving = daysOfCover != null ? daysOfCover >= 90 : item.unitsSold <= 0;
    const health = classifyHealth(item, daily, reorderPoint);

    return {
      productId: item.productId,
      name: item.name,
      sku: item.sku ?? null,
      averageDailySales: daily,
      daysOfCover,
      reorderPoint,
      recommendedOrderQty,
      stockValue: roundMoney(stockValue),
      grossMarginPercent: Math.round(grossMarginPercent * 100) / 100,
      health,
      abcClass: abc.get(item.productId) ?? "C",
      deadStock: health === "dead_stock",
      slowMoving,
    };
  });

  const summary = results.reduce<InventoryIntelligenceSummary>(
    (acc, item, index) => {
      const source = items[index];
      acc.totalStockUnits += nonNegative(source.stockQuantity);
      acc.totalStockValue += item.stockValue;
      acc.reorderProducts += item.health === "critical" || item.health === "reorder" || item.health === "out_of_stock" ? 1 : 0;
      acc.outOfStockProducts += item.health === "out_of_stock" ? 1 : 0;
      acc.deadStockProducts += item.deadStock ? 1 : 0;
      acc.overstockedProducts += item.health === "overstocked" ? 1 : 0;
      acc.estimatedReorderValue += item.recommendedOrderQty * nonNegative(source.costPrice);
      return acc;
    },
    {
      totalProducts: results.length,
      totalStockUnits: 0,
      totalStockValue: 0,
      reorderProducts: 0,
      outOfStockProducts: 0,
      deadStockProducts: 0,
      overstockedProducts: 0,
      estimatedReorderValue: 0,
    },
  );

  return {
    items: results,
    summary: {
      ...summary,
      totalStockValue: roundMoney(summary.totalStockValue),
      estimatedReorderValue: roundMoney(summary.estimatedReorderValue),
    },
    generatedAt,
  };
}
