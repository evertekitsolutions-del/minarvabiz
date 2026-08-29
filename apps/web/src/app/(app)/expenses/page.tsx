"use client";

import * as React from "react";
import {
  ExpenseList, PurchaseList, Modal, Button, FormField, inputClass, selectClass,
} from "@minarvabiz/ui";
import { phase5Store, ordersStore } from "@minarvabiz/business-logic";
import type { Expense, Purchase, ExpenseCategory, ServiceOrder, PaymentMethod } from "@minarvabiz/types";

export default function ExpensesPage() {
  const [tab, setTab] = React.useState<"expenses" | "purchases">("expenses");
  const [expenses, setExpenses] = React.useState<Expense[]>([]);
  const [purchases, setPurchases] = React.useState<Purchase[]>([]);
  const [categories, setCategories] = React.useState<ExpenseCategory[]>([]);
  const [orders, setOrders] = React.useState<ServiceOrder[]>([]);
  const [expOpen, setExpOpen] = React.useState(false);
  const [purOpen, setPurOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [expForm, setExpForm] = React.useState({
    categoryId: "", amount: "", description: "", paymentMethod: "cash" as PaymentMethod,
    orderId: "",
  });
  const [purForm, setPurForm] = React.useState({
    description: "", amount: "", paidAmount: "", paymentMethod: "cash" as PaymentMethod,
    kind: "general" as "general" | "order_specific", orderId: "", supplierId: "",
  });

  const refresh = React.useCallback(() => {
    setExpenses(phase5Store.listExpenses());
    setPurchases(phase5Store.listPurchases());
    setCategories(phase5Store.listExpenseCategories());
    setOrders(ordersStore.listOrders());
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  function saveExpense() {
    const result = phase5Store.createExpense({
      categoryId: expForm.categoryId,
      amount: parseFloat(expForm.amount) || 0,
      paymentMethod: expForm.paymentMethod,
      description: expForm.description || null,
      orderId: expForm.orderId || null,
    });
    if (result.errors.length) {
      setError(result.errors.join("; "));
      return;
    }
    setExpOpen(false);
    setError(null);
    refresh();
  }

  function savePurchase() {
    const result = phase5Store.createPurchase({
      description: purForm.description,
      amount: parseFloat(purForm.amount) || 0,
      paidAmount: parseFloat(purForm.paidAmount) || 0,
      paymentMethod: purForm.paymentMethod,
      kind: purForm.kind,
      orderId: purForm.orderId || null,
      supplierId: purForm.supplierId || null,
    });
    if (result.errors.length) {
      setError(result.errors.join("; "));
      return;
    }
    setPurOpen(false);
    setError(null);
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant={tab === "expenses" ? "primary" : "outline"} onClick={() => setTab("expenses")}>Expenses</Button>
        <Button variant={tab === "purchases" ? "primary" : "outline"} onClick={() => setTab("purchases")}>Purchases</Button>
      </div>
      {tab === "expenses" && <ExpenseList expenses={expenses} onAdd={() => setExpOpen(true)} />}
      {tab === "purchases" && <PurchaseList purchases={purchases} onAdd={() => setPurOpen(true)} />}

      <Modal open={expOpen} title="Add Expense" onClose={() => setExpOpen(false)}
        footer={<><Button variant="outline" onClick={() => setExpOpen(false)}>Cancel</Button>
          <Button onClick={saveExpense}>Save</Button></>}>
        <div className="space-y-3">
          <FormField label="Category *">
            <select className={selectClass} value={expForm.categoryId}
              onChange={(e) => setExpForm({ ...expForm, categoryId: e.target.value })}>
              <option value="">Select</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FormField>
          <FormField label="Amount *">
            <input type="number" className={inputClass} value={expForm.amount}
              onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} />
          </FormField>
          <FormField label="Description">
            <input className={inputClass} value={expForm.description}
              onChange={(e) => setExpForm({ ...expForm, description: e.target.value })} />
          </FormField>
          <FormField label="Payment method">
            <select className={selectClass} value={expForm.paymentMethod}
              onChange={(e) => setExpForm({ ...expForm, paymentMethod: e.target.value as PaymentMethod })}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="upi">UPI</option>
              <option value="bank">Bank</option>
            </select>
          </FormField>
          <FormField label="Link to order (optional — becomes order-specific)">
            <select className={selectClass} value={expForm.orderId}
              onChange={(e) => setExpForm({ ...expForm, orderId: e.target.value })}>
              <option value="">General expense</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>{o.orderNumber} — {o.customerName}</option>
              ))}
            </select>
          </FormField>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      </Modal>

      <Modal open={purOpen} title="Add Purchase" onClose={() => setPurOpen(false)}
        footer={<><Button variant="outline" onClick={() => setPurOpen(false)}>Cancel</Button>
          <Button onClick={savePurchase}>Save</Button></>}>
        <div className="space-y-3">
          <FormField label="Description *">
            <input className={inputClass} value={purForm.description}
              onChange={(e) => setPurForm({ ...purForm, description: e.target.value })}
              placeholder="Thread, lining cloth, needles…" />
          </FormField>
          <FormField label="Amount *">
            <input type="number" className={inputClass} value={purForm.amount}
              onChange={(e) => setPurForm({ ...purForm, amount: e.target.value })} />
          </FormField>
          <FormField label="Paid amount">
            <input type="number" className={inputClass} value={purForm.paidAmount}
              onChange={(e) => setPurForm({ ...purForm, paidAmount: e.target.value })} />
          </FormField>
          <FormField label="Kind">
            <select className={selectClass} value={purForm.kind}
              onChange={(e) => setPurForm({ ...purForm, kind: e.target.value as "general" | "order_specific" })}>
              <option value="general">General (shop stock)</option>
              <option value="order_specific">Order-specific</option>
            </select>
          </FormField>
          {purForm.kind === "order_specific" && (
            <FormField label="Order *">
              <select className={selectClass} value={purForm.orderId}
                onChange={(e) => setPurForm({ ...purForm, orderId: e.target.value })}>
                <option value="">Select order</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>{o.orderNumber} — {o.customerName}</option>
                ))}
              </select>
            </FormField>
          )}
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
