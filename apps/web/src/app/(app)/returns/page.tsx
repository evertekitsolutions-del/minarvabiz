"use client";

import * as React from "react";
import { ReturnsPanel } from "@minarvabiz/ui";
import { phase7Store } from "@minarvabiz/business-logic";
import type { SaleReturn, Sale } from "@minarvabiz/types";

export default function ReturnsPage() {
  const [returns, setReturns] = React.useState<SaleReturn[]>([]);
  const [sales, setSales] = React.useState<Sale[]>([]);

  const refresh = React.useCallback(() => {
    setReturns(phase7Store.listReturns());
    setSales(phase7Store.listSalesForReturn());
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  return (
    <ReturnsPanel
      returns={returns}
      sales={sales}
      onCreate={(payload) => {
        const result = phase7Store.createReturn(payload);
        if (result.errors.length) return { success: false, errors: result.errors };
        refresh();
        return { success: true };
      }}
    />
  );
}
