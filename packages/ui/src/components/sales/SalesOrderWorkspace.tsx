"use client";

/**
 * SAL-003 shared visual workspace (opt-in, presentation only).
 * Host owns all data, authenticated permissions, currency, numbering, DB writes
 * and sync. NEVER treat this component's enabled prop as server authority.
 */
import * as React from "react";
import type { SalesOrderIntent } from "@minarvabiz/business-logic";
import { Button } from "../Button";

export interface SalesOrderWorkspaceCustomer {
  readonly id: string;
  readonly name: string;
}
export interface SalesOrderWorkspaceProduct {
  readonly id: string;
  readonly name: string;
  readonly sku?: string | null;
  readonly unitPriceMinor: number;
}
export interface SalesOrderWorkspaceDraftLine {
  /** Preserves persisted line identity when amending an existing draft. */
  readonly id?: string;
  readonly productId: string;
  readonly quantityMilli: number;
  readonly unitPriceMinor: number;
  readonly discountMinor?: number;
  readonly taxMinor?: number;
}
export interface SalesOrderWorkspaceDraft {
  readonly customerId: string;
  readonly lines: readonly SalesOrderWorkspaceDraftLine[];
  readonly note: string | null;
  readonly dueDate: string | null;
}
export interface SalesOrderWorkspaceProps {
  /** Presentation gate only; authoritative permission belongs in trusted host. */
  readonly enabled?: boolean;
  readonly orders: readonly SalesOrderIntent[];
  readonly customers: readonly SalesOrderWorkspaceCustomer[];
  readonly products: readonly SalesOrderWorkspaceProduct[];
  readonly onCreateDraft?: (draft: SalesOrderWorkspaceDraft) => Promise<void> | void;
  /** Host must enforce draft status and persisted expectedVersion CAS. */
  readonly onAmendDraft?: (
    order: SalesOrderIntent, draft: SalesOrderWorkspaceDraft,
  ) => Promise<void> | void;
  /** Host must reauthorize all displayed rows before exporting. */
  readonly onExportOrders?: (orders: readonly SalesOrderIntent[]) => Promise<void> | void;
  readonly onTransition?: (
    order: SalesOrderIntent, action: "confirm" | "cancel",
  ) => Promise<void> | void;
}

const date = (value: string) => value.slice(0, 10);
function money(currency: string, minor: number): string {
  if (!Number.isSafeInteger(minor)) return "Invalid amount";
  // Display is not the authoritative settlement rounding path.
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency,
      minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}
