import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, path) => mod._compile(ts.transpileModule(fs.readFileSync(path, "utf8"), {
  fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, path);
const { loginSchema, customerSchema, productSchema, stockQuantitySchema, createSaleSchema,
  uuidSchema, moneySchema, createUserSchema } = require("../index.ts");

test("login, customer and user validators preserve default and optional behavior on patched Zod", () => {
  assert.equal(loginSchema.parse({ email: "admin@example.com", password: "12345678" }).email, "admin@example.com");
  assert.equal(loginSchema.safeParse({ email: "bad", password: "12345678" }).success, false);
  assert.equal(customerSchema.parse({ name: " First Customer ", email: "", phone: null }).name, "First Customer");
  assert.equal(customerSchema.safeParse({ name: "" }).success, false);
  assert.equal(createUserSchema.safeParse({
    email: "a@b.com", fullName: "Admin", phone: null, role: "admin", password: "strong-pass",
  }).success, true);
  assert.equal(createUserSchema.safeParse({
    email: "a@b.com", fullName: "Admin", role: "owner", password: "strong-pass",
  }).success, false);
});

test("negative or fractional unsupported currency and stock precision are rejected", () => {
  assert.equal(moneySchema.safeParse(15.5).success, true);
  assert.equal(moneySchema.safeParse(-1).success, false);
  assert.equal(moneySchema.safeParse(Number.POSITIVE_INFINITY).success, false);
  assert.equal(stockQuantitySchema.safeParse(1.125).success, true);
  assert.equal(stockQuantitySchema.safeParse(1.00001).success, false);
  assert.equal(stockQuantitySchema.safeParse(Number.NaN).success, false);
});

test("product and sales schemas preserve invoice and stock defaults", () => {
  const p = productSchema.parse({ name: "Adapter", costPrice: 2, sellingPrice: 3 });
  assert.equal(p.stockQuantity, 0);
  assert.equal(p.minimumStock, 0);
  assert.equal(p.unit, "pcs");
  assert.equal(p.isActive, true);
  const sale = createSaleSchema.parse({
    items: [{ productId: "11111111-1111-4111-8111-111111111111", quantity: 1, unitPrice: 3 }],
  });
  assert.equal(sale.paidAmount, 0);
  assert.equal(sale.paymentMethod, "cash");
  assert.equal(sale.items[0].discountPercent, 0);
  assert.equal(uuidSchema.safeParse("invalid").success, false);
});

test("patched Zod rejects constrained oversized collections", () => {
  const { z } = require("zod");
  const oversized = Array.from({ length: 10_000 }, () => 1);
  assert.equal(z.array(z.number()).max(3).safeParse(oversized).success, false);
  assert.equal(createSaleSchema.safeParse({ items: [] }).success, false);
});
