"use client";

import * as React from "react";
import { ProductList, Modal, Button, FormField, inputClass, selectClass } from "@minarvabiz/ui";
import { store, generateProductBarcode, printBarcodeLabels, parseNonNegativeStockQuantity, parseProductCsv, importProductsFromCsv, exportProductsCsv, exportReorderCsv } from "@minarvabiz/business-logic";
import type { Product, Category } from "@minarvabiz/types";
import { productSchema } from "@minarvabiz/validation";
import { parseProductPrice } from "../../../lib/parse-product-price";

export default function ProductsPage() {
  const [products, setProducts] = React.useState<Product[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [query, setQuery] = React.useState("");
  const [categoryId, setCategoryId] = React.useState<string | null>(null);
  const [lowStockOnly, setLowStockOnly] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [stockProduct, setStockProduct] = React.useState<Product | null>(null);
  const [stockQty, setStockQty] = React.useState("");
  const [stockError, setStockError] = React.useState<string | null>(null);
  const [labelProduct, setLabelProduct] = React.useState<Product | null>(null);
  const [labelCopies, setLabelCopies] = React.useState("1");
  const [categoryOpen, setCategoryOpen] = React.useState(false);
  const [categoryName, setCategoryName] = React.useState("");
  const [categoryDescription, setCategoryDescription] = React.useState("");
  const [categoryError, setCategoryError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const productCsvInput = React.useRef<HTMLInputElement>(null);
  const [csvPreview, setCsvPreview] = React.useState<{
    name: string; content: string; rows: ReturnType<typeof parseProductCsv>["rows"]; errors: string[];
  } | null>(null);
  const [csvBusy, setCsvBusy] = React.useState(false);
  const [csvMessage, setCsvMessage] = React.useState<string | null>(null);

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
    try {
      const parsed = productSchema.safeParse({
        name: form.name,
        sku: form.sku || null,
        barcode: form.barcode || null,
        categoryId: form.categoryId || null,
        unit: form.unit,
        costPrice: parseProductPrice(form.costPrice, "Cost price"),
        sellingPrice: parseProductPrice(form.sellingPrice, "Selling price"),
        stockQuantity: parseNonNegativeStockQuantity(form.stockQuantity),
        minimumStock: parseNonNegativeStockQuantity(form.minimumStock),
        isActive: true,
      });
      if (!parsed.success) { setError(parsed.error.errors[0]?.message ?? "Invalid input"); return; }
      if (editingId) {
        const patch: Partial<Product> = { ...parsed.data };
        delete patch.stockQuantity;
        store.updateProduct(editingId, patch);
      } else {
        store.createProduct(parsed.data as Parameters<typeof store.createProduct>[0]);
      }
      setOpen(false); setError(null); resetForm(); refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function downloadCsv(content: string, filename: string) {
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function previewCsvFile(file: File | null) {
    if (!file) return;
    setCsvMessage(null);
    setCsvBusy(true);
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("CSV exceeds the 2 MB opening-data import limit");
      const content = await file.text();
      const result = parseProductCsv(content);
      setCsvPreview({ name: file.name, content, rows: result.rows, errors: result.errors });
    } catch (err) {
      setCsvPreview(null);
      setCsvMessage(err instanceof Error ? err.message : "Unable to read product CSV");
    } finally {
      setCsvBusy(false);
      if (productCsvInput.current) productCsvInput.current.value = "";
    }
  }

  function confirmCsvImport() {
    if (!csvPreview || csvPreview.errors.length || !csvPreview.rows.length || csvBusy) return;
    // The import function preflights the CSV again against the latest live
    // SKUs/barcodes and fails without posting partial opening inventory.
    setCsvBusy(true);
    try {
      const result = importProductsFromCsv(csvPreview.content);
      if (result.errors.length) {
        setCsvPreview({ ...csvPreview, errors: result.errors });
        setCsvMessage("Import refused; correct the CSV before retrying.");
      } else {
        setCsvMessage(result.created + " products imported. Opening-stock accounting posted.");
        setCsvPreview(null);
        refresh();
      }
    } finally {
      setCsvBusy(false);
    }
  }

  function adjustStock() {
    if (!stockProduct) return;
    try {
      store.adjustStockToQuantity(stockProduct.id, stockQty, stockProduct.stockQuantity, "Manual stock correction");
      setStockError(null);
      setStockProduct(null);
      refresh();
    } catch (err) {
      setStockError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => productCsvInput.current?.click()} disabled={csvBusy}>Preview import</Button>
        <Button variant="outline" onClick={() => downloadCsv(
          "name,sku,barcode,cost,price,stock,min,unit\\nExample Fabric,FAB-001,890123,12.50,20.00,1.25,0.5,m\\n",
          "minarvabiz-product-import-template.csv"
        )}>Download CSV template</Button>
        <Button variant="outline" onClick={() => downloadCsv(exportProductsCsv(), "minarvabiz-products.csv")}>Export products CSV</Button>
        <Button variant="outline" disabled={store.listProducts({ lowStockOnly: true }).length === 0} onClick={() => downloadCsv(exportReorderCsv(store.listProducts({ lowStockOnly: true })), "minarvabiz-reorder-report.csv")}>Export low-stock reorder CSV</Button>
        <input
          ref={productCsvInput}
          type="file"
          accept=".csv,text/csv"
          aria-label="Choose product CSV to preview"
          className="hidden"
          onChange={(event) => { void previewCsvFile(event.target.files?.[0] || null); }}
        />
      </div>
      {csvMessage && <p role="status" className="mb-3 text-sm text-slate-700">{csvMessage}</p>}
      <Modal
        open={!!csvPreview}
        title="Preview product CSV opening data"
        onClose={() => { if (!csvBusy) setCsvPreview(null); }}
        className="max-w-xl"
        footer={<>
          <Button variant="outline" onClick={() => setCsvPreview(null)} disabled={csvBusy}>Cancel</Button>
          <Button onClick={confirmCsvImport}
            disabled={!csvPreview || csvPreview.errors.length > 0 || csvPreview.rows.length === 0 || csvBusy}>
            Confirm import
          </Button>
        </>}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-700">{csvPreview?.name}: {csvPreview?.rows.length ?? 0} products in preview. Nothing has been imported yet.</p>
          <p className="text-xs text-slate-600">Confirm only after reviewing names, quantities, costs, and SKUs. All rows must validate before any opening-stock posting.</p>
          {!!csvPreview?.errors.length && <div role="alert" className="rounded-md border border-rose-200 p-3 text-sm text-rose-700">
            <strong>{csvPreview.errors.length} validation issue(s)</strong>
            <ul className="mt-2 list-disc pl-5">
              {csvPreview.errors.slice(0, 15).map((message, index) => <li key={index}>{message}</li>)}
            </ul>
          </div>}
          {!!csvPreview?.rows.length && <div className="max-h-56 overflow-auto rounded-md border">
            <table className="w-full text-left text-xs">
              <thead><tr><th className="px-2 py-1">Name / SKU</th><th className="px-2 py-1">Qty</th><th className="px-2 py-1">Cost</th></tr></thead>
              <tbody>{csvPreview.rows.slice(0, 10).map((row, index) =>
                <tr key={index} className="border-t">
                  <td className="px-2 py-1">{row.name}<span className="block text-slate-500">{row.sku || "No SKU"}</span></td>
                  <td className="px-2 py-1">{row.stock ?? 0} {row.unit}</td>
                  <td className="px-2 py-1">{row.cost ?? 0}</td>
                </tr>)}</tbody>
            </table>
            {csvPreview.rows.length > 10 && <p className="p-2 text-xs text-slate-500">Showing first 10 of {csvPreview.rows.length} products.</p>}
          </div>}
        </div>
      </Modal>

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
        onAdjustStock={(p) => { setStockProduct({ ...p }); setStockQty(String(p.stockQuantity)); setStockError(null); }}
        onArchive={(product, reason) => { const result = store.archiveProduct(product.id, reason); if (result.error) return { error: result.error }; refresh(); return { success: true }; }}
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
            <input className={inputClass} type="number" min="0" step="any" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
          </FormField>
          <FormField label="Selling price">
            <input className={inputClass} type="number" min="0" step="any" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} />
          </FormField>
          <FormField label={editingId ? "Stock qty (use Adjust Stock)" : "Opening stock"}>
            <input className={inputClass} type="number" min="0" step="0.001" value={form.stockQuantity} disabled={!!editingId} onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })} />
          </FormField>
          <FormField label="Min stock">
            <input className={inputClass} type="number" min="0" step="0.001" value={form.minimumStock} onChange={(e) => setForm({ ...form, minimumStock: e.target.value })} />
          </FormField>
          {error && <p className="sm:col-span-2 text-sm text-rose-600">{error}</p>}
        </div>
      </Modal>
      <Modal open={!!stockProduct} title="Update Stock Quantity" onClose={() => { setStockProduct(null); setStockError(null); }} footer={<><Button variant="outline" onClick={() => { setStockProduct(null); setStockError(null); }}>Cancel</Button><Button onClick={adjustStock}>Update Stock</Button></>}>
        <div className="space-y-3"><p className="text-sm text-slate-600">{stockProduct?.name} · Current stock: <strong>{stockProduct?.stockQuantity}</strong></p><FormField label="New stock quantity"><input className={inputClass} type="number" min="0" step="0.001" value={stockQty} onChange={(e) => { setStockQty(e.target.value); setStockError(null); }} /></FormField>{stockError && <p role="alert" className="text-sm text-rose-600">{stockError}</p>}</div>
      </Modal>
      <Modal open={!!labelProduct} title="Print Barcode Label" onClose={() => setLabelProduct(null)} footer={<><Button variant="outline" onClick={() => setLabelProduct(null)}>Cancel</Button><Button onClick={() => { if (!labelProduct?.barcode) { setError("Generate a barcode before printing."); return; } const category = categories.find((cat) => cat.id === labelProduct.categoryId); printBarcodeLabels(labelProduct, Math.max(1, parseInt(labelCopies, 10) || 1), category?.name || null); }}>Print Label</Button></>}>
        <div className="space-y-3"><p className="text-sm font-medium">{labelProduct?.name}</p><p className="text-xs text-slate-500">Barcode: {labelProduct?.barcode || "Not generated"}</p><FormField label="Copies"><input className={inputClass} type="number" min="1" max="100" value={labelCopies} onChange={(e) => setLabelCopies(e.target.value)} /></FormField></div>
      </Modal>
    </>
  );
}
