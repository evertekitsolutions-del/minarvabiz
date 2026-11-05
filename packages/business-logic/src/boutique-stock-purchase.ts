import * as procurementStore from "./procurement-store";
import * as mainStore from "./store";
import * as suppliersStore from "./phase5-store";
import { getActiveBranch } from "./phase9-store";
import { assertPermission } from "./permissions";
import type { PaymentMethod, PurchaseInvoice } from "@minarvabiz/types";

export interface BoutiqueStockPurchaseLine {
  productId: string;
  quantity: number;
  unitCost: number;
  taxRate?: number;
}
export interface BoutiqueStockPurchaseInput {
  supplierId: string;
  supplierInvoiceNumber: string;
  invoiceDate: string;
  lines: BoutiqueStockPurchaseLine[];
  paidAmount?: number;
  paymentMethod?: PaymentMethod;
  notes?: string | null;
}
export interface BoutiqueStockPurchaseResult {
  invoice: PurchaseInvoice | null;
  purchaseOrderNumber?: string;
  error?: string;
}

/** Stock is credited by the existing GRN exactly once; the posted supplier
 * invoice records AP but must not credit stock again. No legacy direct
 * purchase entry is created, preventing duplicated supplier payables. */
export function postBoutiqueStockPurchase(input: BoutiqueStockPurchaseInput): BoutiqueStockPurchaseResult {
  assertPermission("purchases.manage");
  assertPermission("inventory.adjust");
  const supplier = suppliersStore.getSupplier(input.supplierId);
  if (!supplier) return { invoice:null, error:"Select a supplier" };
  const number = input.supplierInvoiceNumber.trim();
  if (!number || number.length > 128) return { invoice:null, error:"Supplier bill number is required (max 128 characters)" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.invoiceDate) || !Number.isFinite(Date.parse(input.invoiceDate+"T00:00:00Z")))
    return { invoice:null, error:"Valid invoice date is required" };
  if (!input.lines.length || input.lines.length > 100) return { invoice:null, error:"Add between 1 and 100 products" };
  if (procurementStore.listPurchaseInvoices().some(inv=>inv.supplierId===supplier.id &&
      inv.supplierInvoiceNumber?.toLocaleLowerCase("en")===number.toLocaleLowerCase("en") &&
      inv.status!=="cancelled")) return {invoice:null,error:"Supplier bill number already recorded; stock was not received again"};
  const branch = getActiveBranch();
  const seen = new Set<string>();
  let totalMinor=0;
  for (const [i,line] of input.lines.entries()) {
    const product=mainStore.getProduct(line.productId);
    if (!product || !product.isActive || product.hasVariants) return {invoice:null,error:`Row ${i+1}: select an individual saleable product or variant`};
    if (product.branchId && product.branchId!==branch?.id)
      return {invoice:null,error:`Row ${i+1}: product belongs to a different branch`};
    if (seen.has(product.id)) return {invoice:null,error:`Row ${i+1}: duplicate product; combine quantities`};
    seen.add(product.id);
    if (!Number.isSafeInteger(line.quantity) || line.quantity<=0 || line.quantity>1_000_000)
      return {invoice:null,error:`Row ${i+1}: quantity must be whole pieces greater than zero`};
    if (!Number.isFinite(line.unitCost) || line.unitCost<0 || !Number.isSafeInteger(Math.round(line.unitCost*100)) ||
        Math.abs(line.unitCost*100-Math.round(line.unitCost*100))>1e-7)
      return {invoice:null,error:`Row ${i+1}: enter a valid unit purchase cost`};
    const tax=line.taxRate??0;
    if (!Number.isFinite(tax)||tax<0||tax>100) return {invoice:null,error:`Row ${i+1}: invalid tax rate`};
    totalMinor+=Math.round(line.unitCost*100)*line.quantity*(1+tax/100);
    if (!Number.isSafeInteger(Math.round(totalMinor))) return {invoice:null,error:"Purchase amount exceeds safe range"};
  }
  const paid=input.paidAmount??0;
  if (!Number.isFinite(paid)||paid<0||Math.abs(paid*100-Math.round(paid*100))>1e-7||
    paid>Math.round(totalMinor)/100+0.01)
    return {invoice:null,error:"Paid amount must not exceed invoice amount"};
  if (paid>0&&!input.paymentMethod) return {invoice:null,error:"Select payment method"};

  let poNumber: string|undefined;
  try {
    const created=procurementStore.createPurchaseOrder({
      supplierId:supplier.id,orderDate:input.invoiceDate,branchId:branch?.id??null,
      notes:input.notes??null,
      lines:input.lines.map(line=>({productId:line.productId,quantity:line.quantity,unitCost:line.unitCost,taxRate:line.taxRate??0}))
    });
    if (created.errors.length||!created.purchaseOrder)
      return {invoice:null,error:created.errors.join("; ")||"Could not create purchase order"};
    const po=created.purchaseOrder;
    poNumber=po.poNumber;
    const approved=procurementStore.approvePurchaseOrder(po.id);
    if (!approved.purchaseOrder) throw new Error(approved.error||"Could not approve stock receipt");
    const received=procurementStore.receivePurchaseOrder({
      purchaseOrderId:po.id,receiptDate:input.invoiceDate,
      lines:po.lines.map(row=>({purchaseOrderLineId:row.id,quantity:row.orderedQuantity}))
    });
    if (received.errors.length||!received.goodsReceipt)
      throw new Error(received.errors.join("; ")||"Could not receive stock");
    const invoice=procurementStore.createPurchaseInvoice({
      purchaseOrderId:po.id,supplierInvoiceNumber:number,invoiceDate:input.invoiceDate,
      lines:po.lines.map(row=>({purchaseOrderLineId:row.id,quantity:row.orderedQuantity}))
    });
    if (invoice.errors.length||!invoice.purchaseInvoice)
      throw new Error(invoice.errors.join("; ")||"Could not create supplier invoice");
    const posted=procurementStore.postPurchaseInvoice(invoice.purchaseInvoice.id);
    if (!posted.purchaseInvoice) throw new Error(posted.error||"Could not post supplier invoice");
    if (paid>0) {
      const payment=procurementStore.payPurchaseInvoice({
        purchaseInvoiceId:posted.purchaseInvoice.id,amount:paid,paymentMethod:input.paymentMethod!,
        date:input.invoiceDate,reference:number
      });
      if (!payment.purchaseInvoice) throw new Error(payment.error||"Supplier payment failed");
      return {invoice:payment.purchaseInvoice,purchaseOrderNumber:poNumber};
    }
    return {invoice:posted.purchaseInvoice,purchaseOrderNumber:poNumber};
  } catch(error) {
    // Never automatically retry: a GRN may already have posted before a later
    // step failed. Keep the PO reference so an operator can reconcile safely.
    return {invoice:null,purchaseOrderNumber:poNumber,
      error:(error instanceof Error?error.message:String(error))+
        (poNumber?` (PO ${poNumber} may already contain received stock; reconcile in Procurement before retrying)`:"")};
  }
}
