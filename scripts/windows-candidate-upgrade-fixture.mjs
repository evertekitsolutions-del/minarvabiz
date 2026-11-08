/**
 * Isolated Windows CI only: deterministic Boutique/Laundry/ledger fixture for
 * published-v1.0.26 -> UNPUBLISHED lab-only NSIS candidate upgrade testing.
 *
 * Never run on a customer machine, customer data, or outside a GitHub runner.
 * "seed" is intentionally destructive to an EXISTING EMPTY RUNNER FIXTURE only.
 * "verify" is read-only and validates prices, stock, IDs, receivables and rows.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const req = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
const SHA = (bytes) => createHash("sha256").update(bytes).digest("hex");
const stamp = "2026-11-08T08:00:00.000Z";
const args = process.argv.slice(2);
const mode = args[0];
const database = args[1] ? path.resolve(args[1]) : "";
const stateFile = args[2] ? path.resolve(args[2]) : "";
const labTemp = path.resolve(process.env.RUNNER_TEMP || "");
const prefix = labTemp + path.sep;

if (process.env.GITHUB_ACTIONS !== "true" || process.env.MINARVA_ISOLATED_UPGRADE_LAB !== "1" ||
    !process.env.RUNNER_TEMP || !database.startsWith(prefix) || !stateFile.startsWith(prefix) ||
    !["seed", "verify"].includes(mode)) {
  throw new Error("Refusing to inspect or change non-isolated SQLite. GitHub Windows lab + RUNNER_TEMP only.");
}
if (path.basename(database) !== "minarvabiz.db") throw new Error("Unexpected lab database filename");
for (const file of [database, stateFile]) {
  const parent = path.dirname(file);
  if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink()) throw new Error("Symlinked lab folder refused");
}
if (!fs.existsSync(database) || fs.lstatSync(database).isSymbolicLink() ||
    !fs.lstatSync(database).isFile() || fs.statSync(database).size < 1024) {
  throw new Error("Existing isolated native source-release SQLite image required");
}
const SQL = await req("sql.js/dist/sql-asm.js")({});
const db = new SQL.Database(fs.readFileSync(database));
function value(sql, binds = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(binds);
    return stmt.step() ? stmt.get()[0] : null;
  } finally {
    stmt.free();
  }
}
function run(sql, params = []) { db.run(sql, params); }
function domain() {
  const raw = value("SELECT value FROM domain_kv WHERE key = 'domain_snapshot_v2'");
  assert.equal(typeof raw, "string", "Source app must create full SQLite snapshot before seeding");
  return JSON.parse(raw);
}
function canonical(snap) {
  const project = {
    products: (snap.products || []).map(p => ({
      id:p.id,name:p.name,parentProductId:p.parentProductId ?? null,
      hasVariants:Boolean(p.hasVariants),brand:p.brand ?? null,size:p.size ?? null,
      color:p.color ?? null,fabric:p.fabric ?? null,
      sku:p.sku ?? null,barcode:p.barcode ?? null,
      price:p.sellingPrice,mrp:p.mrp ?? null,
      taxRate:p.taxRate ?? null,stockQuantity:p.stockQuantity,
      isActive:p.isActive,
    })),
    customers: (snap.customers || []).map(c => ({
      id:c.id,outstandingBalance:c.outstandingBalance,totalSpending:c.totalSpending,
    })),
    sales: (snap.sales || []).map(s => ({
      id:s.id,invoiceNumber:s.invoiceNumber,total:s.total,
      paidAmount:s.paidAmount,balanceAmount:s.balanceAmount,status:s.status,
      items:(s.items||[]).map(i => ({id:i.id,productId:i.productId,unitPrice:i.unitPrice,quantity:i.quantity,lineTotal:i.lineTotal})),
    })),
    payments: (snap.payments || []).map(p => ({
      id:p.id,amount:p.amount,method:p.method,
      referenceType:p.referenceType,referenceId:p.referenceId,customerId:p.customerId,
    })),
    orders:(snap.orders||[]).map(o => ({
      id:o.id,orderNumber:o.orderNumber,customerId:o.customerId,
      price:o.price,advance:o.advance,balance:o.balance,status:o.status,
    })),
    laundry:(snap.laundry||[]).map(l => ({
      id:l.id,orderNumber:l.orderNumber,customerId:l.customerId,
      quantity:l.quantity,totalCustomerCharge:l.totalCustomerCharge,
      paidAmount:l.paidAmount,balanceAmount:l.balanceAmount,status:l.status,
    })),
    outbox:(snap.outbox||[]).map(o => ({id:o.id,tableName:o.tableName,recordId:o.recordId,operation:o.operation})),
  };
  for (const rows of Object.values(project)) rows.sort((a,b) => String(a.id).localeCompare(String(b.id)));
  return { digest:SHA(JSON.stringify(project)), counts:Object.fromEntries(Object.entries(project).map(([key, rows])=>[key,rows.length])) };
}
function inspect() {
  assert.equal(value("PRAGMA quick_check"), "ok", "SQLite integrity must pass");
  const snap = domain();
  const result = canonical(snap);
  assert.equal(Number(value("SELECT COUNT(*) FROM products")), result.counts.products,
    "Normalized table must agree with snapshot (do not silently lose a product)");
  assert.equal(Number(value("SELECT COUNT(DISTINCT id) FROM products")), result.counts.products);
  assert.ok(result.counts.products >= 40);
  assert.ok(result.counts.sales >= 2 && result.counts.payments >= 2);
  assert.ok(result.counts.laundry >= 1 && result.counts.orders >= 1);
  assert.ok(result.counts.outbox >= 1);
  return result;
}
try {
  if (mode === "seed") {
    const snap = domain();
    for (const key of ["products","customers","sales","payments","orders","laundry","outbox"]) {
      assert.equal(Array.isArray(snap[key]) ? snap[key].length : 0,0,
        "Seed only a freshly initialized non-customer Windows lab image: " + key);
    }
    const category = {id:"lab-category",name:"Lab Readymade",isActive:true,createdAt:stamp,updatedAt:stamp};
    const parent = {
      id:"lab-parent",name:"Lab Kurti",sku:"LAB-KURTI",barcode:null,categoryId:category.id,
      brand:"Minarva Lab",size:null,color:null,fabric:null,hasVariants:true,parentProductId:null,
      unit:"pcs",costPrice:400,sellingPrice:699,mrp:699,taxRate:5,stockQuantity:0,
      minimumStock:1,isActive:true,createdAt:stamp,updatedAt:stamp,version:1,
    };
    const childVariants = Array.from({length:8}, (_,i)=>({
      ...parent,id:"lab-variant-"+i,name:"Lab Kurti Variant "+i,
      sku:"LAB-K-"+i,barcode:"290"+String(i).padStart(10,"0"),
      parentProductId:parent.id,hasVariants:false,
      color:i%2===0?"Blue":"Red",size:["S","M","L","XL"][i%4],
      fabric:i%2===0?"Cotton":"Rayon",costPrice:450+i,
      sellingPrice:749+i,mrp:749+i,stockQuantity:3+i,
    }));
    const singles = Array.from({length:42},(_,i)=>({
      ...parent,id:"lab-single-"+String(i).padStart(2,"0"),
      name:"Lab Garment "+i,sku:"LAB-G-"+i,barcode:"291"+String(i).padStart(10,"0"),
      parentProductId:null,hasVariants:false,color:"Green",size:"M",fabric:"Cotton",
      costPrice:120+i,sellingPrice:200+i,mrp:200+i,
      stockQuantity:i+1,
    }));
    snap.products = [parent,...childVariants,...singles];
    snap.categories = [...(snap.categories||[]),category];
    snap.customers = [
      {id:"lab-customer-1",name:"Synthetic Lab Customer 1",phone:"9000000001",outstandingBalance:599,totalSpending:1000,createdAt:stamp,updatedAt:stamp,version:1},
      {id:"lab-customer-2",name:"Synthetic Lab Customer 2",phone:"9000000002",outstandingBalance:0,totalSpending:700,createdAt:stamp,updatedAt:stamp,version:1},
    ];
    const sales = [
      {id:"lab-sale-1",invoiceNumber:"LAB-INV-0001",customerId:"lab-customer-1",customerName:"Synthetic Lab Customer 1",saleDate:stamp,
      subtotal:1599,discountAmount:0,taxAmount:0,total:1599,paidAmount:1000,balanceAmount:599,status:"partial",
      items:[{id:"lab-sale-line-1",saleId:"lab-sale-1",productId:"lab-variant-1",productName:"Lab Kurti Variant 1",quantity:1,unitPrice:750,costPrice:451,discountPercent:0,taxRate:5,lineTotal:750},
        {id:"lab-sale-line-2",saleId:"lab-sale-1",productId:"lab-variant-2",productName:"Lab Kurti Variant 2",quantity:1,unitPrice:849,costPrice:452,discountPercent:0,taxRate:5,lineTotal:849}],
      createdAt:stamp,updatedAt:stamp,version:1},
      {id:"lab-sale-2",invoiceNumber:"LAB-INV-0002",customerId:"lab-customer-2",saleDate:stamp,
      subtotal:700,discountAmount:0,taxAmount:0,total:700,paidAmount:700,balanceAmount:0,status:"completed",
      items:[{id:"lab-sale-line-3",saleId:"lab-sale-2",productId:"lab-single-00",productName:"Lab Garment 0",quantity:1,unitPrice:700,costPrice:120,discountPercent:0,taxRate:0,lineTotal:700}],
      createdAt:stamp,updatedAt:stamp,version:1},
    ];
    snap.sales = sales;
    snap.payments = [
      {id:"lab-payment-1",amount:1000,method:"upi",referenceType:"sale",referenceId:"lab-sale-1",customerId:"lab-customer-1",paidAt:stamp,createdAt:stamp,version:1},
      {id:"lab-payment-2",amount:700,method:"cash",referenceType:"sale",referenceId:"lab-sale-2",customerId:"lab-customer-2",paidAt:stamp,createdAt:stamp,version:1},
    ];
    snap.orders = [{
      id:"lab-tailoring-1",orderNumber:"LAB-T-0001",customerId:"lab-customer-1",orderDate:stamp,
      serviceType:"ladies_tailoring",status:"pending",customerSuppliedMaterial:true,shopSuppliedMaterial:false,
      price:800,discount:0,advance:200,balance:600,externalMaterialCost:0,orderExpensesTotal:0,
      quantity:1,unitPrice:800,bulkDiscount:0,expenses:[],createdAt:stamp,updatedAt:stamp,version:1,
    }];
    snap.laundry = [{
      id:"lab-laundry-1",orderNumber:"LAB-L-0001",customerId:"lab-customer-1",garment:"Kurti",
      quantity:2,mode:"in_house_ironing",supplierRate:0,customerRate:60,profit:120,
      totalCustomerCharge:120,totalSupplierCost:0,status:"pending",paidAmount:20,balanceAmount:100,
      createdAt:stamp,updatedAt:stamp,version:1,
    }];
    snap.outbox = [{
      id:"lab-outbox-1",tableName:"products",recordId:"lab-single-00",operation:"insert",
      payload:{id:"lab-single-00"},deviceId:"synthetic-lab-device",createdAt:stamp,
      attempts:0,status:"pending",
    }];
    const initialSqlite = fs.readFileSync(database);
    const staging = database + ".lab-stage";
    run("BEGIN IMMEDIATE");
    try {
      run("UPDATE domain_kv SET value=?,updated_at=? WHERE key='domain_snapshot_v2'",[JSON.stringify(snap),stamp]);
      for (const p of snap.products) {
        run("INSERT INTO products (id,name,sku,barcode,unit,cost_price,selling_price,stock_quantity,minimum_stock,is_active,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
          [p.id,p.name,p.sku,p.barcode,p.unit,p.costPrice,p.sellingPrice,p.stockQuantity,p.minimumStock,1,stamp,stamp,1]);
      }
      run("COMMIT");
    } catch (error) {
      run("ROLLBACK"); throw error;
    }
    const before = inspect();
    fs.writeFileSync(staging, Buffer.from(db.export()),{flag:"wx"});
    const verifyDb = new SQL.Database(fs.readFileSync(staging));
    try {
      assert.equal(verifyDb.exec("PRAGMA quick_check")[0].values[0][0],"ok");
    } finally { verifyDb.close(); }
    fs.renameSync(staging,database); // GitHub-owned empty fixture only
    fs.writeFileSync(stateFile, JSON.stringify({ ...before,seededSqliteSha256:SHA(fs.readFileSync(database)) },null,2),{flag:"wx"});
    console.log("ISOLATED_WINDOWS_FIXTURE_SEED PASS "+JSON.stringify(before.counts));
  } else {
    const state = JSON.parse(fs.readFileSync(stateFile,"utf8"));
    const observed = inspect();
    assert.deepEqual(observed.counts,state.counts,"Entity counts changed during upgrade");
    assert.equal(observed.digest,state.digest,"Core product/stock/price/ledger fingerprints changed");
    console.log("ISOLATED_WINDOWS_FIXTURE_VERIFY PASS "+JSON.stringify(observed.counts));
  }
} finally {
  db.close();
}
