"use client";

import * as React from "react";
import {
  buildScopedCategoryTree, categoryDescendantIds, can, phase9Store, store,
} from "@minarvabiz/business-logic";
import type { Category } from "@minarvabiz/types";
import { Button } from "../Button";
import { FormField, inputClass, selectClass } from "../forms/FormField";

interface Props {
  onChanged?: () => void | Promise<void>;
  onCreated?: (id: string) => void;
}

/**
 * Branch-local category management. Existing globally shared root categories
 * remain readable; only HQ can edit them. All mutations are checked by domain
 * permission + exact parent/sibling integrity rules.
 */
export function CategoryManagementPanel({ onChanged, onCreated }: Props) {
  const [tick, setTick] = React.useState(0);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [parentId, setParentId] = React.useState("");
  const [editing, setEditing] = React.useState<Category | null>(null);
  const [confirmArchive, setConfirmArchive] = React.useState("");
  const [pendingSave, setPendingSave] = React.useState<{ createdId: string | null } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  void tick;
  const branch = phase9Store.getActiveBranch();
  const currentBranch = branch?.id ?? null;
  const list = store.listCategories();
  let tree: ReturnType<typeof buildScopedCategoryTree> = [];
  let treeError: string | null = null;
  try { tree = buildScopedCategoryTree(list, currentBranch); }
  catch (cause) { treeError = cause instanceof Error ? cause.message : String(cause); }
  const permission = can("products.manage");
  const isEditable = (item: Category) => permission &&
    (item.branchId === currentBranch || (item.branchId == null && branch?.isHeadquarters));
  const excluded = editing ? categoryDescendantIds(list, editing.id) : new Set<string>();

  function reset() {
    setName(""); setDescription(""); setParentId(""); setEditing(null);
    setConfirmArchive(""); setError(null);
  }
  function edit(category: Category) {
    if (!isEditable(category)) return;
    setEditing({ ...category }); setName(category.name);
    setDescription(category.description ?? "");
    setParentId(category.parentId ?? ""); setError(null);
    setSuccess(null); setConfirmArchive("");
  }
  async function persist(createdId: string | null) {
    try {
      await onChanged?.();
      setTick(x => x + 1);
      setPendingSave(null);
      setSuccess(createdId ? "Category saved." : "Category changes saved.");
      if (createdId) onCreated?.(createdId);
      reset();
    } catch (cause) {
      setPendingSave({ createdId });
      setError("Category updated in memory but not confirmed in storage. Retry save without creating a duplicate. " +
        (cause instanceof Error ? cause.message : String(cause)));
    }
  }
  async function submit() {
    if (!permission || busy || pendingSave || treeError) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      if (editing) {
        if (!isEditable(editing)) throw new Error("Category is not editable in this branch");
        const result = store.updateCategory(editing.id, {
          name, description, parentId: parentId || null,
        }, editing.updatedAt);
        if (!result.category) throw new Error(result.error ?? "Unable to update category");
        await persist(null);
      } else {
        if (!currentBranch) throw new Error("Choose an active branch to create categories");
        const cat = store.createCategory({
          name, description, parentId: parentId || null, branchId: currentBranch,
        });
        await persist(cat.id);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  async function archive(category: Category) {
    if (!permission || busy || pendingSave || !isEditable(category)) return;
    if (confirmArchive !== category.id) {
      setConfirmArchive(category.id); setError(null);
      return;
    }
    setBusy(true); setError(null);
    try {
      const result = store.archiveCategory(category.id, category.updatedAt);
      if (!result.category) throw new Error(result.error ?? "Category could not be archived");
      await persist(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false); setConfirmArchive("");
    }
  }

  return <section className="space-y-3" aria-label="Product category hierarchy">
    <p className="text-xs text-slate-600">
      Organize products by category and subcategory. Selecting a parent in the product filter includes its subcategories.
      Categories with products or children cannot be archived.
    </p>
    {treeError && <p role="alert" className="text-sm text-red-700">{treeError}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {success && <p role="status" className="text-sm text-green-700">{success}</p>}
    {pendingSave && <Button size="sm" disabled={busy} onClick={() => { void persist(pendingSave.createdId); }}>
      Retry category storage save
    </Button>}
    {permission && !treeError && <div className="space-y-2 rounded-lg border p-3">
      <h3 className="text-sm font-semibold">{editing ? "Edit category" : "Create category / subcategory"}</h3>
      <FormField label="Category name *">
        <input aria-label="Category hierarchy name" className={inputClass} maxLength={100}
          value={name} disabled={busy || !!pendingSave} onChange={event => setName(event.target.value)}/>
      </FormField>
      <FormField label="Parent category">
        <select aria-label="Category hierarchy parent" className={selectClass}
          value={parentId} disabled={busy || !!pendingSave} onChange={event => setParentId(event.target.value)}>
          <option value="">Top level</option>
          {tree.filter(x=>!excluded.has(x.id)).map(x=>
            <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      </FormField>
      <FormField label="Description">
        <input className={inputClass} maxLength={500} value={description} disabled={busy || !!pendingSave}
          onChange={event => setDescription(event.target.value)}/>
      </FormField>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || !!pendingSave || !name.trim()} onClick={() => { void submit(); }}>
          {busy ? "Saving..." : editing ? "Update category" : "Create category"}
        </Button>
        {editing && <Button size="sm" variant="outline" disabled={busy || !!pendingSave} onClick={reset}>Cancel edit</Button>}
      </div>
    </div>}
    <div className="max-h-80 space-y-1 overflow-y-auto">
      {tree.length===0 && <p className="text-sm text-slate-500">No categories in this branch.</p>}
      {tree.map(node=>{
        const category=list.find(c=>c.id===node.id)!;
        return <div key={node.id} className="flex items-center justify-between gap-2 rounded border p-2 text-sm">
          <div>
            <span className="font-medium">{node.label}</span>
            {category.branchId==null && <span className="ml-2 text-xs text-slate-400">Shared</span>}
            <p className="text-xs text-slate-500">{node.path}</p>
          </div>
          {isEditable(category) && <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="outline" disabled={busy || !!pendingSave} onClick={()=>edit(category)}>Edit</Button>
            <Button size="sm" variant="outline" disabled={busy || !!pendingSave} onClick={()=>{void archive(category);}}>
              {confirmArchive===category.id ? "Confirm archive" : "Archive"}
            </Button>
          </div>}
        </div>;
      })}
    </div>
  </section>;
}
