import * as React from "react";
import { store } from "@minarvabiz/business-logic";
import { persistDomainToSqlite } from "./sqlite-bootstrap";
import { createDurableSaleCommit } from "./durable-sale-commit";

/** Keep the unpaid native-write receipt alive across desktop re-renders. */
export function useDurableSaleCommit() {
  const commit = React.useRef<ReturnType<typeof createDurableSaleCommit<Parameters<typeof store.createSale>[0]>> | null>(null);
  if (!commit.current) {
    commit.current = createDurableSaleCommit(
      (payload: Parameters<typeof store.createSale>[0]) => store.createSale(payload),
      persistDomainToSqlite,
    );
  }
  return commit.current;
}
