/**
 * FIN-027 — product-wise original posted-invoice profitability.
 *
 * The invoice is the financial source; catalogue cost and current stock are
 * intentionally ignored. Only historical posted product lines are counted.
 * Unlike overall P&L, later returns, refunds, service work, operating costs
 * and unallocated adjustments are not reconciled here.
 */
import type { Sale } from "@minarvabiz/types";
import {
  addMinorUnits, subtractMinorUnits, toMinorUnits, fromMinorUnits,
  toQuantityMilli, QUANTITY_MILLI_FACTOR, multiplyMinorByQuantity,
} from "@minarvabiz/utils";
import { calculateLineItem } from "@minarvabiz/billing";
import { calculateOriginalInvoiceGrossProfit } from "./invoice-gross-profit";
import { assertPermission } from "./permissions";
import { getActiveBranch } from "./phase9-store";
import { listSales } from "./store";

export interface ProductOriginalGrossMarginRow {
  productId: string;
  productName: string;
  sku: string | null;
  invoiceCount: number;
  soldQuantity: number;
  revenueExcludingTax: number;
  historicalCostOfGoods: number;
  originalGrossProfit: number;
  originalGrossMarginPercent: number;
}

function dateKey(value: string | undefined): string | null {
  if (value === undefined || value === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Invalid product margin date");
  const parsed = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== value) {
    throw new Error("Invalid product margin date");
  }
  return value;
}

interface ProductAccumulator {
  name: string;
  sku: string | null;
  seenInvoices: Set<string>;
  quantityMilli: number;
  revenueMinor: number;
  costMinor: number;
}

export function calculateProductOriginalGrossMargins(
  sales: readonly Sale[], from?: string, to?: string,
): ProductOriginalGrossMarginRow[] {
  const start=dateKey(from), end=dateKey(to);
  if (start && end && start > end) throw new Error("Product margin start date exceeds end date");
  const groups = new Map<string, ProductAccumulator>();
  for (const sale of sales) {
    if (sale.deletedAt || !["completed","partial"].includes(sale.status)) continue;
    if (typeof sale.saleDate !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(sale.saleDate)) {
      throw new Error("Posted product invoice date is invalid");
    }
    const key=sale.saleDate.slice(0,10);
    if (start && key < start || end && key > end) continue;
    const invoice=calculateOriginalInvoiceGrossProfit(sale);
    let lineRevenue=0, lineCost=0;
    // An invoice-level discount or adjustment not allocated to lines cannot
    // safely be assigned to products. Reject instead of overstating margin.
    for (const line of sale.items) {
      if (typeof line.productId !== "string" || !line.productId ||
        !Number.isFinite(line.quantity) || line.quantity <= 0 ||
        !Number.isFinite(line.costPrice) || line.costPrice < 0) {
        throw new Error("Product invoice has invalid historical cost or quantity");
      }
      const qtyMilli=toQuantityMilli(line.quantity);
      if (Math.abs(qtyMilli / QUANTITY_MILLI_FACTOR - line.quantity) > 1e-9) {
        throw new Error("Historical product quantity exceeds 0.001 precision");
      }
      const calculated=calculateLineItem({
        quantity:line.quantity, unitPrice:line.unitPrice,
        discountPercent:line.discountPercent, taxRate:line.taxRate,
      });
      if (Math.abs(toMinorUnits(calculated.total)-toMinorUnits(line.lineTotal))>1) {
        throw new Error("Stored product invoice line total is inconsistent");
      }
      const net=toMinorUnits(calculated.taxableAmount);
      const cost=multiplyMinorByQuantity(toMinorUnits(line.costPrice),line.quantity);
      lineRevenue=addMinorUnits(lineRevenue,net);
      lineCost=addMinorUnits(lineCost,cost);
    }
    if (Math.abs(lineRevenue-toMinorUnits(invoice.revenueExcludingTax))>1 ||
        Math.abs(lineCost-toMinorUnits(invoice.historicalCostOfGoods))>1) {
      throw new Error("Product invoice adjustments are not line-allocated");
    }
    for (const line of sale.items) {
      const calculated=calculateLineItem({
        quantity:line.quantity, unitPrice:line.unitPrice,
        discountPercent:line.discountPercent, taxRate:line.taxRate,
      });
      const old=groups.get(line.productId);
      const next: ProductAccumulator=old??{
        name:line.productName || line.productId,
        sku:line.sku??null, seenInvoices:new Set<string>(),
        quantityMilli:0,revenueMinor:0,costMinor:0,
      };
      next.seenInvoices.add(sale.id);
      next.quantityMilli=addMinorUnits(next.quantityMilli,toQuantityMilli(line.quantity));
      next.revenueMinor=addMinorUnits(next.revenueMinor,toMinorUnits(calculated.taxableAmount));
      next.costMinor=addMinorUnits(next.costMinor,
        multiplyMinorByQuantity(toMinorUnits(line.costPrice),line.quantity));
      groups.set(line.productId,next);
    }
  }
  return [...groups].map(([productId,data])=>{
    const gross=subtractMinorUnits(data.revenueMinor,data.costMinor);
    return {
      productId,productName:data.name,sku:data.sku,
      invoiceCount:data.seenInvoices.size,
      soldQuantity:data.quantityMilli/QUANTITY_MILLI_FACTOR,
      revenueExcludingTax:fromMinorUnits(data.revenueMinor),
      historicalCostOfGoods:fromMinorUnits(data.costMinor),
      originalGrossProfit:fromMinorUnits(gross),
      originalGrossMarginPercent:data.revenueMinor===0?0:
        Math.round(gross/data.revenueMinor*10000)/100,
    };
  }).sort((a,b)=>b.originalGrossProfit-a.originalGrossProfit||
    a.productName.localeCompare(b.productName)||a.productId.localeCompare(b.productId));
}

/** Host-authorized reader. Callers cannot supply the active branch scope. */
export function listAuthorizedProductOriginalGrossMargins(
  from?: string,to?: string,
): ProductOriginalGrossMarginRow[] {
  assertPermission("accounting.view");
  const branch=getActiveBranch();
  const scoped=listSales().filter(sale=>
    sale.branchId==null || (branch!=null && sale.branchId===branch.id));
  return calculateProductOriginalGrossMargins(scoped,from,to);
}
