"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PosBilling, NormalBilling, SalesList, Button, Modal, FormField, inputClass } from "@minarvabiz/ui";
import { store, requestSaleInvoicePrint, buildSaleInvoiceHtml, assertLimit, can, readAuthorizedInvoiceGrossProfit } from "@minarvabiz/business-logic";
import type { Product, Customer, Sale, CartLine, PaymentMethod } from "@minarvabiz/types";
import { customerSchema } from "@minarvabiz/validation";

export default function SalesPage() {
  const router = useRouter();
  const [tab, setTab] = React.useState<"pos" | "normal" | "history">("pos");
  const [products, setProducts] = React.useState<Product[]>([]);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [sales, setSales] = React.useState<Sale[]>([]);
  const [heldSales, setHeldSales] = React.useState(() => store.listHeldSales());
  const [customerOpen, setCustomerOpen] = React.useState(false);
  const printRequestId = React.useRef(0);
  const [printNotice, setPrintNotice] = React.useState<{
    saleId: string; invoice: string; state: "pending" | "ok" | "error"; message: string;
  } | null>(null);
  const [customerError, setCustomerError] = React.useState<string | null>(null);
  const [customerForm, setCustomerForm] = React.useState({ name: "", phone: "", email: "", address: "", notes: "" });

  const refresh = React.useCallback(() => {
    setProducts(store.listProducts());
    setCustomers(store.listCustomers());
    setSales(store.listSales());
    setHeldSales(store.listHeldSales());
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  function printExistingInvoice(saleId: string, paper: "a4" | "thermal") {
    const sale = store.getSale(saleId);
    const id = ++printRequestId.current;
    if (!sale) {
      setPrintNotice({
        saleId, invoice: "Unknown invoice", state: "error",
        message: "Saved invoice could not be found. Check Sales History before attempting any new sale.",
      });
      return;
    }
    setPrintNotice({
      saleId, invoice: sale.invoiceNumber, state: "pending",
      message: `Invoice ${sale.invoiceNumber} is saved. Requesting ${paper.toUpperCase()} print…`,
    });
    // This call starts the print synchronously in the click handler;
    // awaiting first would trigger browser popup blocking.
    void requestSaleInvoicePrint(sale, paper).then((result) => {
      if (id !== printRequestId.current) return;
      setPrintNotice({
        saleId, invoice: sale.invoiceNumber,
        state: result.ok ? "ok" : "error",
        message: result.ok
          ? (result.state === "native-accepted"
            ? `Invoice ${sale.invoiceNumber} saved. Printer accepted the request; check physical output.`
            : `Invoice ${sale.invoiceNumber} saved. Print window opened; complete the print dialog.`)
          : `Invoice ${sale.invoiceNumber} is saved, but printing failed: ${result.error}`,
      });
    }).catch((error: unknown) => {
      if (id !== printRequestId.current) return;
      setPrintNotice({
        saleId, invoice: sale.invoiceNumber, state: "error",
        message: `Invoice ${sale.invoiceNumber} is saved, but printing failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    });
  }

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
    printExistingInvoice(result.sale.id, "a4");
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
      setCustomerError(parsed.error.issues[0]?.message ?? "Invalid input");
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
      {printNotice && (
        <div
          role={printNotice.state === "error" ? "alert" : "status"}
          aria-live={printNotice.state === "error" ? "assertive" : "polite"}
          className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm ${
            printNotice.state === "error"
              ? "border-amber-300 bg-amber-50 text-amber-950"
              : "border-slate-200 bg-slate-50 text-slate-800"
          }`}
        >
          <p>{printNotice.message}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => printExistingInvoice(printNotice.saleId, "a4")}>Retry A4</Button>
            <Button size="sm" variant="outline" onClick={() => printExistingInvoice(printNotice.saleId, "thermal")}>Retry Thermal</Button>
            <Button size="sm" variant="outline" onClick={() => setTab("history")}>View saved invoice</Button>
          </div>
        </div>
      )}
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
          onPrintSale={printExistingInvoice}
        />
      )}
      {tab === "normal" && <NormalBilling products={products} customers={customers} onCompleteSale={handleComplete} onAddCustomer={openCustomerQuickAdd} onPrintSale={printExistingInvoice} />}
      {tab === "history" && <SalesList sales={sales} customers={customers} onShowProfit={can("accounting.view") ? (sale) => readAuthorizedInvoiceGrossProfit(sale.id) : undefined} buildPreviewHtml={(sale, paper) => buildSaleInvoiceHtml(sale, { paper, autoPrint: false })} onPrintA4={(sale) => printExistingInvoice(sale.id, "a4")} onPrintThermal={(sale) => printExistingInvoice(sale.id, "thermal")} onCreateReturn={(sale) => router.push(`/returns?saleId=${encodeURIComponent(sale.id)}`)} onCollectCustomerDue={(sale) => { if (sale.customerId) router.push(`/payments?customerId=${encodeURIComponent(sale.customerId)}`); }} />}

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
