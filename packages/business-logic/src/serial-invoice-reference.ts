/**
 * INV-007 — read-only check of a manually attached serialized-item invoice
 * against posted Sales History. A matching product line on an invoice does NOT
 * prove that the specific serial number was actually delivered to the buyer.
 * No warranty coverage or entitlement is calculated or implied.
 */
import type { Sale } from "@minarvabiz/types";
import { assertPermission } from "./permissions";
import { getActiveBranch } from "./phase9-store";
import { listSerialCustodyRecords } from "./serial-custody-register";
import * as store from "./store";

export type SerialInvoiceCheckStatus =
  | "not_marked_sold"
  | "reference_not_found"
  | "ambiguous_invoice"
  | "void_or_returned"
  | "product_not_on_invoice"
  | "invoice_product_match";
export interface SerialInvoiceCheck {
  readonly serialNumber: string;
  readonly reference: string;
  readonly status: SerialInvoiceCheckStatus;
  readonly invoiceNumber: string | null;
  readonly saleDate: string | null;
  readonly customerName: string | null;
  readonly productQuantity: number | null;
  readonly explanation: string;
  readonly serialDeliveryVerified: false;
  readonly warrantyEligibilityVerified: false;
}
function cleanReference(v:unknown):v is string{
  return typeof v==="string"&&v.length>0&&v.length<=120&&v.trim()===v;
}
function normalize(v:string):string{return v.trim().toLocaleUpperCase("en-US");}
function safeLineQuantity(sale:Sale,productId:string):number|null{
  const rows=sale.items.filter(x=>x.productId===productId);
  if(rows.length===0)return null;
  let total=0;
  for(const item of rows){
    if(!Number.isFinite(item.quantity)||item.quantity<=0||
       Math.abs(item.quantity*1000-Math.round(item.quantity*1000))>1e-7||
       !Number.isSafeInteger(Math.round(item.quantity*1000))){
      return null;
    }
    total+=item.quantity;
  }
  return Number.isSafeInteger(Math.round(total*1000)) ? Math.round(total*1000)/1000:null;
}
/**
 * Roles and branch scope are checked BEFORE searching Sales History.
 * Legacy invoices with no branch provenance cannot be used as evidence.
 * The return value proves only invoice/product/date *consistency*, not
 * the actual unique serial-to-sale relation or customer warranty.
 */
export function verifySerialInvoiceProductMatch(serialRecordId:string):SerialInvoiceCheck{
  assertPermission("reports.view");
  const branch=getActiveBranch();
  if(!branch||!branch.isActive||branch.deletedAt)throw new Error("Select an active branch");
  const record=listSerialCustodyRecords().find(x=>x.id===serialRecordId&&x.branchId===branch.id);
  if(!record)throw new Error("Serial not found in active branch");
  const base={
    serialNumber:record.serialNumber,reference:record.reference,
    invoiceNumber:null,saleDate:null,customerName:null,productQuantity:null,
    serialDeliveryVerified:false as const,warrantyEligibilityVerified:false as const,
  };
  if(record.status!=="sold"||!cleanReference(record.reference)){
    return {...base,status:"not_marked_sold",
      explanation:"Serial is not manually marked sold with a valid invoice reference"};
  }
  const ref=normalize(record.reference);
  const candidates=store.listSales().filter(s=>!s.deletedAt && s.branchId===branch.id &&
    (normalize(s.invoiceNumber)===ref || normalize(s.id)===ref));
  if(candidates.length===0){
    return {...base,status:"reference_not_found",
      explanation:"No invoice with this reference was found in the active branch"};
  }
  if(candidates.length!==1){
    return {...base,status:"ambiguous_invoice",
      explanation:"More than one matching invoice; reference cannot be accepted"};
  }
  const sale=candidates[0];
  const details={
    ...base,invoiceNumber:sale.invoiceNumber,
    saleDate:sale.saleDate,
    customerName:sale.customerName?.trim()||null,
  };
  if(!["completed","partial"].includes(sale.status)){
    return {...details,status:"void_or_returned",
      explanation:"Matching invoice is draft, cancelled or returned; do not assume warranty"};
  }
  const quantity=safeLineQuantity(sale,record.productId);
  if(quantity==null){
    return {...details,status:"product_not_on_invoice",
      explanation:"Invoice does not contain a valid positive quantity of this product"};
  }
  return {...details,productQuantity:quantity,status:"invoice_product_match",
    explanation:"Invoice, branch and product line match. The serial itself, delivery and warranty entitlement are NOT verified"};
}
