/** Authenticated category commands backed by the existing Minarva domain arrays. */
import type { Category,Product,UUID } from "@minarvabiz/types";
import { generateId,nowISO } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { touchPersistence } from "./autosave";
import { remoteUpsertCategory } from "./remote-write";
import { auditAction } from "./audit-actions";
import { categoryDescendantIds } from "./category-tree";

export type CategoryCreateInput={
  name:string;description?:string|null;parentId?:UUID|null;branchId?:UUID|null;
};
export type CategoryUpdatePatch={name?:string;description?:string|null;parentId?:UUID|null};
export function createCategoryRepository(categories:Category[],products:readonly Product[]) {
function validatedCategoryName(value: string): string {
  const normalized = value?.trim();
  if (!normalized || normalized.length > 100 || /[\r\n\u0000-\u001f]/.test(normalized))
    throw new Error("Category name must be 1–100 characters without control characters");
  return normalized;
}
function validatedCategoryDescription(value: string | null | undefined): string | null {
  const description = value?.trim() || null;
  if (description && description.length > 500)
    throw new Error("Category description exceeds 500 characters");
  return description;
}
function validCategoryParent(id: string | null, branchId: string | null, excludeId?: string): void {
  if (!id) return;
  const parent=categories.find(c=>c.id===id && !c.deletedAt && c.isActive);
  if (!parent || (parent.branchId != null && parent.branchId!==branchId))
    throw new Error("Parent category is unavailable in the selected branch");
  if (excludeId && categoryDescendantIds(categories,excludeId).has(id))
    throw new Error("Category hierarchy cannot contain a cycle");
}
function uniqueCategorySibling(name: string, parentId: string | null, branchId: string | null,excludeId?: string) {
  if (categories.some(c=>!c.deletedAt && c.id!==excludeId &&
    (c.parentId??null)===parentId && (c.branchId??null)===branchId &&
    c.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase())) {
    throw new Error("Category name already exists at this level");
  }
}
function createCategory(input: {
  name:string;description?:string|null;parentId?:UUID|null;branchId?:UUID|null
}):Category {
  assertPermission("products.manage");
  const name=validatedCategoryName(input.name);
  const parentId=input.parentId??null,branchId=input.branchId??null;
  validCategoryParent(parentId,branchId);
  uniqueCategorySibling(name,parentId,branchId);
  const cat: Category = {
    id: generateId(),name,description:validatedCategoryDescription(input.description),
    parentId,branchId,isActive:true,createdAt:nowISO(),updatedAt:nowISO()
  };
  categories.push(cat);touchPersistence();void remoteUpsertCategory(cat);
  auditAction("product_category.create","categories",cat.id,null,{...cat});
  return {...cat};
}
function updateCategory(id:UUID,patch:{
  name?:string;description?:string|null;parentId?:UUID|null;
},expectedUpdatedAt:string):{category:Category|null;error?:string}{
  assertPermission("products.manage");
  const cat=categories.find(c=>c.id===id&&!c.deletedAt);
  if(!cat)return {category:null,error:"Product category not found"};
  if(cat.updatedAt!==expectedUpdatedAt)return {category:null,error:"Category changed: reload before editing"};
  try{
    const name=patch.name===undefined?cat.name:validatedCategoryName(patch.name);
    const parentId=patch.parentId===undefined?(cat.parentId??null):patch.parentId;
    validCategoryParent(parentId,cat.branchId??null,id);
    uniqueCategorySibling(name,parentId,cat.branchId??null,id);
    const description=patch.description===undefined?cat.description??null:validatedCategoryDescription(patch.description);
    const before={...cat};
    const now=nowISO(),previous=Date.parse(cat.updatedAt);
    cat.name=name;cat.parentId=parentId;cat.description=description;
    cat.updatedAt=Number.isFinite(previous)&&now<=before.updatedAt
      ?new Date(previous+1).toISOString():now;
    touchPersistence();void remoteUpsertCategory(cat);
    auditAction("product_category.update","categories",id,before,{...cat});
    return {category:{...cat}};
  }catch(cause){return {category:null,error:cause instanceof Error?cause.message:String(cause)};}
}
function archiveCategory(id:UUID,expectedUpdatedAt:string):{
  category:Category|null;error?:string
}{
  assertPermission("products.manage");
  const cat=categories.find(c=>c.id===id&&!c.deletedAt);
  if(!cat)return {category:null,error:"Product category not found"};
  if(cat.updatedAt!==expectedUpdatedAt)return {category:null,error:"Category changed: reload before archiving"};
  if(categories.some(c=>!c.deletedAt&&c.parentId===id))
    return {category:null,error:"Move or archive child categories first"};
  if(products.some(p=>!p.deletedAt&&p.categoryId===id))
    return {category:null,error:"Reassign products before archiving this category"};
  const before={...cat};
  cat.isActive=false;cat.deletedAt=nowISO();cat.updatedAt=cat.deletedAt;
  touchPersistence();void remoteUpsertCategory(cat);
  auditAction("product_category.archive","categories",id,before,{...cat});
  return {category:{...cat}};
}

  return {createCategory,updateCategory,archiveCategory};
}
