"use client";

import * as React from "react";
import type { Customer, Payment, PaymentMethod, Supplier } from "@minarvabiz/types";
import { Button } from "../Button";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { DataTable, type Column } from "../data/DataTable";
import { FormField, inputClass, selectClass } from "../forms/FormField";
import { Modal } from "../forms/Modal";
import { formatMoney } from "../customers/format";
import { exportPaymentHistoryCsv } from "@minarvabiz/business-logic";
import { findCollectionCustomer, parseCollectionAmount } from "./collection-prefill";

function dateKey(value: string) {
  return String(value || "").slice(0, 10);
}

function sourceLabel(type: Payment["referenceType"]): string {
  if (type === "sale") return "Sale payment";
  if (type === "order") return "Service order";
  if (type === "laundry") return "Laundry";
  if (type === "expense") return "Expense";
  if (type === "supplier") return "Supplier payment";
  if (type === "refund") return "Refund";
  return "Customer collection";
}

function paymentDirection(payment: Payment): "inflow" | "outflow" {
  return ["supplier", "refund", "expense"].includes(payment.referenceType) ? "outflow" : "inflow";
}

export function PaymentsPanel({
  outstanding,
  payments,
  customers = [],
  suppliers = [],
  onCollect,
  onRemind,
  requestedCustomerId,
  hasPendingCollection = false,
  onRetryPendingCollection,
}: {
  outstanding: Customer[];
  payments: Payment[];
  customers?: Customer[];
  suppliers?: Supplier[];
  onCollect: (data: {
    customerId: string;
    amount: number;
    method: PaymentMethod;
    notes?: string;
  }) => { ok: boolean; error?: string } | Promise<{ ok: boolean; error?: string }>;
  hasPendingCollection?: boolean;
  onRetryPendingCollection?: () => Promise<{ ok: boolean; error?: string }>;
  onRemind?: (customer: Customer) => void;
  requestedCustomerId?: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [customerId, setCustomerId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<PaymentMethod>("cash");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [savingCollection, setSavingCollection] = React.useState(false);
  const collecting = React.useRef(false);

  const retryPending = async () => {
    if (collecting.current || !onRetryPendingCollection) return;
    collecting.current = true;
    setSavingCollection(true);
    try {
      const result = await onRetryPendingCollection();
      if (!result.ok) {
        setError(result.error || "The existing payment could not be saved.");
        return;
      }
      setError(null);
      setOpen(false);
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the existing payment.");
    } finally {
      collecting.current = false;
      setSavingCollection(false);
    }
  };

  const recordCollection = async () => {
    if (collecting.current || hasPendingCollection) {
      setError("Save the pending payment before collecting again.");
      return;
    }
    collecting.current = true;
    setSavingCollection(true);
    try {
      const liveCustomer = findCollectionCustomer(outstanding, customerId);
      if (!liveCustomer) throw new Error("Select a customer with an outstanding balance.");
      const validatedAmount = parseCollectionAmount(amount, liveCustomer.outstandingBalance);
      const result = await onCollect({
        customerId: liveCustomer.id,
        amount: validatedAmount,
        method,
        notes: notes || undefined,
      });
      if (!result.ok) {
        setError(result.error || "Unable to record payment.");
        return;
      }
      setOpen(false);
      setError(null);
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to record payment.");
    } finally {
      collecting.current = false;
      setSavingCollection(false);
    }
  };
  const [collectionLinkNotice, setCollectionLinkNotice] = React.useState<string | null>(null);
  const processedCustomerLink = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!requestedCustomerId || processedCustomerLink.current === requestedCustomerId) return;
    processedCustomerLink.current = requestedCustomerId;
    const customer = findCollectionCustomer(outstanding, requestedCustomerId);
    if (!customer) {
      setCollectionLinkNotice("Selected customer has no outstanding balance or is unavailable. No payment has been recorded.");
      return;
    }
    setCustomerId(customer.id);
    setAmount(String(customer.outstandingBalance));
    setNotes("");
    setError(null);
    setCollectionLinkNotice(null);
    setOpen(true);
  }, [outstanding, requestedCustomerId]);

  const [historyQuery, setHistoryQuery] = React.useState("");
  const [historySource, setHistorySource] = React.useState("");
  const [historyMethod, setHistoryMethod] = React.useState("");
  const [historyDirection, setHistoryDirection] = React.useState("");
  const [historyCounterparty, setHistoryCounterparty] = React.useState("");
  const [historyDateFrom, setHistoryDateFrom] = React.useState("");
  const [historyDateTo, setHistoryDateTo] = React.useState("");
  const [detailPayment, setDetailPayment] = React.useState<Payment | null>(null);
  const [csvFeedback, setCsvFeedback] = React.useState<{ failed: boolean; message: string } | null>(null);

  const selected = outstanding.find((c) => c.id === customerId);

  const customerMap = React.useMemo(() => new Map(customers.map((customer) => [customer.id, customer.name])), [customers]);
  const supplierMap = React.useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier.name])), [suppliers]);

  const counterpartyName = React.useCallback((payment: Payment): string => {
    if (payment.referenceType === "supplier") return supplierMap.get(payment.referenceId) || "Supplier";
    if (payment.customerId) return customerMap.get(payment.customerId) || payment.customerId.slice(0, 8);
    if (payment.referenceType === "refund") return "Walk-in / refund";
    return "Walk-in / system";
  }, [customerMap, supplierMap]);

  const counterpartyOptions = React.useMemo(() => {
    const options = new Map<string, string>();
    for (const payment of payments) {
      if (payment.referenceType === "supplier") {
        options.set(`supplier:${payment.referenceId}`, supplierMap.get(payment.referenceId) || "Supplier");
      } else if (payment.customerId) {
        options.set(`customer:${payment.customerId}`, customerMap.get(payment.customerId) || payment.customerId.slice(0, 8));
      } else {
        options.set("walkin", "Walk-in / system");
      }
    }
    return [...options.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [payments, customerMap, supplierMap]);

  const filteredPayments = React.useMemo(() => {
    const query = historyQuery.trim().toLowerCase();
    return payments.filter((payment) => {
      if (historySource && payment.referenceType !== historySource) return false;
      if (historyMethod && payment.method !== historyMethod) return false;
      if (historyDirection && paymentDirection(payment) !== historyDirection) return false;
      const counterpartyKey = payment.referenceType === "supplier"
        ? `supplier:${payment.referenceId}`
        : payment.customerId ? `customer:${payment.customerId}` : "walkin";
      if (historyCounterparty && counterpartyKey !== historyCounterparty) return false;
      const key = dateKey(payment.paidAt);
      if (historyDateFrom && key < historyDateFrom) return false;
      if (historyDateTo && key > historyDateTo) return false;
      if (!query) return true;
      return [
        counterpartyName(payment),
        sourceLabel(payment.referenceType),
        payment.referenceId,
        payment.notes || "",
        payment.method,
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [payments, historyQuery, historySource, historyMethod, historyDirection, historyCounterparty, historyDateFrom, historyDateTo, counterpartyName]);

  function downloadFilteredPaymentHistoryCsv() {
    if (!filteredPayments.length) return;
    try {
      const csv = exportPaymentHistoryCsv(filteredPayments.map((payment) => ({
        id: payment.id,
        paidAt: payment.paidAt,
        amount: payment.amount,
        method: payment.method,
        referenceType: payment.referenceType,
        referenceId: payment.referenceId,
        notes: payment.notes,
        counterparty: counterpartyName(payment),
        direction: paymentDirection(payment),
      })));
      const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff), csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "minarvabiz-payment-history-" + new Date().toISOString().slice(0, 10) + ".csv";
      document.body.appendChild(link);
      try {
        link.click();
        setCsvFeedback({ failed: false, message: "Export requested for " + filteredPayments.length + " selected payment record(s)." });
      } finally {
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      setCsvFeedback({
        failed: true,
        message: error instanceof Error ? error.message : "Payment history CSV export failed.",
      });
    }
  }

  const clearHistoryFilters = () => {
    setHistoryQuery("");
    setHistorySource("");
    setHistoryMethod("");
    setHistoryDirection("");
    setHistoryCounterparty("");
    setHistoryDateFrom("");
    setHistoryDateTo("");
  };

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
      render: (r) => <span className="font-semibold text-rose-600">{formatMoney(r.outstandingBalance)}</span>,
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
          {onRemind && <Button size="sm" variant="outline" onClick={() => onRemind(r)}>Remind</Button>}
        </div>
      ),
    },
  ];

  const payCols: Column<Payment>[] = [
    { key: "paidAt", header: "Date", render: (r) => new Date(r.paidAt).toLocaleString("en-IN") },
    { key: "counterparty", header: "Counterparty", render: (r) => counterpartyName(r) },
    {
      key: "amount",
      header: "Amount",
      render: (r) => (
        <span className={paymentDirection(r) === "outflow" ? "font-semibold text-rose-600" : "font-semibold text-emerald-700"}>
          {paymentDirection(r) === "outflow" ? "−" : "+"}{formatMoney(r.amount)}
        </span>
      ),
    },
    { key: "method", header: "Method", render: (r) => r.method },
    { key: "referenceType", header: "Source", render: (r) => sourceLabel(r.referenceType) },
    { key: "notes", header: "Reference / allocation", render: (r) => r.notes || "—" },
    { key: "action", header: "Action", render: (r) => <Button size="sm" variant="outline" onClick={() => setDetailPayment(r)}>Details</Button> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Payments</h2>
          <p className="text-sm text-slate-500">Customer collections, supplier payments, refunds and operational payment traceability</p>
        </div>
        <Button
          onClick={() => {
            setCustomerId(outstanding[0]?.id || "");
            setAmount(outstanding[0] ? String(outstanding[0].outstandingBalance) : "");
            setOpen(true);
          }}
          disabled={outstanding.length === 0 || savingCollection || hasPendingCollection}
        >
          + Collect payment
        </Button>
      </div>

      {hasPendingCollection && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        A customer payment was applied in memory but SQLite did not confirm its save. Do not close the app, collect another payment or restart until the original write succeeds.
        {onRetryPendingCollection && <Button type="button" variant="outline" disabled={savingCollection} onClick={() => void retryPending()}>
          {savingCollection ? "Saving…" : "Retry saving existing payment"}
        </Button>}
      </div>}
      {collectionLinkNotice && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{collectionLinkNotice}</p>}

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
          <CardTitle className="text-sm font-semibold">Payment history</CardTitle>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">{filteredPayments.length} of {payments.length} payment records</p>
            <Button size="sm" variant="outline" disabled={filteredPayments.length === 0} onClick={downloadFilteredPaymentHistoryCsv}>Export filtered CSV</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {csvFeedback && <p role={csvFeedback.failed ? "alert" : "status"} className={`text-sm ${csvFeedback.failed ? "text-rose-700" : "text-slate-600"}`}>{csvFeedback.message}</p>}
          <p className="text-xs text-slate-500">Includes all displayed inflow and outflow transactions. This extract is not a bank or tax reconciliation report.</p>
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-7">
            <label className="text-xs font-medium text-slate-600 lg:col-span-2">
              Search counterparty, reference, allocation or source
              <input className={inputClass + " mt-1"} value={historyQuery} onChange={(e) => setHistoryQuery(e.target.value)} placeholder="Search…" />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Counterparty
              <select className={selectClass + " mt-1"} value={historyCounterparty} onChange={(e) => setHistoryCounterparty(e.target.value)}>
                <option value="">All counterparties</option>
                {counterpartyOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">
              Source
              <select className={selectClass + " mt-1"} value={historySource} onChange={(e) => setHistorySource(e.target.value)}>
                <option value="">All sources</option>
                {["sale", "order", "laundry", "supplier", "refund", "expense", "other"].map((source) => <option key={source} value={source}>{sourceLabel(source as Payment["referenceType"])}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">
              Method
              <select className={selectClass + " mt-1"} value={historyMethod} onChange={(e) => setHistoryMethod(e.target.value)}>
                <option value="">All methods</option>
                {["cash", "card", "upi", "bank", "online", "other"].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">
              Direction
              <select className={selectClass + " mt-1"} value={historyDirection} onChange={(e) => setHistoryDirection(e.target.value)}>
                <option value="">Inflow + outflow</option>
                <option value="inflow">Inflow</option>
                <option value="outflow">Outflow</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2 lg:col-span-2">
              <label className="text-xs font-medium text-slate-600">
                From
                <input type="date" className={inputClass + " mt-1"} value={historyDateFrom} onChange={(e) => setHistoryDateFrom(e.target.value)} />
              </label>
              <label className="text-xs font-medium text-slate-600">
                To
                <input type="date" className={inputClass + " mt-1"} value={historyDateTo} onChange={(e) => setHistoryDateTo(e.target.value)} />
              </label>
            </div>
            <div className="flex items-end justify-end lg:col-span-5">
              <Button size="sm" variant="outline" onClick={clearHistoryFilters}>Clear filters</Button>
            </div>
          </div>

          <DataTable columns={payCols} rows={filteredPayments} emptyMessage="No payments match the selected filters" />
        </CardContent>
      </Card>

      <Modal
        open={Boolean(detailPayment)}
        title="Payment traceability"
        onClose={() => setDetailPayment(null)}
        footer={<Button variant="outline" onClick={() => setDetailPayment(null)}>Close</Button>}
        className="max-w-2xl"
      >
        {detailPayment && (
          <div className="space-y-4 text-sm">
            <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
              <div><div className="text-xs text-slate-500">Counterparty</div><div className="font-semibold text-slate-900">{counterpartyName(detailPayment)}</div></div>
              <div><div className="text-xs text-slate-500">Direction</div><div className="font-semibold text-slate-900">{paymentDirection(detailPayment)}</div></div>
              <div><div className="text-xs text-slate-500">Source</div><div className="font-semibold text-slate-900">{sourceLabel(detailPayment.referenceType)}</div></div>
              <div><div className="text-xs text-slate-500">Method</div><div className="font-semibold text-slate-900">{detailPayment.method}</div></div>
              <div><div className="text-xs text-slate-500">Amount</div><div className="font-semibold text-slate-900">{formatMoney(detailPayment.amount)}</div></div>
              <div><div className="text-xs text-slate-500">Paid at</div><div className="font-semibold text-slate-900">{new Date(detailPayment.paidAt).toLocaleString("en-IN")}</div></div>
              <div className="sm:col-span-2"><div className="text-xs text-slate-500">Reference ID</div><div className="break-all font-mono text-xs text-slate-700">{detailPayment.referenceId}</div></div>
              <div className="sm:col-span-2"><div className="text-xs text-slate-500">Payment ID</div><div className="break-all font-mono text-xs text-slate-700">{detailPayment.id}</div></div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Reference / allocation notes</div>
              <div className="mt-1 whitespace-pre-wrap rounded-lg border border-slate-100 bg-white p-3 text-slate-700">{detailPayment.notes || "No reference or allocation note recorded."}</div>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
              Traceability: this payment row is linked to <strong>{sourceLabel(detailPayment.referenceType)}</strong> via reference ID <strong>{detailPayment.referenceId}</strong>. Customer collection allocations remain recorded in the allocation/notes field.
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={open}
        title="Collect payment"
        onClose={() => { if (!savingCollection) setOpen(false); }}
        footer={
          <>
            <Button variant="outline" disabled={savingCollection} onClick={() => setOpen(false)}>Cancel</Button>
            {hasPendingCollection && onRetryPendingCollection && <Button variant="outline" disabled={savingCollection}
              onClick={() => void retryPending()}>Retry saving existing payment</Button>}
            <Button disabled={savingCollection || hasPendingCollection} onClick={() => void recordCollection()}>
              {savingCollection ? "Saving payment to disk…" : "Record payment"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Collections settle oldest unpaid sales first. Any remainder reduces other customer balances.</p>
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
              {outstanding.map((c) => <option key={c.id} value={c.id}>{c.name} — {formatMoney(c.outstandingBalance)}</option>)}
            </select>
          </FormField>
          {selected && <p className="text-xs text-slate-500">Outstanding: {formatMoney(selected.outstandingBalance)}</p>}
          <FormField label="Amount">
            <input type="number" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormField>
          <FormField label="Method">
            <select className={selectClass} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank</option><option value="online">Online</option><option value="other">Other</option>
            </select>
          </FormField>
          <FormField label="Notes">
            <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
          {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
