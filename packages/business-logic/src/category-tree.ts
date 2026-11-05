/** Hierarchical categories using Open Mercato's MIT formatting helper. */
import type { Category } from "@minarvabiz/types";
import { formatCategoryTreeLabel } from "./vendor/open-mercato/categoryTree";

export interface ScopedCategoryOption {
  id: string;
  parentId: string | null;
  name: string;
  depth: number;
  path: string;
  label: string;
  branchId: string | null;
}
function visible(category: Category, branchId: string | null): boolean {
  return !category.deletedAt && category.isActive &&
    (category.branchId == null || category.branchId === branchId);
}
export function categoryDescendantIds(categories: readonly Category[], categoryId: string): Set<string> {
  const descendants=new Set<string>([categoryId]);
  // Each category is visited once, preventing legacy cycles from infinite loops.
  let previousSize=-1;
  while(previousSize!==descendants.size){
    previousSize=descendants.size;
    for(const c of categories){
      if(!c.deletedAt && c.parentId && descendants.has(c.parentId))descendants.add(c.id);
    }
  }
  return descendants;
}
export function buildScopedCategoryTree(categories: readonly Category[], branchId: string | null): ScopedCategoryOption[] {
  const entries=categories.filter(c=>visible(c,branchId));
  const byId=new Map(entries.map(c=>[c.id,c]));
  if(byId.size!==entries.length)throw new Error("Duplicate category identifiers");
  const roots:Category[]=[];
  const children=new Map<string,Category[]>();
  for(const category of entries){
    if(category.parentId && category.parentId===category.id)throw new Error("Category cannot parent itself");
    if(category.parentId && byId.has(category.parentId)){
      const list=children.get(category.parentId)??[];
      list.push(category); children.set(category.parentId,list);
    }else roots.push(category);
  }
  const sorted=(items:Category[])=>items.sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
  const stack=new Set<string>(),seen=new Set<string>(),ordered:ScopedCategoryOption[]=[];
  function visit(cat:Category,parents:string[]){
    if(stack.has(cat.id))throw new Error("Category hierarchy contains a cycle");
    if(seen.has(cat.id))return;
    stack.add(cat.id);seen.add(cat.id);
    const depth=parents.length;
    if(depth>50)throw new Error("Category tree is too deep");
    const path=[...parents,cat.name].join(" / ");
    ordered.push({id:cat.id,parentId:cat.parentId??null,name:cat.name,
      depth,path,label:formatCategoryTreeLabel(cat.name,depth),branchId:cat.branchId??null});
    for(const child of sorted(children.get(cat.id)??[]))visit(child,[...parents,cat.name]);
    stack.delete(cat.id);
  }
  for(const root of sorted(roots))visit(root,[]);
  // Remaining categories can only be cycle components with no root.
  if(seen.size!==entries.length)throw new Error("Category hierarchy contains orphaned cycles");
  return ordered;
}