function quantityText(milli: number): string {
  return (milli / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export function SalesOrderWorkspace({
  enabled = false, orders, customers, products, onCreateDraft,
  onAmendDraft, onExportOrders, onTransition,
}: SalesOrderWorkspaceProps) {
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [customerId, setCustomerId] = React.useState("");
  const [productId, setProductId] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");
  const [draftLines, setDraftLines] = React.useState<SalesOrderWorkspaceDraftLine[]>([]);
  const [note, setNote] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [editingOrderId, setEditingOrderId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const active = enabled === true;
  const canCreate = active && typeof onCreateDraft === "function";
  const editingOrder = editingOrderId
    ? orders.find((order) => order.id === editingOrderId && order.status === "draft")
    : null;
  const canEdit = active && typeof onAmendDraft === "function";
  const canSubmit = editingOrderId ? Boolean(editingOrder && canEdit) : canCreate;
  const visibleOrders = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (status && order.status !== status) return false;
      if (!query) return true;
      const customer = customers.find((row) => row.id === order.customerId);
      return [order.orderNumber, customer?.name ?? "", order.status,
        ...order.lines.map((line) => line.description)].some((part) =>
        part.toLowerCase().includes(query));
    });
  }, [orders, customers, search, status]);

  function resetEditor() {
    setEditingOrderId(null);
    setCustomerId("");
    setProductId("");
    setQuantity("1");
    setNote("");
    setDueDate("");
    setDraftLines([]);
  }
  function startEdit(order: SalesOrderIntent) {
    if (!canEdit || busy || order.status !== "draft") return;
    setEditingOrderId(order.id);
    setCustomerId(order.customerId);
    setProductId("");
    setQuantity("1");
    setNote(order.note ?? "");
    setDueDate(order.dueDate ?? "");
    setDraftLines(order.lines.map((line) => ({
      id: line.id, productId: line.productId,
      quantityMilli: line.quantityMilli, unitPriceMinor: line.unitPriceMinor,
      discountMinor: line.discountMinor, taxMinor: line.taxMinor,
    })));
    setNotice(null);
  }
  function addLine() {
    if (!canSubmit || busy) return;
    const product = products.find((row) => row.id === productId);
    const qty = Number(quantity);
    const quantityMilli = qty * 1000;
    if (!product || !Number.isSafeInteger(quantityMilli) ||
      quantityMilli <= 0 || !Number.isSafeInteger(product.unitPriceMinor) ||
      product.unitPriceMinor < 0) {
      setNotice("Select a product with a valid price and positive quantity (up to 3 decimals).");
      return;
    }
    if (draftLines.length >= 100) {
      setNotice("A sales order cannot contain more than 100 lines.");
      return;
    }
    // The authorized host recalculates exact order totals and validates
    // identity/provenance. UI rows are only a draft request.
    setDraftLines((lines) => [...lines, {
      productId: product.id, quantityMilli, unitPriceMinor: product.unitPriceMinor,
    }]);
    setQuantity("1"); setProductId(""); setNotice(null);
  }
  async function createDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || busy) return;
    if (!customerId || draftLines.length === 0) {
      setNotice("Select a customer and add at least one product to the order.");
      return;
    }
    if (draftLines.some((line) =>
      !Number.isSafeInteger(line.quantityMilli) || line.quantityMilli <= 0 ||
      !Number.isSafeInteger(line.unitPriceMinor) || line.unitPriceMinor < 0)) {
      setNotice("Each draft line must have a valid positive quantity and nonnegative price.");
      return;
    }
    setBusy(true); setNotice(null);
    try {
      const draft: SalesOrderWorkspaceDraft = {
        customerId, lines: draftLines.map((line) => ({ ...line })),
        note: note.trim() || null, dueDate: dueDate || null,
      };
      if (editingOrderId) {
        if (!editingOrder || !onAmendDraft) throw new Error("Draft changed; refresh before amending");
        await onAmendDraft(editingOrder, draft);
      } else {
        await onCreateDraft!(draft);
      }
      resetEditor();
      setNotice("Draft submitted. Refresh the order list to verify the persisted revision.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Sales-order creation was rejected");
    } finally {
      setBusy(false);
    }
  }
  async function transition(order: SalesOrderIntent, action: "confirm" | "cancel") {
    if (!active || busy || !onTransition ||
      (order.status !== "draft" && !(action === "cancel" && order.status === "confirmed"))) return;
    setBusy(true); setNotice(null);
    try {
      await onTransition(order, action);
      setNotice("Requested update. Refresh the order list to confirm the persisted status.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Sales-order update was rejected");
    } finally {
      setBusy(false);
    }
  }

  if (!active) return (
    <section aria-label="Sales orders" className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900">Sales orders</h2>
      <p role="status" className="mt-2 text-sm text-slate-600">
        Sales-order management is not enabled for this organization.
      </p>
    </section>
  );

  return (
    <section aria-label="Sales orders" className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Sales orders</h2>
          <p className="text-sm text-slate-500">Drafts are not invoices. Stock and payments are unchanged until authorized checkout.</p>
        </div>
        <div className="text-sm text-slate-500">{visibleOrders.length} orders</div>
      </header>
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <form aria-label={editingOrderId ? "Amend sales-order draft" : "Create sales-order draft"}
        onSubmit={(event) => void createDraft(event)}
        className="grid gap-3 md:grid-cols-6">
        <label className="block text-sm font-medium text-slate-700">
          Customer
          <select aria-label="Customer" required disabled={!canSubmit || busy || Boolean(editingOrderId)}
            value={customerId} onChange={(event) => setCustomerId(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 p-2">
            <option value="">Select customer</option>
            {customers.map((customer) =>
              <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Product
          <select aria-label="Product" disabled={!canSubmit || busy}
            value={productId} onChange={(event) => setProductId(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 p-2">
            <option value="">Select product</option>
            {products.map((product) =>
              <option key={product.id} value={product.id}>
                {product.name}{product.sku ? ` · ${product.sku}` : ""}
              </option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Quantity
          <input aria-label="Quantity" required type="number" min="0.001" step="0.001"
            disabled={!canSubmit || busy} value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 p-2"/>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Note
          <input aria-label="Note" maxLength={2000}
            disabled={!canSubmit || busy} value={note}
            onChange={(event) => setNote(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 p-2"/>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Due date
          <input aria-label="Sales-order due date" type="date"
            disabled={!canSubmit || busy} value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 p-2"/>
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <Button type="button" variant="outline" disabled={!canSubmit || busy || draftLines.length >= 100}
            onClick={addLine}>Add item</Button>
          <Button type="submit" disabled={!canSubmit || busy || draftLines.length === 0}>
            {editingOrderId ? "Save draft" : "Create draft"}
          </Button>
          {editingOrderId && <Button type="button" variant="ghost" disabled={busy}
            onClick={resetEditor}>Cancel editing</Button>}
        </div>
      </form>
      {draftLines.length > 0 && (
        <div aria-label="Staged sales-order lines" className="space-y-2 border-t border-slate-100 pt-3">
          <p className="text-sm font-medium text-slate-700">
            {draftLines.length} {editingOrderId ? "editable" : "staged"} line{draftLines.length === 1 ? "" : "s"}
          </p>
          {draftLines.map((line, index) => {
            const product = products.find((p) => p.id === line.productId);
            return (
              <div key={index} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{product?.name ?? line.productId}</span>
                <div className="flex items-center gap-2">
                  {editingOrderId && <input aria-label={`Quantity for ${product?.name ?? line.productId}`}
                    type="number" min="0.001" step="0.001"
                    className="w-24 rounded border border-slate-300 p-1"
                    disabled={busy} value={line.quantityMilli / 1000}
                    onChange={(event) => {
                      const qty = Number(event.target.value) * 1000;
                      setDraftLines((lines) => lines.map((item, i) =>
                        i === index ? {...item, quantityMilli: qty} : item));
                    }}/>}
                  {!editingOrderId && <span>× {quantityText(line.quantityMilli)}</span>}
                  <span className="tabular-nums">
                    {(line.quantityMilli * line.unitPriceMinor / 1000 / 100).toFixed(2)}
                  </span>
                  <Button type="button" size="sm" variant="ghost" disabled={busy}
                    onClick={() => setDraftLines((lines) => lines.filter((_, i) => i !== index))}>
                    Remove
                  </Button>
                </div>
              </div>
            );
          })}
          <p className="text-xs text-slate-500">
            Preview excludes tax and discounts; the verified domain writer calculates final totals.
          </p>
        </div>
      )}
      </div>
      {notice && <p role="status" className="rounded-md bg-slate-100 p-3 text-sm text-slate-700">{notice}</p>}
      <div className="flex flex-wrap gap-3">
        <input aria-label="Search sales orders" placeholder="Order, customer or item" value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="min-w-52 flex-1 rounded-md border border-slate-300 p-2 text-sm"/>
        <select aria-label="Filter status" value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="rounded-md border border-slate-300 p-2 text-sm">
          <option value="">All statuses</option>
          <option value="draft">Draft</option><option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option><option value="invoiced">Invoiced</option>
        </select>
        {onExportOrders && <Button type="button" variant="outline"
          disabled={busy || visibleOrders.length === 0}
          onClick={() => {
            if (busy || !active) return;
            setBusy(true); setNotice(null);
            void Promise.resolve().then(() => onExportOrders(visibleOrders)).then(() =>
              setNotice("Export submitted to the authorized host."))
              .catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Export rejected"))
              .finally(() => setBusy(false));
          }}>Export selected</Button>}
      </div>
      <div className="space-y-3">
        {visibleOrders.length === 0 && <p className="rounded-md border border-slate-200 p-5 text-sm text-slate-600">
          No matching sales orders.
        </p>}
        {visibleOrders.map((order) => (
          <article key={order.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="font-semibold text-slate-900">{order.orderNumber}</p>
                <p className="text-xs text-slate-500">{date(order.createdAt)} · {
                  customers.find((customer) => customer.id === order.customerId)?.name ?? order.customerId
                }</p></div>
              <div className="text-right"><p className="font-semibold tabular-nums text-slate-900">
                {money(order.currency, order.totalMinor)}</p>
                <p className="text-xs capitalize text-slate-600">{order.status} · v{order.version}</p>
              </div>
            </div>
            <ul className="mt-3 divide-y divide-slate-100">
              {order.lines.map((line) => <li key={line.id} className="flex justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 text-slate-700">{line.description} × {quantityText(line.quantityMilli)}</span>
                <span className="shrink-0 tabular-nums text-slate-900">{money(order.currency, line.totalMinor)}</span>
              </li>)}
            </ul>
            {(order.status === "draft" || order.status === "confirmed") && (
              <div className="mt-3 flex justify-end gap-2">
                {order.status === "draft" && onAmendDraft && <Button variant="outline" size="sm"
                  disabled={busy} onClick={() => startEdit(order)}>Edit draft</Button>}
                {order.status === "draft" && <Button variant="outline" size="sm"
                  disabled={!onTransition || busy} onClick={() => void transition(order, "confirm")}>Confirm</Button>}
                <Button variant="danger" size="sm" disabled={!onTransition || busy}
                  onClick={() => void transition(order, "cancel")}>Cancel</Button>
              </div>
            )}
            {order.status === "invoiced" && order.invoiceId && (
              <p className="mt-2 text-xs text-slate-500">Linked invoice: {order.invoiceId}</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
