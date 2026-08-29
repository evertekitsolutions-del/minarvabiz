"use client";

import * as React from "react";
import { PosBilling, SalesList, Button } from "@minarvabiz/ui";
import { store, printSaleInvoice } from "@minarvabiz/business-logic";
import type { Product, Customer, Sale, CartLine, PaymentMethod } from "@minarvabiz/types";

export default function SalesPage() {
  const [tab, setTab] = React.useState<"pos" | "history">("pos");
  const [products, setProducts] = React.useState<Product[]>([]);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [sales, setSales] = React.useState<Sale[]>([]);

  const refresh = React.useCallback(() => {
    setProducts(store.listProducts());
    setCustomers(store.listCustomers());
    setSales(store.listSales());
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  function handleComplete(payload: {
    customerId: string | null;
    lines: CartLine[];
    paidAmount: number;
    paymentMethod: PaymentMethod;
    notes?: string;
  }) {
    const result = store.createSale({
      customerId: payload.customerId,
      lines: payload.lines,
      paidAmount: payload.paidAmount,
      paymentMethod: payload.paymentMethod,
      notes: payload.notes,
    });
    if (result.errors.length) {
      return { success: false, errors: result.errors };
    }
    refresh();
    try {
      printSaleInvoice(result.sale, "a4");
    } catch {
      /* print blocked */
    }
    return { success: true, invoiceNumber: result.sale.invoiceNumber };
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Sales & Billing</h2>
        <div className="flex gap-2">
          <Button variant={tab === "pos" ? "primary" : "outline"} onClick={() => setTab("pos")}>
            New Sale
          </Button>
          <Button variant={tab === "history" ? "primary" : "outline"} onClick={() => setTab("history")}>
            History
          </Button>
        </div>
      </div>
      {tab === "pos" && (
        <PosBilling
          products={products}
          customers={customers}
          onCompleteSale={handleComplete}
          onFindByBarcode={(code) => store.getProductByBarcode(code)}
        />
      )}
      {tab === "history" && <SalesList sales={sales} />}
    </div>
  );
}
