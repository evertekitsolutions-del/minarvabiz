"use client";

import * as React from "react";
import { Button, Card, CardContent } from "@minarvabiz/ui";
import {
  startStockTake,
  updateStockTakeCount,
  commitStockTake,
  listStockTakes,
  store,
} from "@minarvabiz/business-logic";
import type { StockTakeSession } from "@minarvabiz/business-logic";

export default function StockTakePage() {
  const [session, setSession] = React.useState<StockTakeSession | null>(null);
  const [history, setHistory] = React.useState(() => listStockTakes());
  const [msg, setMsg] = React.useState<string | null>(null);

  const products = store.listProducts();
  const nameOf = (id: string) => products.find((p) => p.id === id)?.name || id.slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Stock take</h2>
        <Button
          onClick={() => {
            const s = startStockTake();
            setSession(s);
            setHistory(listStockTakes());
          }}
        >
          Start count
        </Button>
      </div>
      {session && !session.closedAt && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-sm text-slate-500">Session {session.id.slice(0, 8)}…</p>
            {session.lines.slice(0, 40).map((line) => (
              <div key={line.productId} className="flex items-center gap-3 text-sm">
                <span className="w-40 truncate font-medium">{nameOf(line.productId)}</span>
                <span className="text-slate-500">Sys {line.systemQty}</span>
                <input
                  type="number"
                  className="h-8 w-24 rounded border border-slate-200 px-2"
                  value={line.countedQty}
                  onChange={(e) => {
                    const next = updateStockTakeCount(
                      session.id,
                      line.productId,
                      parseFloat(e.target.value) || 0
                    );
                    if (next) setSession({ ...next });
                  }}
                />
                <span className={line.variance !== 0 ? "text-rose-600" : "text-slate-400"}>
                  Δ {line.variance}
                </span>
              </div>
            ))}
            <Button
              onClick={() => {
                const r = commitStockTake(session.id);
                setMsg(r.error || "Committed");
                setSession(r.session);
                setHistory(listStockTakes());
              }}
            >
              Commit adjustments
            </Button>
          </CardContent>
        </Card>
      )}
      {msg && <p className="text-sm">{msg}</p>}
      <div className="text-sm text-slate-500">History: {history.length} sessions</div>
    </div>
  );
}
