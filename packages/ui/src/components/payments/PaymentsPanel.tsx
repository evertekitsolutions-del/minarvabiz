"use client";

import * as React from "react";
import type { Customer, Payment, PaymentMethod } from "@minarvabiz/types";
import { Button } from "../Button";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { DataTable, type Column } from "../data/DataTable";
import { FormField, inputClass, selectClass } from "../forms/FormField";
import { Modal } from "../forms/Modal";
import { formatMoney } from "../customers/format";

export function PaymentsPanel({
  outstanding,
  payments,
  onCollect,
  onRemind,
}: {
  outstanding: Customer[];
  payments: Payment[];
  onCollect: (data: {
    customerId: string;
    amount: number;
    method: PaymentMethod;
    notes?: string;
  }) => { ok: boolean; error?: string };
  onRemind?: (customer: Customer) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [customerId, setCustomerId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<PaymentMethod>("cash");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const selected = outstanding.find((c) => c.id === customerId);

  const outCols: Column<Customer>[] = [
    {
      key: "name",
      header: "Customer",
      render: (r) => (
        <div>
          <div className="font-medium">{r.name}</div>
          <div className="text-xs text-slate-500">{r.phone || ""}</div>
        </div>
      ),
    },
    {
      key: "outstandingBalance",
      header: "Outstanding",
      render: (r) => (
        <span className="font-semibold text-rose-600">{formatMoney(r.outstandingBalance)}</span>
      ),
    },
    {
      key: "id",
      header: "",
      render: (r) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              setCustomerId(r.id);
              setAmount(String(r.outstandingBalance));
              setOpen(true);
            }}
          >
            Collect
          </Button>
          {onRemind && (
            <Button size="sm" variant="outline" onClick={() => onRemind(r)}>
              Remind
            </Button>
          )}
        </div>
      ),
    },
  ];

  const payCols: Column<Payment>[] = [
    {
      key: "paidAt",
      header: "Date",
      render: (r) => new Date(r.paidAt).toLocaleString("en-IN"),
    },
    {
      key: "customerId",
      header: "Customer",
      render: (r) => {
        const c = outstanding.find((x) => x.id === r.customerId);
        return c?.name || r.customerId?.slice(0, 8) || "—";
      },
    },
    {
      key: "amount",
      header: "Amount",
      render: (r) => formatMoney(r.amount),
    },
    { key: "method", header: "Method", render: (r) => r.method },
    { key: "referenceType", header: "Ref", render: (r) => r.referenceType },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Payments</h2>
          <p className="text-sm text-slate-500">Collect outstanding customer balances</p>
        </div>
        <Button
          onClick={() => {
            setCustomerId(outstanding[0]?.id || "");
            setAmount(outstanding[0] ? String(outstanding[0].outstandingBalance) : "");
            setOpen(true);
          }}
          disabled={outstanding.length === 0}
        >
          + Collect payment
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Outstanding customers</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={outCols} rows={outstanding} emptyMessage="No outstanding balances" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Recent payments</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={payCols} rows={payments.slice(0, 50)} emptyMessage="No payments yet" />
        </CardContent>
      </Card>

      <Modal
        open={open}
        title="Collect payment"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const result = onCollect({
                  customerId,
                  amount: parseFloat(amount) || 0,
                  method,
                  notes: notes || undefined,
                });
                if (!result.ok) {
                  setError(result.error || "Failed");
                  return;
                }
                setOpen(false);
                setError(null);
                setNotes("");
              }}
            >
              Record payment
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Customer">
            <select
              className={selectClass}
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                const c = outstanding.find((x) => x.id === e.target.value);
                if (c) setAmount(String(c.outstandingBalance));
              }}
            >
              <option value="">Select</option>
              {outstanding.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {formatMoney(c.outstandingBalance)}
                </option>
              ))}
            </select>
          </FormField>
          {selected && (
            <p className="text-xs text-slate-500">
              Outstanding: {formatMoney(selected.outstandingBalance)}
            </p>
          )}
          <FormField label="Amount">
            <input
              type="number"
              className={inputClass}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </FormField>
          <FormField label="Method">
            <select
              className={selectClass}
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            >
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="bank">Bank</option>
            </select>
          </FormField>
          <FormField label="Notes">
            <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
