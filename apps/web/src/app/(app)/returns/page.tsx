"use client";

import * as React from "react";
import { ReturnsPanel } from "@minarvabiz/ui";
import { phase7Store, store } from "@minarvabiz/business-logic";
import type { Product, SaleReturn, Sale } from "@minarvabiz/types";

export default function ReturnsPage() {
  const [returns, setReturns] = React.useState<SaleReturn[]>([]);
  const [sales, setSales] = React.useState<Sale[]>([]);
  const [products, setProducts] = React.useState<Product[]>([]);

  const refresh = React.useCallback(() => {
    setReturns(phase7Store.listReturns());
    setSales(phase7Store.listSalesForReturn());
    setProducts(store.listProducts());
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  return (
    <ReturnsPanel
      returns={returns}
      sales={sales}
      products={products}
      onCreate={(payload) => {
        const result = phase7Store.createReturn(payload);
        if (result.errors.length) return { success: false, errors: result.errors };
        refresh();
        return { success: true };
      }}
      onExchange={(payload) => {
        const result = phase7Store.createExchange(payload);
        if (result.errors.length || !result.replacementSale) return { success: false, errors: result.errors };
        refresh();
        return {
          success: true,
          replacementInvoiceNumber: result.replacementSale.invoiceNumber,
          storeCreditApplied: result.storeCreditApplied,
          extraRefund: result.extraRefund,
          amountDue: result.amountDue,
        };
      }}
    />
  );
}
