/**
 * INV-023 — goods receipt landed-cost allocation preview.
 *
 * Original Minarva implementation inspired by standard ERPNext/Odoo landed
 * cost workflows (concept only; no upstream source code incorporated).
 * No stock valuation, accounting, receipt or purchase document is mutated.
 */
import type { GoodsReceipt } from "@minarvabiz/types";

export type LandedAllocationMethod = "value" | "quantity";
export interface LandedCostExtras {
  readonly freight: string;
  readonly insurance: string;
  readonly customsDuty: string;
  readonly other: string;
}
export interface LandedCostInput {
  readonly method: LandedAllocationMethod;
  readonly costs: LandedCostExtras;
}
export interface LandedCostLinePreview {
  readonly receiptLineId: string;
  readonly productId: string | null;
  readonly description: string;
  readonly receivedQuantity: number;
  readonly baseCost: number;
  readonly allocatedExtraCost: number;
  readonly landedCost: number;
  /** Rounded display only; never persist this figure to financial ledgers. */
  readonly landedUnitCost: number;
}
export interface LandedCostPreview {
  readonly grnNumber: string;
  readonly method: LandedAllocationMethod;
  readonly baseSubtotal: number;
  readonly additionalCosts: number;
  readonly estimatedLandedTotal: number;
  readonly rows: readonly LandedCostLinePreview[];
  readonly csv: string;
}

