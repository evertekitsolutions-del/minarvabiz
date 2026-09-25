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
  const [adjType, setAdjType] = React.useState<"stock_in" | "stock_out" | "adjustment">("stock_in");
  const [adjQty, setAdjQty] = React.useState("1");
  const [movementError, setMovementError] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState("");

  const refresh = React.useCallback(() => {
    setCategories(store.listCategories());
    setProducts(store.listProducts({ query, lowStockOnly }));
  }, [query, lowStockOnly]);

  React.useEffect(() => { refresh(); }, [refresh]);

  function applyAdjust() {
    if (!selected) return;
    const qty = parseFloat(adjQty) || 0;
    setMovementError(null);
    store.adjustStock(selected.id, adjType, qty, notes || null);
    setAdjustOpen(false);
    setSelected(null);
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
      <div className="mt-3 flex flex-wrap items-center gap-3"><p className="text-xs text-slate-500">Click a product to adjust stock. Use Products page to add new items. Transfers use the controlled warehouse workflow.</p><Button variant="outline" onClick={() => router.push("/warehouse")}>Controlled Stock Transfer</Button></div>
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
            </select>
          </FormField>
          <FormField label="Quantity">
            <input className={inputClass} type="number" value={adjQty} onChange={(e) => setAdjQty(e.target.value)} />
          </FormField>
          <FormField label="Notes">
            <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
          {movementError && <p className="text-sm text-rose-600">{movementError}</p>}
        </div>
      </Modal>
    </>
  );
}
