/** UBP-02b: actual sql.js upgrade of a saved Windows SQLite DB. Display cache only. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { SQLITE_DDL, SQLITE_SCHEMA_VERSION } from "../sql/sqlite-ddl.ts";
const require = createRequire(import.meta.url);
const SQL = await require("sql.js")();
const marker = "-- UBP-02b: offline-only business profile and product metadata cache.";
assert.ok(SQLITE_DDL.includes(marker), "UBP-02b extension missing");
assert.equal(SQLITE_SCHEMA_VERSION, 7);
function applyDDL(db, ddl) {
  db.run("PRAGMA foreign_keys = ON");
  for (const statement of ddl.split(";").map(s => s.trim()).filter(Boolean)) {
    try { db.run(statement); }
    catch(error) {
      if (/duplicate column name: (email|address)/i.test(String(error))) continue;
      throw error;
    }
  }
}
function rows(db, sql, params=[]) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const result=[];
    while(stmt.step()) result.push(stmt.getAsObject());
    return result;
  } finally { stmt.free(); }
}
function shouldFail(db,sql,params,label) {
  assert.throws(()=>db.run(sql,params), /constraint failed|mismatch|foreign key|CHECK|UNIQUE/i,label);
}
const legacy=new SQL.Database();
applyDDL(legacy,SQLITE_DDL.split(marker)[0]);
legacy.run("INSERT INTO products(id,name,org_id,created_at,updated_at) VALUES(?,?,?,?,?)",
  ["prod1","Laptop","org-a","2026-10-18T00:00:00Z","2026-10-18T00:00:00Z"]);
legacy.run("INSERT INTO sales(id,invoice_number,sale_date,status,created_at,updated_at) VALUES(?,?,?,?,?,?)",
  ["sale1","INV-LEGACY-1","2026-10-18T00:00:00Z","completed","2026-10-18T00:00:00Z","2026-10-18T00:00:00Z"]);
const saved=legacy.export();legacy.close();
const db=new SQL.Database(saved);
applyDDL(db,SQLITE_DDL);
assert.equal(rows(db,"SELECT name FROM products WHERE id='prod1'")[0]?.name,"Laptop");
assert.equal(rows(db,"SELECT invoice_number FROM sales WHERE id='sale1'")[0]?.invoice_number,"INV-LEGACY-1");
assert.equal(rows(db,"SELECT COUNT(*) n FROM ubp_business_profile_cache")[0]?.n,0);
assert.equal(rows(db,"SELECT COUNT(*) n FROM ubp_product_tracking_cache")[0]?.n,0);
db.run("INSERT INTO ubp_business_profile_cache(org_id,business_group,business_type_code,feature_config_json) VALUES (?,?,?,?)",
  ["org-a","SERIALIZED","serialized_054",'{"additionalCapabilities":["booking"]}']);
db.run("INSERT INTO ubp_business_profile_cache(org_id,business_group,business_type_code) VALUES (?,?,?)",
  ["org-b","RETAIL","retail_001"]);
assert.equal(rows(db,"SELECT COUNT(*) n FROM ubp_business_profile_cache WHERE org_id=?",["org-a"])[0]?.n,1);
assert.equal(rows(db,"SELECT COUNT(*) n FROM ubp_business_profile_cache WHERE org_id=?",["org-b"])[0]?.n,1);
shouldFail(db,"INSERT INTO ubp_business_profile_cache(org_id,business_group,business_type_code) VALUES(?,?,?)",
  ["bad","OTHER","other_999"],"Invalid group");
shouldFail(db,"INSERT INTO ubp_business_profile_cache(org_id,business_group) VALUES(?,?)",
  ["partial","SERVICE"],"Partial group");
shouldFail(db,"INSERT INTO ubp_business_profile_cache(org_id,business_group,business_type_code) VALUES(?,?,?)",
  ["mismatch","SERVICE","retail_001"],"Wrong group preset");
shouldFail(db,"INSERT INTO ubp_business_profile_cache(org_id,feature_config_json) VALUES(?,?)",
  ["array","[]"],"JSON must be object");
shouldFail(db,"INSERT INTO ubp_business_profile_cache(org_id,feature_config_json) VALUES(?,?)",
  ["large",JSON.stringify({value:"x".repeat(4300)})],"Limit config size");
db.run("INSERT INTO ubp_product_tracking_cache(org_id,product_id,tracking_mode,attributes_json,updated_at) VALUES(?,?,?,?,?)",
  ["org-a","prod1","serial",'{"warranty_months":24}',"2026-10-18T00:00:00Z"]);
assert.equal(rows(db,"SELECT tracking_mode FROM ubp_product_tracking_cache")[0]?.tracking_mode,"serial");
shouldFail(db,"INSERT INTO ubp_product_tracking_cache(org_id,product_id,tracking_mode,updated_at) VALUES(?,?,?,?)",
  ["org-b","prod1","serial","2026-10-18T00:00:00Z"],"Reject cross-tenant product");
shouldFail(db,"INSERT INTO ubp_product_tracking_cache(org_id,product_id,tracking_mode,updated_at) VALUES(?,?,?,?)",
  ["org-a","not-found","serial","2026-10-18T00:00:00Z"],"Reject non-existent product");
shouldFail(db,"UPDATE ubp_product_tracking_cache SET org_id=? WHERE product_id=?",
  ["org-b","prod1"],"Reject reparent to other tenant");
shouldFail(db,"UPDATE ubp_product_tracking_cache SET tracking_mode=? WHERE product_id=?",
  ["unknown","prod1"],"Reject tracking enum");
shouldFail(db,"UPDATE ubp_product_tracking_cache SET attributes_json=? WHERE product_id=?",
  ["[]","prod1"],"Reject non-object metadata");
db.run("BEGIN");
db.run("INSERT OR REPLACE INTO products(id,name,org_id,created_at,updated_at) VALUES(?,?,?,?,?)",
  ["prod1","Laptop updated","org-a","2026-10-18T00:00:00Z","2026-10-18T01:00:00Z"]);
db.run("COMMIT");
assert.equal(rows(db,"SELECT tracking_mode FROM ubp_product_tracking_cache")[0]?.tracking_mode,"serial",
 "Existing INSERT OR REPLACE product mirroring must preserve metadata");
applyDDL(db,SQLITE_DDL);
const reloaded=new SQL.Database(db.export());
assert.equal(rows(reloaded,"SELECT invoice_number FROM sales")[0]?.invoice_number,"INV-LEGACY-1");
assert.equal(rows(reloaded,"SELECT business_type_code FROM ubp_business_profile_cache WHERE org_id='org-a'")[0]?.business_type_code,"serialized_054");
assert.equal(rows(reloaded,"SELECT tracking_mode FROM ubp_product_tracking_cache")[0]?.tracking_mode,"serial");
reloaded.close();db.close();
console.log("UBP-02b: SQLite legacy upgrades, scoped profile/product caches, validated metadata and restart PASS");
