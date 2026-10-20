"use client";

import * as React from "react";
import { Button, FormField, Modal, inputClass, selectClass } from "@minarvabiz/ui";
import {
  can, store, listCommerceKitRecipes, createCommerceKitRecipe,
  updateCommerceKitRecipe, deleteCommerceKitRecipe, previewCommerceKitRecipe,
  parseCommerceKitRecipeRows,
} from "@minarvabiz/business-logic";

type KitRecipe = ReturnType<typeof listCommerceKitRecipes>[number];
type KitPreview = ReturnType<typeof previewCommerceKitRecipe>;
type EditableRow = { key: number; productId: string; quantityPerKit: string };

const activeKitProducts = () => store.listProducts().filter((product) =>
  product.isActive && !product.deletedAt && product.branchId == null && !product.hasVariants
);

/**
 * Seller-local recipe editor. No stock, invoice or remote-order writes.
 * The underlying domain checks RBAC, SKU availability and revision tokens.
 */
export function KitRecipeManager() {
  const [open, setOpen] = React.useState(false);
  const [recipes, setRecipes] = React.useState<KitRecipe[]>([]);
  const [editing, setEditing] = React.useState<{ id: string; version: number } | null>(null);
  const [name, setName] = React.useState("");
  const [rows, setRows] = React.useState<EditableRow[]>([]);
  const nextRowKey = React.useRef(0);
  const [kitCount, setKitCount] = React.useState("1");
  const [preview, setPreview] = React.useState<KitPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function blankForm() {
    const first = activeKitProducts()[0];
    nextRowKey.current += 1;
    setRows(first ? [{ key: nextRowKey.current, productId: first.id, quantityPerKit: "1" }] : []);
    setEditing(null);
    setName("");
    setPreview(null);
    setError(null);
  }

  function show() {
    setRecipes(listCommerceKitRecipes());
    blankForm();
    setKitCount("1");
    setOpen(true);
  }

  function addComponent() {
    if (rows.length >= 100) return;
    const available = activeKitProducts();
    const used = new Set(rows.map((row) => row.productId));
    const product = available.find((p) => !used.has(p.id)) ?? available[0];
    if (!product) return;
    nextRowKey.current += 1;
    setRows((previous) => [...previous, {
      key: nextRowKey.current, productId: product.id, quantityPerKit: "1",
    }]);
    setPreview(null);
    setError(null);
  }

  function updateComponent(key: number, patch: Partial<EditableRow>) {
    setRows((previous) => previous.map((row) => row.key === key ? { ...row, ...patch } : row));
    setPreview(null);
    setError(null);
  }

  function saveRecipe() {
    try {
      const draft = {
        name: name.trim(),
        components: parseCommerceKitRecipeRows(rows.map(({ productId, quantityPerKit }) => ({
          productId, quantityPerKit,
        }))),
      };
      if (editing) {
        updateCommerceKitRecipe(editing.id, editing.version, draft);
      } else {
        createCommerceKitRecipe(draft);
      }
      setRecipes(listCommerceKitRecipes());
      blankForm();
    } catch (reason) {
      setPreview(null);
      setError(reason instanceof Error ? reason.message : "Unable to save kit recipe");
    }
  }

  function editRecipe(id: string, version: number) {
    const current = listCommerceKitRecipes().find((entry) => entry.id === id);
    if (!current || current.version !== version) {
      setRecipes(listCommerceKitRecipes());
      setError("Kit recipe changed; reopen it before editing");
      return;
    }
    setEditing({ id: current.id, version: current.version });
    setName(current.name);
    setRows(current.components.map((component) => {
      nextRowKey.current += 1;
      return {
        key: nextRowKey.current, productId: component.productId,
        quantityPerKit: String(component.quantityMilliPerKit / 1000),
      };
    }));
    setPreview(null);
    setError(null);
  }

  function removeRecipe(id: string, version: number) {
    if (!window.confirm("Delete this local kit recipe draft? No sales or stock will be affected.")) return;
    try {
      deleteCommerceKitRecipe(id, version);
      setRecipes(listCommerceKitRecipes());
      if (editing?.id === id) blankForm();
      setPreview(null);
      setError(null);
    } catch (reason) {
      setRecipes(listCommerceKitRecipes());
      setError(reason instanceof Error ? reason.message : "Unable to delete kit recipe");
    }
  }

  function previewRecipe(id: string) {
    try {
      if (!/^[1-9]\d*$/.test(kitCount.trim()) ||
          !Number.isSafeInteger(Number(kitCount.trim()))) {
        throw new Error("Kit count must be a positive whole number");
      }
      const result = previewCommerceKitRecipe(id, Number(kitCount.trim()));
      setPreview(result);
      setError(null);
    } catch (reason) {
      setPreview(null);
      setError(reason instanceof Error ? reason.message : "Unable to calculate kit preview");
    }
  }

  const availableProducts = open ? activeKitProducts() : [];

  return <>
    <Button variant="outline" onClick={show}>Manage kit recipe drafts</Button>
    <Modal open={open} title="Local kit recipes" onClose={() => setOpen(false)}
      className="max-w-2xl"
      footer={<>
        <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
        <Button onClick={saveRecipe} disabled={!can("products.manage") || !availableProducts.length}>
          {editing ? "Save recipe changes" : "Save kit recipe draft"}
        </Button>
      </>}>
      <div className="space-y-3">
        <p className="text-xs text-slate-600">
          Device-local drafts only. Saving a recipe does not create a saleable bundle,
          reserve stock, issue an invoice, publish prices or sync to cloud.
        </p>
        <FormField label="Kit recipe name *">
          <input className={inputClass} maxLength={120} value={name} onChange={(event) => {
            setName(event.target.value); setPreview(null); setError(null);
          }} placeholder="Example: 4-camera installation kit" />
        </FormField>
        <div className="space-y-2">
          <p className="text-sm font-medium">Products per kit</p>
          {rows.map((row, index) => <div key={row.key}
            className="grid grid-cols-1 gap-2 rounded-md border p-2 sm:grid-cols-[minmax(0,1fr)_110px_auto] sm:items-end">
            <FormField label={"Product " + (index + 1)}>
              <select className={selectClass} value={row.productId}
                onChange={(event) => updateComponent(row.key, { productId: event.target.value })}>
                {!availableProducts.some((product) => product.id === row.productId) &&
                  <option value={row.productId}>Unavailable product — replace before saving</option>}
                {availableProducts.map((product) =>
                  <option value={product.id} key={product.id}>{product.name}</option>)}
              </select>
            </FormField>
            <FormField label="Qty / kit">
              <input className={inputClass} type="text" inputMode="decimal"
                value={row.quantityPerKit} onChange={(event) =>
                  updateComponent(row.key, { quantityPerKit: event.target.value })} />
            </FormField>
            <Button variant="outline" onClick={() => {
              setRows((old) => old.filter((item) => item.key !== row.key));
              setPreview(null); setError(null);
            }} disabled={rows.length === 1}>Remove</Button>
          </div>)}
          <Button variant="outline" onClick={addComponent}
            disabled={!availableProducts.length || rows.length >= 100}>Add component</Button>
          {editing && <Button variant="outline" onClick={blankForm}>Cancel recipe edit</Button>}
        </div>

        <div className="rounded-md border p-3">
          <p className="mb-2 text-sm font-medium">Saved local kit recipes (drafts)</p>
          {recipes.length === 0 && <p className="text-xs text-slate-500">No recipes saved on this device.</p>}
          <FormField label="Kit count for preview">
            <input className={inputClass} type="text" inputMode="numeric" value={kitCount}
              onChange={(event) => { setKitCount(event.target.value); setPreview(null); setError(null); }} />
          </FormField>
          <ul className="mt-2 space-y-2">
            {recipes.map((recipe) => <li key={recipe.id} className="rounded-md border p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">{recipe.name} — {recipe.components.length} SKU(s), revision {recipe.version}</span>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => previewRecipe(recipe.id)}>Preview current price</Button>
                  {can("products.manage") && <>
                    <Button variant="outline" onClick={() => editRecipe(recipe.id, recipe.version)}>Edit recipe</Button>
                    <Button variant="outline" onClick={() => removeRecipe(recipe.id, recipe.version)}>Delete recipe</Button>
                  </>}
                </div>
              </div>
            </li>)}
          </ul>
        </div>
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        {preview && <div role="status" className="space-y-1 rounded-md border p-3 text-sm">
          <p className="font-semibold">Nonbinding kit price estimate</p>
          {preview.lines.map((line) => <p key={line.productId}>
            {line.productName}: {line.quantity} {line.unit} × {preview.currency} {line.unitPrice}
            {" = "}{preview.currency} {line.lineTotal}
          </p>)}
          <p className="font-medium">Total for {preview.kitCount} kit(s): {preview.currency} {preview.total}</p>
          {preview.kitTotal ? <p>Exact per-kit price: {preview.currency} {preview.kitTotal}</p>
            : <p className="text-xs text-slate-600">No exact cent-per-kit equivalent.</p>}
          <p className="text-xs text-slate-600">Stock availability is not checked. No invoice or reservation has been made.</p>
        </div>}
      </div>
    </Modal>
  </>;
}
