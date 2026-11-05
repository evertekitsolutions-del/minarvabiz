import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{
  fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
}).outputText,file);
const store=require("../store.ts");
const hierarchy=require("../category-tree.ts");
const permissions=require("../permissions.ts");

const product=(id,categoryId)=>({
  id,name:"Product "+id,categoryId,unit:"pcs",costPrice:10,sellingPrice:20,
  stockQuantity:2,minimumStock:0,isActive:true,createdAt:"2026-10-01",updatedAt:"2026-10-01"
});
const cat=(id,name,parentId=null,branchId="b1")=>({
  id,name,parentId,branchId,isActive:true,createdAt:"2026-10-01",updatedAt:"2026-10-01"
});
function reset(categories=[],products=[]){
  permissions.setCurrentRole("admin");
  permissions.setRuntimeFeaturePolicy(null);
  store.hydrateCore({categories,products,customers:[],sales:[],payments:[]});
}
test("create categories, view parent paths, filter descendants and prevent cross-branch parents",()=>{
  reset();
  const root=store.createCategory({name:"Fabrics",branchId:"b1"});
  const child=store.createCategory({name:"Cotton",parentId:root.id,branchId:"b1"});
  const grandchild=store.createCategory({name:"Premium",parentId:child.id,branchId:"b1"});
  const shared=store.createCategory({name:"Shared",branchId:null});
  store.hydrateCore({products:[
    product("p1",root.id),product("p2",child.id),product("p3",grandchild.id)
  ]});
  const tree=hierarchy.buildScopedCategoryTree(store.listCategories(),"b1");
  assert.equal(tree.find(x=>x.id===grandchild.id).path,"Fabrics / Cotton / Premium");
  assert.equal(tree.find(x=>x.id===grandchild.id).depth,2);
  assert(hierarchy.categoryDescendantIds(store.listCategories(),root.id).has(grandchild.id));
  assert.deepEqual(store.listProducts({categoryId:root.id}).map(p=>p.id),["p1","p2","p3"]);
  assert.equal(hierarchy.buildScopedCategoryTree(store.listCategories(),"b2").some(x=>x.id===root.id),false);
  assert(hierarchy.buildScopedCategoryTree(store.listCategories(),"b2").some(x=>x.id===shared.id));
  assert.throws(()=>store.createCategory({name:"Other",parentId:root.id,branchId:"b2"}),/branch/);
});
test("category moves are cycle-checked and stale edits cannot silently overwrite",()=>{
  reset();
  const root=store.createCategory({name:"Clothing",branchId:"b1"});
  const child=store.createCategory({name:"Shirts",parentId:root.id,branchId:"b1"});
  const before=JSON.stringify(store.listCategories());
  assert.throws(()=>store.createCategory({name:"SHIRTS",parentId:root.id,branchId:"b1"}),/already exists/);
  assert.equal(JSON.stringify(store.listCategories()),before);
  assert.match(store.updateCategory(root.id,{parentId:child.id},root.updatedAt).error,/cycle/);
  assert.equal(JSON.stringify(store.listCategories()),before);
  const updated=store.updateCategory(child.id,{name:"Casual Shirts"},child.updatedAt);
  assert.equal(updated.error,undefined);
  assert.equal(store.updateCategory(child.id,{name:"Stale"},child.updatedAt).category,null);
  assert.equal(store.listCategories().find(x=>x.id===child.id).name,"Casual Shirts");
});
test("archiving requires moving children and reassigning products; no silent data deletion",()=>{
  reset();
  const root=store.createCategory({name:"Womenswear",branchId:"b1"});
  const child=store.createCategory({name:"Dresses",parentId:root.id,branchId:"b1"});
  store.hydrateCore({products:[product("p",child.id)]});
  assert.match(store.archiveCategory(root.id,root.updatedAt).error,/child/);
  assert.match(store.archiveCategory(child.id,child.updatedAt).error,/Reassign products/);
  assert.equal(store.listCategories().length,2);
  store.hydrateCore({products:[]});
  assert.equal(store.archiveCategory(child.id,child.updatedAt).error,undefined);
  assert.equal(store.archiveCategory(root.id,root.updatedAt).error,undefined);
  assert.equal(store.listCategories().length,0);
});
test("category tree fails closed on duplicate IDs and recursive legacy parent references",()=>{
  assert.throws(()=>hierarchy.buildScopedCategoryTree([cat("c","one"),cat("c","two")],"b1"),/Duplicate/);
  assert.throws(()=>hierarchy.buildScopedCategoryTree([cat("a","A","b"),cat("b","B","a")],"b1"),/cycle/i);
  assert.throws(()=>hierarchy.buildScopedCategoryTree([cat("a","A","a")],"b1"),/parent itself/i);
});
test("cashier and unlicensed catalog policy cannot modify categories",()=>{
  reset();
  permissions.setCurrentRole("cashier");
  assert.throws(()=>store.createCategory({name:"Unauthorized",branchId:"b1"}),/denied/i);
  permissions.setCurrentRole("admin");
  permissions.setRuntimeFeaturePolicy({
    sales:true,customers:true,inventory:false,tailoring:true,orders:true,laundry:true,
    reports:true,staff:true,advancedReports:true,cloudSync:true,multiUser:true,multiBranch:true,apiAccess:true
  });
  assert.throws(()=>store.createCategory({name:"Unauthorized",branchId:"b1"}),/license/i);
  permissions.setRuntimeFeaturePolicy(null);
});
test("shared Windows and Web product editors use scoped hierarchy and safe CRUD",()=>{
  const win=fs.readFileSync("apps/desktop/src/App.tsx","utf8");
  const web=fs.readFileSync("apps/web/src/app/(app)/products/page.tsx","utf8");
  const ui=fs.readFileSync("packages/ui/src/components/products/CategoryManagementPanel.tsx","utf8");
  const productList=fs.readFileSync("packages/ui/src/components/products/ProductList.tsx","utf8");
  const nativeProduct=fs.readFileSync("apps/desktop/src/components/ProductEditorModal.tsx","utf8");
  for(const source of [win,web]){
    assert(source.includes("CategoryManagementPanel"));
    assert(source.includes("onCreated="));
  }
  assert(win.includes("SQLite did not confirm category changes"));
  assert(web.includes("onChanged={refresh}"));
  assert(ui.includes("store.updateCategory("));
  assert(ui.includes("store.archiveCategory("));
  assert(ui.includes("Retry category storage save"));
  assert(productList.includes("buildScopedCategoryTree"));
  assert(nativeProduct.includes("buildScopedCategoryTree"));
});
