"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ProductList, Modal, Button, FormField, inputClass, selectClass } from "@minarvabiz/ui";
import { store, generateProductBarcode, printBarcodeLabels } from "@minarvabiz/business-logic";
import type { Product, Category } from "@minarvabiz/types";
import { productSchema } from "@minarvabiz/validation";

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = React.useState<Product[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [query, setQuery] = React.useState("");
  const [categoryId, setCategoryId] = React.useState<string | null>(null);
  const [lowStockOnly, setLowStockOnly] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [stockProduct, setStockProduct] = React.useState<Product | null>(null);
  const [stockQty, setStockQty] = React.useState("");
  const [labelProduct, setLabelProduct] = React.useState<Product | null>(null);
  const [labelCopies, setLabelCopies] = React.useState("1");
  const [categoryOpen, setCategoryOpen] = React.useState(false);
  const [categoryName, setCategoryName] = React.useState("");
  const [categoryDescription, setCategoryDescription] = React.useState("");
  const [categoryError, setCategoryError] = React.useState<string | null>(null);
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

  function handleCreateCategory() {
    const name = categoryName.trim();
    if (!name) {
      setCategoryError("Category name is required");
      return;
    }
    try {
      const category = store.createCategory({ name, description: categoryDescription.trim() || null });
      setForm((prev) => ({ ...prev, categoryId: category.id }));
      setCategoryName("");
      setCategoryDescription("");
      setCategoryError(null);
      setCategoryOpen(false);
      refresh();
    } catch (err) {
      setCategoryError(err instanceof Error ? err.message : String(err));
    }
  }

  function resetForm() {
    setEditingId(null);
    setForm({ name: "", sku: "", barcode: "", categoryId: "", unit: "pcs", costPrice: "0", sellingPrice: "0", stockQuantity: "0", minimumStock: "5" });
  }

  function openEdit(product: Product) {
    setEditingId(product.id);
    setForm({ name: product.name, sku: product.sku || "", barcode: product.barcode || "", categoryId: product.categoryId || "", unit: product.unit, costPrice: String(product.costPrice), sellingPrice: String(product.sellingPrice), stockQuantity: String(product.stockQuantity), minimumStock: String(product.minimumStock) });
    setOpen(true);
  }

  function handleSave() {
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
    if (!parsed.success) { setError(parsed.error.errors[0]?.message ?? "Invalid input"); return; }
    if (editingId) store.updateProduct(editingId, parsed.data as Partial<Product>);
    else store.createProduct(parsed.data as Parameters<typeof store.createProduct>[0]);
    setOpen(false); setError(null); resetForm(); refresh();
  }

  function adjustStock() {
    if (!stockProduct) return;
    const next = Math.max(0, parseInt(stockQty, 10) || 0);
    const delta = next - stockProduct.stockQuantity;
    if (delta !== 0) store.adjustStock(stockProduct.id, "adjustment", delta, "Manual stock correction");
    setStockProduct(null); refresh();
  }

  return (
    <>
      <div className="mb-3 flex justify-end"><Button variant="outline" onClick={() => router.push("/warehouse")}>Warehouse / WMS</Button></div>
      <ProductList
        products={products}
        categories={categories}
        lowStockOnly={lowStockOnly}
        onToggleLowStock={() => setLowStockOnly((v) => !v)}
        onSearch={(q) => setQuery(q)}
        onFilterCategory={setCategoryId}
        onAddCategory={() => setCategoryOpen(true)}
        onAdd={() => { resetForm(); setOpen(true); }}
        onEdit={openEdit}
        onAdjustStock={(p) => { setStockProduct(p); setStockQty(String(p.stockQuantity)); }}
        onDelete={(p) => { if (window.confirm(`Delete ${p.name}? Existing invoices remain unchanged.`)) { store.deleteProduct(p.id); refresh(); } }}
        onPrintBarcode={(p) => { setLabelProduct(p); setLabelCopies("1"); }}
      />
      <Modal
        open={categoryOpen}
        title="Add Category"
        onClose={() => setCategoryOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setCategoryOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateCategory}>Save Category</Button>
          </>
        }
      >
        <div className="space-y-3">
          <FormField label="Category name *">
            <input className={inputClass} value={categoryName} onChange={(e) => setCategoryName(e.target.value)} />
          </FormField>
          <FormField label="Description">
            <input className={inputClass} value={categoryDescription} onChange={(e) => setCategoryDescription(e.target.value)} />
          </FormField>
          {categoryError && <p className="text-sm text-rose-600">{categoryError}</p>}
        </div>
      </Modal>
      <Modal
        open={open}
        title={editingId ? "Edit Product" : "Add Product"}
        onClose={() => { setOpen(false); resetForm(); }}
        className="max-w-xl"
        footer={
          <>
            <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSave}>{editingId ? "Update Product" : "Save Product"}</Button>
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
            <div className="flex gap-2"><input className={inputClass} value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /><Button type="button" variant="outline" onClick={() => setForm({ ...form, barcode: generateProductBarcode(store.listProducts().map((p) => p.barcode)) })}>Generate</Button></div>
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
      <Modal open={!!stockProduct} title="Update Stock Quantity" onClose={() => setStockProduct(null)} footer={<><Button variant="outline" onClick={() => setStockProduct(null)}>Cancel</Button><Button onClick={adjustStock}>Update Stock</Button></>}>
        <div className="space-y-3"><p className="text-sm text-slate-600">{stockProduct?.name} · Current stock: <strong>{stockProduct?.stockQuantity}</strong></p><FormField label="New stock quantity"><input className={inputClass} type="number" min="0" value={stockQty} onChange={(e) => setStockQty(e.target.value)} /></FormField></div>
      </Modal>
      <Modal open={!!labelProduct} title="Print Barcode Label" onClose={() => setLabelProduct(null)} footer={<><Button variant="outline" onClick={() => setLabelProduct(null)}>Cancel</Button><Button onClick={() => { if (!labelProduct?.barcode) { setError("Generate a barcode before printing."); return; } const category = categories.find((cat) => cat.id === labelProduct.categoryId); printBarcodeLabels(labelProduct, Math.max(1, parseInt(labelCopies, 10) || 1), category?.name || null); }}>Print Label</Button></>}>
        <div className="space-y-3"><p className="text-sm font-medium">{labelProduct?.name}</p><p className="text-xs text-slate-500">Barcode: {labelProduct?.barcode || "Not generated"}</p><FormField label="Copies"><input className={inputClass} type="number" min="1" max="100" value={labelCopies} onChange={(e) => setLabelCopies(e.target.value)} /></FormField></div>
      </Modal>
    </>
  );
}
