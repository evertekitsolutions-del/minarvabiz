"use client";

import * as React from "react";
import { Button, Card, CardContent, FormField, inputClass } from "@minarvabiz/ui";
import {
  openCashRegister,
  closeCashRegister,
  refreshCashSession,
  getOpenSession,
  listCashSessions,
  buildCashCloseHtml,
} from "@minarvabiz/business-logic";

export default function CashRegisterPage() {
  const [opening, setOpening] = React.useState(0);
  const [actual, setActual] = React.useState(0);
  const [session, setSession] = React.useState(() => getOpenSession());
  const [history, setHistory] = React.useState(() => listCashSessions());
  const [error, setError] = React.useState<string | null>(null);

  const refresh = () => {
    setSession(getOpenSession());
    setHistory(listCashSessions());
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Cash register</h2>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {!session && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <FormField label="Opening cash">
              <input className={inputClass} type="number" value={opening} onChange={(e) => setOpening(Number(e.target.value))} />
            </FormField>
            <Button
              onClick={() => {
                const r = openCashRegister(opening);
                setError(r.error || null);
                refresh();
              }}
            >
              Open day
            </Button>
          </CardContent>
        </Card>
      )}
      {session && (
        <Card>
          <CardContent className="space-y-3 p-4 text-sm">
            <div className="font-medium">Open · {session.businessDate}</div>
            <Button size="sm" variant="outline" onClick={() => { refreshCashSession(); refresh(); }}>
              Refresh totals
            </Button>
            <div className="grid gap-1 sm:grid-cols-2">
              <div>Opening: {session.openingCash}</div>
              <div>Cash received: {session.cashReceived}</div>
              <div>Cash expenses: {session.cashExpenses}</div>
              <div>Expected close: {session.expectedClosing}</div>
            </div>
            <FormField label="Actual closing cash">
              <input className={inputClass} type="number" value={actual} onChange={(e) => setActual(Number(e.target.value))} />
            </FormField>
            <Button
              onClick={() => {
                const r = closeCashRegister(actual);
                setError(r.error || null);
                if (r.session && typeof window !== "undefined") {
                  const w = window.open("", "_blank");
                  if (w) {
                    w.document.write(buildCashCloseHtml(r.session));
                    w.document.close();
                  }
                }
                refresh();
              }}
            >
              Close register
            </Button>
          </CardContent>
        </Card>
      )}
      <div className="space-y-2">
        <h3 className="font-medium">History</h3>
        {history.map((s) => (
          <Card key={s.id}>
            <CardContent className="p-3 text-sm">
              {s.businessDate} · {s.status} · expected {s.expectedClosing}
              {s.actualClosing != null ? ` · actual ${s.actualClosing} · diff ${s.difference}` : ""}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
