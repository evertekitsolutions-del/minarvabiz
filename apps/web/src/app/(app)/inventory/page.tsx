"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ProductList, Modal, Button, FormField, inputClass, selectClass } from "@minarvabiz/ui";
import { store } from "@minarvabiz/business-logic";
import type { Product, Category } from "@minarvabiz/types";

export default function InventoryPage() {
  const router = useRouter();
  const [products, setProducts] = React.useState<Product[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [lowStockOnly, setLowStockOnly] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [adjustOpen, setAdjustOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Product | null>(null);
  const [adjType, setAdjType] = React.useState<"stock_in" | "stock_out" | "adjustment" | "transfer">("stock_in");
  const [adjQty, setAdjQty] = React.useState("1");
  const [destinationProductId, setDestinationProductId] = React.useState("");
  const [movementError, setMovementError] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState("");
  const [transfers, setTransfers] = React.useState(() => store.listStockTransfers());
  const [transferMessage, setTransferMessage] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    setCategories(store.listCategories());
    setProducts(store.listProducts({ query, lowStockOnly }));
    setTransfers(store.listStockTransfers());
  }, [query, lowStockOnly]);

  React.useEffect(() => { refresh(); }, [refresh]);

  function applyAdjust() {
    if (!selected) return;
    const qty = parseFloat(adjQty) || 0;
    setMovementError(null);
    if (adjType === "transfer") {
      const result = store.requestStockTransfer({
        sourceProductId: selected.id,
        destinationProductId,
        quantity: qty,
        notes: notes || null,
      });
      if (result.errors.length) {
        setMovementError(result.errors.join("; "));
        return;
      }
      setTransferMessage(`Transfer request ${result.transfer?.referenceNumber || ""} is pending approval.`);
    } else {
      store.adjustStock(selected.id, adjType, qty, notes || null);
    }
    setAdjustOpen(false);
    setSelected(null);
    setDestinationProductId("");
    setNotes("");
    refresh();
  }

  return (
    <>
      <ProductList
        products={products}
        categories={categories}
        lowStockOnly={lowStockOnly}
        onToggleLowStock={() => setLowStockOnly((v) => !v)}
        onSearch={setQuery}
        onSelect={(p) => {
          setSelected(p);
          setAdjustOpen(true);
        }}
        onAdd={() => router.push("/products")}
      />
      <p className="mt-2 text-xs text-slate-500">Click a product to adjust stock. Use Products page to add new items.</p>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-slate-900">Stock transfer approvals</h3>
            <p className="text-xs text-slate-500">Transfers move stock only after an authorised approval.</p>
          </div>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
            {transfers.filter((item) => item.status === "pending").length} pending
          </span>
        </div>
        {transferMessage && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{transferMessage}</p>}
        <div className="mt-3 space-y-2">
          {transfers.length === 0 && <p className="py-4 text-sm text-slate-400">No stock transfer requests yet.</p>}
          {transfers.slice(0, 20).map((transfer) => {
            const source = store.getProduct(transfer.sourceProductId);
            const destination = store.getProduct(transfer.destinationProductId);
            return (
              <div key={transfer.id} className="flex flex-col gap-2 rounded-xl border border-slate-100 p-3 text-sm lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900">{transfer.referenceNumber}</div>
                  <div className="text-xs text-slate-500">
                    {source?.name || transfer.sourceProductId} → {destination?.name || transfer.destinationProductId} · Qty {transfer.quantity}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {transfer.sourceBranchId || "source branch"} → {transfer.destinationBranchId || "destination branch"}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${transfer.status === "pending" ? "bg-amber-50 text-amber-700" : transfer.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    {transfer.status}
                  </span>
                  {transfer.status === "pending" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => {
                          try {
                            const result = store.approveStockTransfer(transfer.id);
                            setTransferMessage(result.errors.length ? result.errors.join("; ") : `${transfer.referenceNumber} approved and stock moved.`);
                          } catch (error) {
                            setTransferMessage(error instanceof Error ? error.message : String(error));
                          }
                          refresh();
                        }}
                      >
                        Approve & Move
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          try {
                            const result = store.cancelStockTransfer(transfer.id);
                            setTransferMessage(result.errors.length ? result.errors.join("; ") : `${transfer.referenceNumber} cancelled.`);
                          } catch (error) {
                            setTransferMessage(error instanceof Error ? error.message : String(error));
                          }
                          refresh();
                        }}
                      >
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Modal
        open={adjustOpen}
        title={selected ? `Adjust stock — ${selected.name}` : "Adjust stock"}
        onClose={() => setAdjustOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            <Button onClick={applyAdjust}>Apply</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Current stock: <strong>{selected?.stockQuantity}</strong> {selected?.unit}
          </p>
          <FormField label="Type">
            <select className={selectClass} value={adjType} onChange={(e) => setAdjType(e.target.value as typeof adjType)}>
              <option value="stock_in">Stock in</option>
              <option value="stock_out">Stock out</option>
              <option value="adjustment">Adjustment (+/−)</option>
              <option value="transfer">Stock transfer</option>
            </select>
          </FormField>
          <FormField label="Quantity">
            <input className={inputClass} type="number" value={adjQty} onChange={(e) => setAdjQty(e.target.value)} />
          </FormField>
          {adjType === "transfer" && (
            <FormField label="Destination stock record">
              <select className={selectClass} value={destinationProductId} onChange={(e) => setDestinationProductId(e.target.value)}>
                <option value="">Select destination</option>
                {store.listProducts().filter((p) => p.id !== selected?.id).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.sku ? ` · ${p.sku}` : ""}{p.branchId ? ` · branch ${p.branchId}` : ""}</option>
                ))}
              </select>
            </FormField>
          )}
          <FormField label="Notes">
            <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
          {movementError && <p className="text-sm text-rose-600">{movementError}</p>}
        </div>
      </Modal>
    </>
  );
}
