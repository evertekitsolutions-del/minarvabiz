"use client";

import * as React from "react";
import { ProductList, Modal, Button, FormField, inputClass, selectClass } from "@minarvabiz/ui";
import { store } from "@minarvabiz/business-logic";
import type { Product, Category } from "@minarvabiz/types";
import { productSchema } from "@minarvabiz/validation";

export default function ProductsPage() {
  const [products, setProducts] = React.useState<Product[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [query, setQuery] = React.useState("");
  const [categoryId, setCategoryId] = React.useState<string | null>(null);
  const [lowStockOnly, setLowStockOnly] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    name: "", sku: "", barcode: "", categoryId: "", unit: "pcs",
    costPrice: "0", sellingPrice: "0", stockQuantity: "0", minimumStock: "5",
  });

  const refresh = React.useCallback(() => {
    setCategories(store.listCategories());
    setProducts(store.listProducts({ query, categoryId: categoryId ?? undefined, lowStockOnly }));
  }, [query, categoryId, lowStockOnly]);

  React.useEffect(() => { refresh(); }, [refresh]);

  function handleCreate() {
    const parsed = productSchema.safeParse({
      name: form.name,
      sku: form.sku || null,
      barcode: form.barcode || null,
      categoryId: form.categoryId || null,
      unit: form.unit,
      costPrice: parseFloat(form.costPrice) || 0,
      sellingPrice: parseFloat(form.sellingPrice) || 0,
      stockQuantity: parseInt(form.stockQuantity, 10) || 0,
      minimumStock: parseInt(form.minimumStock, 10) || 0,
      isActive: true,
    });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? "Invalid input");
      return;
    }
    store.createProduct(parsed.data as Parameters<typeof store.createProduct>[0]);
    setOpen(false);
    setError(null);
    refresh();
  }

  return (
    <>
      <ProductList
        products={products}
        categories={categories}
        lowStockOnly={lowStockOnly}
        onToggleLowStock={() => setLowStockOnly((v) => !v)}
        onSearch={(q) => setQuery(q)}
        onFilterCategory={setCategoryId}
        onAdd={() => setOpen(true)}
      />
      <Modal
        open={open}
        title="Add Product"
        onClose={() => setOpen(false)}
        className="max-w-xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Save Product</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Name *" className="sm:col-span-2">
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <FormField label="SKU">
            <input className={inputClass} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </FormField>
          <FormField label="Barcode">
            <input className={inputClass} value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
          </FormField>
          <FormField label="Category">
            <select className={selectClass} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">Select</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FormField>
          <FormField label="Unit">
            <input className={inputClass} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          </FormField>
          <FormField label="Cost price">
            <input className={inputClass} type="number" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
          </FormField>
          <FormField label="Selling price">
            <input className={inputClass} type="number" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} />
          </FormField>
          <FormField label="Stock qty">
            <input className={inputClass} type="number" value={form.stockQuantity} onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })} />
          </FormField>
          <FormField label="Min stock">
            <input className={inputClass} type="number" value={form.minimumStock} onChange={(e) => setForm({ ...form, minimumStock: e.target.value })} />
          </FormField>
          {error && <p className="sm:col-span-2 text-sm text-rose-600">{error}</p>}
        </div>
      </Modal>
    </>
  );
}
