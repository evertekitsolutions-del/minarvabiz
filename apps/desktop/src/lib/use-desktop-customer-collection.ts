import * as React from "react";
import { store } from "@minarvabiz/business-logic";
import type { PaymentMethod } from "@minarvabiz/types";
import { createDurableCustomerCollection } from "./durable-customer-collection";

/** Keep in-flight customer payments alive when the Customers view unmounts. */
export function useDesktopCustomerCollection(persist: () => Promise<boolean>) {
  const persistRef = React.useRef(persist);
  persistRef.current = persist;
  const [collection] = React.useState(() => createDurableCustomerCollection(
    (input: { customerId: string; amount: number; method: PaymentMethod; notes?: string;
      target?: { sourceType: "service_order" | "laundry"; id: string } }) =>
      store.recordCustomerPayment(input),
    () => persistRef.current(),
  ));
  return collection;
}
