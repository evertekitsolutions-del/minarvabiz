import { ProcurementPanel } from "@minarvabiz/ui";
import { procurementStore, warehouseStore } from "@minarvabiz/business-logic";
import type { Product, Supplier } from "@minarvabiz/types";

export function DesktopProcurementPanel({
  suppliers,
  products,
  onChanged,
}: {
  suppliers: Supplier[];
  products: Product[];
  onChanged: () => void | Promise<void>;
}) {
  const refresh = () => { void onChanged(); };
  return (
    <ProcurementPanel
      purchaseOrders={procurementStore.listPurchaseOrders()}
      goodsReceipts={procurementStore.listGoodsReceipts()}
      purchaseInvoices={procurementStore.listPurchaseInvoices()}
      payableAging={procurementStore.buildSupplierPayableAging()}
      suppliers={suppliers}
      products={products}
      warehouseLocations={warehouseStore.listWarehouseLocations()}
      onCreate={(payload) => {
        const result = procurementStore.createPurchaseOrder(payload);
        refresh();
        return { success: result.errors.length === 0 && Boolean(result.purchaseOrder), poNumber: result.purchaseOrder?.poNumber, errors: result.errors };
      }}
      onUpdate={(id, payload) => {
        const result = procurementStore.updatePurchaseOrder(id, payload);
        refresh();
        return { success: result.errors.length === 0 && Boolean(result.purchaseOrder), poNumber: result.purchaseOrder?.poNumber, errors: result.errors };
      }}
      onApprove={(id) => {
        const result = procurementStore.approvePurchaseOrder(id);
        refresh();
        return { success: Boolean(result.purchaseOrder), error: result.error };
      }}
      onCancel={(id, reason) => {
        const result = procurementStore.cancelPurchaseOrder(id, reason);
        refresh();
        return { success: Boolean(result.purchaseOrder), error: result.error };
      }}
      onReceive={(payload) => {
        const result = procurementStore.receivePurchaseOrder(payload);
        refresh();
        return { success: result.errors.length === 0 && Boolean(result.goodsReceipt), grnNumber: result.goodsReceipt?.grnNumber, status: result.purchaseOrder?.status, errors: result.errors };
      }}
      getInvoiceableLines={(purchaseOrderId, excludeInvoiceId) => procurementStore.getInvoiceablePurchaseOrderLines(purchaseOrderId, excludeInvoiceId)}
      onCreateInvoice={(payload) => {
        const result = procurementStore.createPurchaseInvoice(payload);
        refresh();
        return { success: result.errors.length === 0 && Boolean(result.purchaseInvoice), invoiceNumber: result.purchaseInvoice?.invoiceNumber, errors: result.errors };
      }}
      onUpdateInvoice={(id, payload) => {
        const result = procurementStore.updatePurchaseInvoice(id, payload);
        refresh();
        return { success: result.errors.length === 0 && Boolean(result.purchaseInvoice), invoiceNumber: result.purchaseInvoice?.invoiceNumber, errors: result.errors };
      }}
      onPostInvoice={(id) => {
        const result = procurementStore.postPurchaseInvoice(id);
        refresh();
        return { success: Boolean(result.purchaseInvoice), error: result.error };
      }}
      onPayInvoice={(payload) => {
        const result = procurementStore.payPurchaseInvoice(payload);
        refresh();
        return { success: Boolean(result.purchaseInvoice), error: result.error };
      }}
      onCancelInvoice={(id, reason) => {
        const result = procurementStore.cancelPurchaseInvoice(id, reason);
        refresh();
        return { success: Boolean(result.purchaseInvoice), error: result.error };
      }}
    />
  );
}