function cents(value: string | number, label: string): number {
  const raw = String(value).trim();
  if (!/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(raw)) {
    throw new Error(label + " must be an exact non-negative two-decimal amount");
  }
  const [whole, frac=""] = raw.split(".");
  const result = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(result)) throw new Error(label + " exceeds safe currency limits");
  return result;
}
function quantityMilli(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error("Receipt quantity must be positive");
  const milli = Math.round(value * 1000);
  if (!Number.isSafeInteger(milli) || Math.abs(value * 1000 - milli) > 1e-7) {
    throw new Error("Receipt quantity supports up to 3 decimal places");
  }
  return milli;
}
function add(a: number, b: number): number {
  const out = a + b;
  if (!Number.isSafeInteger(out)) throw new Error("Landed cost exceeds safe minor units");
  return out;
}
function csvCell(value: string | number): string {
  const raw = String(value);
  const escaped = /^[\s\uFEFF]*[=+\-@\t\r]/u.test(raw) ? "'" + raw : raw;
  return '"' + escaped.replace(/"/g,'""') + '"';
}

/**
 * Allocate every additional cent exactly once by largest remainder, with a
 * stable receipt-line ID tiebreaker regardless of input array ordering.
 */
function allocate(totalMinor: number, weighted: readonly {id:string;weight:number}[]): Map<string, number> {
  const weights=weighted.map(row=>BigInt(row.weight));
  const denominator=weights.reduce((a,b)=>a+b,0n);
  if (denominator<=0n) throw new Error("Cannot allocate costs without valid weighting");
  const total=BigInt(totalMinor);
  const shares=weighted.map((row,i)=>{
    const numerator=total*weights[i];
    return {id:row.id, minor:Number(numerator/denominator), remainder:numerator%denominator};
  });
  let left=totalMinor-shares.reduce((a,r)=>add(a,r.minor),0);
  const ranked=[...shares].sort((a,b)=>
    a.remainder===b.remainder ? a.id.localeCompare(b.id) : (a.remainder>b.remainder ? -1 : 1));
  for(const row of ranked){
    if(left<=0)break;
    row.minor++;
    left--;
  }
  if(left!==0) throw new Error("Landed cost allocation could not reconcile");
  return new Map(shares.map(row=>[row.id,row.minor]));
}

/** Preview only: does not authorize posting of stock or ledgers. */
export function buildLandedCostPreview(
  receipt: GoodsReceipt,
  input: LandedCostInput,
  activeBranchId: string | null,
): LandedCostPreview {
  if (!receipt.id || !receipt.grnNumber || !Array.isArray(receipt.lines) || !receipt.lines.length) {
    throw new Error("Select a non-empty goods receipt");
  }
  if (receipt.branchId != null && receipt.branchId !== activeBranchId) {
    throw new Error("Goods receipt does not belong to the active branch");
  }
  if (input.method!=="value" && input.method!=="quantity") {
    throw new Error("Invalid landed cost allocation method");
  }
  if(receipt.lines.length>200)throw new Error("Landed cost planner supports up to 200 receipt lines");

  const extraMinor=[
    cents(input.costs.freight,"Freight"),
    cents(input.costs.insurance,"Insurance"),
    cents(input.costs.customsDuty,"Customs duty"),
    cents(input.costs.other,"Other landing expenses"),
  ].reduce(add,0);
  const seen = new Set<string>();
  const source = receipt.lines.map(line=>{
    if (!line.id || seen.has(line.id)) throw new Error("Duplicate or missing goods receipt line ID");
    seen.add(line.id);
    const baseMinor=cents(line.lineTotal,"Receipt line amount");
    const qtyMilli=quantityMilli(line.receivedQuantity);
    // Original approved GRN is the source of base values; do not reconstruct
    // physical line cost from a price with a different rounding convention.
    return {line,baseMinor,qtyMilli};
  });
  const baseMinor=source.reduce((sum,r)=>add(sum,r.baseMinor),0);
  if (cents(receipt.subtotal,"Receipt subtotal")!==baseMinor) {
    throw new Error("Receipt subtotal does not match its lines");
  }
  const weights=source.map(({line,baseMinor,qtyMilli})=>({
    id:line.id, weight:input.method==="value"?baseMinor:qtyMilli,
  }));
  if (extraMinor>0 && weights.every(r=>r.weight===0)) {
    throw new Error("Zero-value receipts require quantity-based cost allocation");
  }
  const allocations=extraMinor===0
    ? new Map(source.map(row=>[row.line.id,0]))
    : allocate(extraMinor,weights);
  const rows: LandedCostLinePreview[]=source.map(({line,baseMinor,qtyMilli})=>{
    const allocated=allocations.get(line.id)??0;
    const landedMinor=add(baseMinor,allocated);
    const unitCents=(BigInt(landedMinor)*1000n*10000n)/BigInt(qtyMilli);
    // Display up to four minor-unit decimals; source total remains exact cents.
    return {
      receiptLineId:line.id,productId:line.productId??null,
      description:line.description,receivedQuantity:line.receivedQuantity,
      baseCost:baseMinor/100,allocatedExtraCost:allocated/100,
      landedCost:landedMinor/100,
      landedUnitCost:Number(unitCents)/100/10000,
    };
  });
  const landedMinor=add(baseMinor,extraMinor);
  if(rows.reduce((sum,row)=>add(sum,cents(row.landedCost,"Landed line cost")),0)!==landedMinor){
    throw new Error("Landed cost does not reconcile across lines");
  }
  const csv=[
    ["GRN","Allocation method","Receipt line ID","Product ID","Description","Quantity",
      "Base amount","Allocated landed charges","Landed amount","Estimated landed unit cost"],
    ...rows.map(row=>[
      receipt.grnNumber,input.method,row.receiptLineId,row.productId??"",
      row.description,String(row.receivedQuantity),row.baseCost.toFixed(2),
      row.allocatedExtraCost.toFixed(2),row.landedCost.toFixed(2),
      row.landedUnitCost.toFixed(4),
    ]),
  ].map(cells=>cells.map(csvCell).join(",")).join("\r\n")+"\r\n";
  return {
    grnNumber:receipt.grnNumber,method:input.method,
    baseSubtotal:baseMinor/100,additionalCosts:extraMinor/100,
    estimatedLandedTotal:landedMinor/100,rows,csv,
  };
}
