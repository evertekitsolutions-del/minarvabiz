"use client";

import * as React from "react";
import { PosBilling, NormalBilling, SalesList, Button, Modal, FormField, inputClass, PrintPreviewModal } from "@minarvabiz/ui";
import { store, buildSaleInvoiceHtml, printPreparedHtml, assertLimit } from "@minarvabiz/business-logic";
import type { Product, Customer, Sale, CartLine, PaymentMethod } from "@minarvabiz/types";
import { customerSchema } from "@minarvabiz/validation";

export default function SalesPage() {
  const [tab, setTab] = React.useState<"pos" | "normal" | "history">("pos");
  const [products, setProducts] = React.useState<Product[]>([]);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [sales, setSales] = React.useState<Sale[]>([]);
  const [heldSales, setHeldSales] = React.useState(() => store.listHeldSales());
  const [customerOpen, setCustomerOpen] = React.useState(false);
  const [customerError, setCustomerError] = React.useState<string | null>(null);
  const [customerForm, setCustomerForm] = React.useState({ name: "", phone: "", email: "", address: "", notes: "" });
  const [printPreview, setPrintPreview] = React.useState<{ title: string; html: string; paper: "a4" | "thermal" } | null>(null);

  function previewSale(sale: Sale, paper: "a4" | "thermal") {
    setPrintPreview({
      title: `${sale.invoiceNumber} — ${paper === "a4" ? "A4" : "Thermal"} Preview`,
      html: buildSaleInvoiceHtml(sale, { paper, autoPrint: false }),
      paper,
    });
  }

  const refresh = React.useCallback(() => {
    setProducts(store.listProducts());
    setCustomers(store.listCustomers());
    setSales(store.listSales());
    setHeldSales(store.listHeldSales());
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  function handleComplete(payload: {
    customerId: string | null;
    lines: CartLine[];
    paidAmount: number;
    paymentMethod: PaymentMethod;
    paymentSplits?: Array<{ method: PaymentMethod; amount: number; reference?: string | null }>;
    notes?: string;
  }) {
    const result = store.createSale({
      customerId: payload.customerId,
      lines: payload.lines,
      paidAmount: payload.paidAmount,
      paymentMethod: payload.paymentMethod,
      paymentSplits: payload.paymentSplits,
      notes: payload.notes,
    });
    if (result.errors.length) {
      return { success: false, errors: result.errors };
    }
    refresh();
    previewSale(result.sale, "a4");
    return { success: true, invoiceNumber: result.sale.invoiceNumber, saleId: result.sale.id };
  }

  function openCustomerQuickAdd() {
    setCustomerError(null);
    setCustomerOpen(true);
  }

  function saveCustomer() {
    const limit = assertLimit("customers");
    if (!limit.allowed) {
      setCustomerError(limit.reason ?? "Customer limit reached");
      return;
    }
    const parsed = customerSchema.safeParse({
      name: customerForm.name,
      phone: customerForm.phone || null,
      email: customerForm.email || null,
      address: customerForm.address || null,
      notes: customerForm.notes || null,
    });
    if (!parsed.success) {
      setCustomerError(parsed.error.errors[0]?.message ?? "Invalid input");
      return;
    }
    try {
      store.createCustomer(parsed.data);
      setCustomerOpen(false);
      setCustomerForm({ name: "", phone: "", email: "", address: "", notes: "" });
      setCustomerError(null);
      refresh();
    } catch (e) {
      setCustomerError(e instanceof Error ? e.message : "Unable to create customer");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Sales & Billing</h2>
        <div className="flex gap-2">
          <Button variant={tab === "pos" ? "primary" : "outline"} onClick={() => setTab("pos")}>POS Billing</Button>
          <Button variant={tab === "normal" ? "primary" : "outline"} onClick={() => setTab("normal")}>Normal Billing</Button>
          <Button variant={tab === "history" ? "primary" : "outline"} onClick={() => setTab("history")}>History</Button>
        </div>
      </div>
      {tab === "pos" && (
        <PosBilling
          products={products}
          customers={customers}
          onCompleteSale={handleComplete}
          onFindByBarcode={(code) => store.getProductByBarcode(code)}
          onAddCustomer={openCustomerQuickAdd}
          heldSales={heldSales}
          onHoldSale={(payload) => {
            const result = store.holdSale(payload);
            refresh();
            return {
              success: result.errors.length === 0 && Boolean(result.heldSale),
              holdNumber: result.heldSale?.holdNumber,
              errors: result.errors,
            };
          }}
          onRemoveHeldSale={(id) => {
            store.removeHeldSale(id);
            refresh();
          }}
          onPrintSale={(id, paper) => { const sale = store.getSale(id); if (sale) previewSale(sale, paper); }}
        />
      )}
      {tab === "normal" && <NormalBilling products={products} customers={customers} onCompleteSale={handleComplete} onAddCustomer={openCustomerQuickAdd} onPrintSale={(id, paper) => { const sale = store.getSale(id); if (sale) previewSale(sale, paper); }} />}
      {tab === "history" && <SalesList sales={sales} onPrintA4={(sale) => previewSale(sale, "a4")} onPrintThermal={(sale) => previewSale(sale, "thermal")} />}

      <PrintPreviewModal
        open={Boolean(printPreview)}
        title={printPreview?.title || "Invoice Preview"}
        html={printPreview?.html || ""}
        paper={printPreview?.paper || "a4"}
        onClose={() => setPrintPreview(null)}
        onPrint={() => { if (printPreview) printPreparedHtml(printPreview.html, printPreview.paper); }}
      />

      <Modal
        open={customerOpen}
        title="Add Customer"
        onClose={() => setCustomerOpen(false)}
        footer={<><Button variant="outline" onClick={() => setCustomerOpen(false)}>Cancel</Button><Button onClick={saveCustomer}>Save Customer</Button></>}
      >
        <div className="space-y-3">
          <FormField label="Name *"><input className={inputClass} autoFocus value={customerForm.name} onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })} /></FormField>
          <FormField label="Phone"><input className={inputClass} value={customerForm.phone} onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })} /></FormField>
          <FormField label="Email"><input className={inputClass} type="email" value={customerForm.email} onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })} /></FormField>
          <FormField label="Address"><input className={inputClass} value={customerForm.address} onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })} /></FormField>
          <FormField label="Notes"><textarea className={inputClass + " h-20 py-2"} value={customerForm.notes} onChange={(e) => setCustomerForm({ ...customerForm, notes: e.target.value })} /></FormField>
          {customerError && <p className="text-sm text-rose-600">{customerError}</p>}
        </div>
      </Modal>
    </div>
  );
}
