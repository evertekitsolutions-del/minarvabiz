/**
 * INV-018 — read-only physical stock count worksheet (CSV).
 *
 * CSV is a snapshot for manual count. It MUST NOT change stock quantities,
 * mark a count completed or claim discrepancies are reconciled.
 */
import type { Product } from "@minarvabiz/types";
import { toQuantityMilli, QUANTITY_MILLI_FACTOR } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { getActiveBranch } from "./phase9-store";
import { listProducts } from "./store";

function csvText(value:unknown):string {
  const raw=String(value??"");
  // Prevent spreadsheet formula execution in user-controlled names and SKUs.
  const safe=/^\s*[=+\-@\t\r]/.test(raw)?"'"+raw:raw;
  return '"' + safe.replace(/"/g,'""') + '"';
}
function csvNumber(value:number):string {
  if(!Number.isFinite(value))throw new Error("Stock count contains invalid inventory quantity");
  return String(value);
}
export interface StockCountWorksheet {
  readonly includedProducts:number;
  readonly snapshotAt:string;
  readonly csv:string;
}
export function createStockCountWorksheet(
  products:readonly Product[],snapshotAt:string,
):StockCountWorksheet {
  const instant=new Date(snapshotAt);
  if(!Number.isFinite(instant.getTime()))throw new Error("Invalid stock count snapshot timestamp");
  const iso=instant.toISOString();
  const eligible=products.filter(p=>!p.deletedAt)
    .sort((a,b)=>a.name.localeCompare(b.name)||(a.sku??"").localeCompare(b.sku??"")||
      a.id.localeCompare(b.id));
  const lines=[
    ["Snapshot UTC","Product ID","SKU","Product","Barcode","Unit",
      "System quantity","Counted quantity","Variance quantity","Count notes"],
  ];
  for(const product of eligible){
    if(!product.id||!product.name?.trim())throw new Error("Stock count product identity is missing");
    if(!Number.isFinite(product.stockQuantity))throw new Error("Stock count contains invalid inventory quantity");
    const milli=toQuantityMilli(product.stockQuantity);
    if(Math.abs(milli/QUANTITY_MILLI_FACTOR-product.stockQuantity)>1e-9){
      throw new Error("Stock count quantity exceeds 0.001 precision");
    }
    // Blank Counted / Variance cells deliberately require on-site counting.
    lines.push([iso,product.id,product.sku??"",product.name,
      product.barcode??"",product.unit,String(product.stockQuantity),"","",""]);
  }
  const csv=lines.map((row,index)=>
    row.map((value,col)=>index>0&&col===6
      ? csvNumber(Number(value))
      : csvText(value)).join(",")
  ).join("\r\n")+"\r\n";
  return{includedProducts:eligible.length,snapshotAt:iso,csv};
}

/** Current role and branch are established by the host, not the renderer. */
export function buildAuthorizedStockCountWorksheet(now=new Date()):StockCountWorksheet{
  assertPermission("inventory.adjust");
  if(!Number.isFinite(now.getTime()))throw new Error("Invalid stock count timestamp");
  const branch=getActiveBranch();
  return createStockCountWorksheet(listProducts().filter(p=>
    p.branchId==null||(branch!=null&&p.branchId===branch.id)),now.toISOString());
}
