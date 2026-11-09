/**
 * OWNER-AUTHORIZED LIVE QA ONLY, never imported into production bundles.
 * Creates synthetic test accounts through official Supabase Auth Admin API,
 * then verifies actual signed JWT RLS over HTTP against the real PostgREST API.
 *
 * No customer funds, historical data, SQLite, or other tenant records touched.
 * No tokens, passwords or server secret keys are logged.
 */
import { randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";

if (process.env.MINARVA_QA_LIVE_TESTS !== "OWNER_AUTHORIZED") {
  throw new Error("Live test requires explicit MINARVA_QA_LIVE_TESTS=OWNER_AUTHORIZED.");
}
const project = process.env.MINARVA_QA_SUPABASE_URL?.replace(/\/$/,"");
const pub = process.env.MINARVA_QA_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.MINARVA_QA_SUPABASE_SECRET_KEY;
if (!project || !pub || !secret || !project.startsWith("https://wmjgefbaliuwmaxyzxkq.supabase.co")) {
  throw new Error("Live QA project URL, publishable key and protected Auth Admin secret are required.");
}
if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY !== "evertekitsolutions-del/minarvabiz") {
  throw new Error("Authorized repository mismatch.");
}

function headers(key, token, prefer = "") {
  return {
    apikey: key, Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}
async function request(path, { method = "GET", key, token = key, body, prefer } = {}) {
  const response = await fetch(project + path, {
    method, headers: headers(key, token, prefer),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  return { status: response.status, ok: response.ok, data };
}
function check(result, label) {
  if (!result.ok) {
    throw new Error(`${label}: rejected by remote endpoint (HTTP ${result.status}).`);
  }
  return result.data;
}
async function ensureUser(email, shopName) {
  const password = randomBytes(32).toString("base64url");
  const list = check(await request("/auth/v1/admin/users?per_page=1000", { key: secret }), "admin listing");
  const existing = Array.isArray(list?.users)
    ? list.users.find(user => user.email?.toLowerCase() === email) : null;
  if (existing) {
    check(await request(`/auth/v1/admin/users/${existing.id}`, {
      method: "PUT", key: secret,
      body: { password, email_confirm: true },
    }), "test-only password rotation");
  } else {
    check(await request("/auth/v1/admin/users", {
      method: "POST", key: secret,
      body: {
        email, password, email_confirm: true,
        user_metadata: { full_name: email.split("@")[0], shop_name: shopName },
      },
    }), "test user create");
  }
  const login = check(await request("/auth/v1/token?grant_type=password", {
    method: "POST", key: pub, body: { email, password },
  }), "synthetic account sign-in");
  assert.ok(login?.access_token, "Auth API returned no signed access JWT.");
  const auth = check(await request("/rest/v1/rpc/current_user_authorization", {
    method: "POST", key: pub, token: login.access_token, body: {},
  }), "tenant authorization");
  assert.equal(auth?.length, 1, "Exactly one tenant membership is required.");
  assert.ok(auth[0]?.auth_org_id, "Tenant bootstrap did not provision organization.");
  const branches = check(await request(
    `/rest/v1/branches?select=id,org_id,is_headquarters&org_id=eq.${auth[0].auth_org_id}`,
    { key: pub, token: login.access_token },
  ), "tenant headquarters");
  assert.ok(branches?.some(branch => branch.is_headquarters), "No default branch was created.");
  return { id: login.user.id, orgId: auth[0].auth_org_id, token: login.access_token,
    branchId: branches.find(branch => branch.is_headquarters).id, email };
}
async function rows(account, table, filters) {
  return check(await request(`/rest/v1/${table}?select=*&${filters}`, {
    key: pub, token: account.token,
  }), "read " + table);
}
async function denyMutation(account, verb, table, id, data) {
  const result = await request(`/rest/v1/${table}?id=eq.${id}&select=*`, {
    method: verb, key: pub, token: account.token, body: data, prefer: "return=representation",
  });
  if (!result.ok) return { status: result.status, rows: 0 };
  assert.deepEqual(result.data ?? [], [],
    `P0: ${verb} by Tenant B modified Tenant A ${table} rows`);
  return { status: result.status, rows: 0 };
}

const a = await ensureUser("test-tenant-a@minarvabiz.test", "Tenant A Boutique");
const b = await ensureUser("test-tenant-b@minarvabiz.test", "Tenant B Laundry");
assert.notEqual(a.orgId, b.orgId, "P0: Separate test users share an organization.");
assert.notEqual(a.id, b.id, "P0: Identical Auth user IDs in independent test accounts.");

const categoryId = randomUUID();
const productId = randomUUID();
const prefix = "MINARVA-QA-" + productId.slice(0,8);
const category = check(await request("/rest/v1/categories", {
  method: "POST", key: pub, token: a.token, prefer: "return=representation",
  body: {
    id: categoryId, org_id: a.orgId, name: prefix + "-CAT",
    description: "Owner-authorized isolated RLS verification", is_active: true,
  },
}), "Tenant A category creation");
assert.equal(category?.length, 1);
const makeProduct = {
  p_product_id: productId, p_name: prefix + "-PRODUCT",
  p_sku: prefix, p_barcode: prefix + "-BARCODE",
  p_category_id: categoryId, p_unit: "pcs",
  p_cost_price: 100, p_selling_price: 150, p_stock_quantity: 3,
  p_minimum_stock: 1, p_is_active: true,
};
check(await request("/rest/v1/rpc/create_product_with_opening_stock", {
  method: "POST", key: pub, token: a.token, body: makeProduct,
}), "atomic Tenant A opening stock");
const products = await rows(a, "products", `id=eq.${productId}&org_id=eq.${a.orgId}`);
const categories = await rows(a, "categories", `id=eq.${categoryId}&org_id=eq.${a.orgId}`);
const movements = await rows(a, "inventory_transactions",
  `product_id=eq.${productId}&reference_type=eq.opening_stock`);
assert.equal(products.length, 1);
assert.equal(categories.length, 1);
assert.equal(movements.length, 1);
assert.equal(Number(products[0].stock_quantity), 3);
assert.equal(Number(movements[0].balance_after), 3);

// Repeated RPC with the same IDs must not post a second opening-stock movement.
check(await request("/rest/v1/rpc/create_product_with_opening_stock", {
  method: "POST", key: pub, token: a.token, body: makeProduct,
}), "idempotent opening stock replay");
assert.equal((await rows(a, "inventory_transactions",
  `product_id=eq.${productId}&reference_type=eq.opening_stock`)).length, 1);

const bProductRead = await rows(b, "products", `id=eq.${productId}&org_id=eq.${a.orgId}`);
const bCategoryRead = await rows(b, "categories", `id=eq.${categoryId}&org_id=eq.${a.orgId}`);
assert.deepEqual(bProductRead, [], "P0 cross-tenant Product SELECT leak.");
assert.deepEqual(bCategoryRead, [], "P0 cross-tenant Category SELECT leak.");
const attempts = [
  await denyMutation(b, "PATCH", "products", productId, { name: "P0-CROSS-TENANT-UPDATE" }),
  await denyMutation(b, "DELETE", "products", productId),
  await denyMutation(b, "PATCH", "categories", categoryId, { name: "P0-CROSS-TENANT-UPDATE" }),
  await denyMutation(b, "DELETE", "categories", categoryId),
];
assert.equal((await rows(a, "products", `id=eq.${productId}`)).length, 1,
  "P0: B mutation changed A product");
assert.equal((await rows(a, "categories", `id=eq.${categoryId}`)).length, 1,
  "P0: B mutation changed A category");

// Signed-in re-authenticated sessions, not a local in-memory snapshot.
const repeatedLoginA = check(await request("/auth/v1/token?grant_type=password", {
  method: "POST", key: pub,
  body: { email: a.email, password: process.env.MINARVA_QA_TEST_PASSWORD_A },
}), "fresh session login");
if (!repeatedLoginA.access_token) throw new Error("No signed JWT on re-login.");

console.log(JSON.stringify({
  status: "LIVE_AUTH_REST_RLS_PASS",
  tenantA: { userId: a.id, orgId: a.orgId, branchId: a.branchId },
  tenantB: { userId: b.id, orgId: b.orgId, branchId: b.branchId },
  categoryId, productId, openingMovements: movements.length,
  deniedCrossTenantReads: 2, deniedMutations: attempts,
}, null, 2));
