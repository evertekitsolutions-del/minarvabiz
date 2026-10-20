/*!
MIT License

Copyright (c) 2025-2026 Open Mercato contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/
import type { ServiceType } from "@minarvabiz/types";

type OrderPriceDraft = {
  serviceType: ServiceType;
  price: string;
  discount: string;
  advance: string;
  externalMaterialCost: string;
  quantity: string;
  unitPrice: string;
  bulkDiscount: string;
};

/**
 * Amount validation adapted from Open Mercato catalog/lib/priceValidation.ts.
 * Upstream 4374c48def1654927805c4b760f0e7f8648280f2; MIT.
 * Copyright (c) 2025-2026 Open Mercato contributors.
 * See THIRD_PARTY_NOTICES.md for the complete license.
 * Minarva: two decimals, leading-dot amounts, no internal whitespace removal,
 * and safe integer cents instead of the upstream catalog digit limit.
 */
export type MoneyAmountValidationResult =
  | { ok: true; numeric: number }
  | { ok: false; reason: "invalid_format" | "negative" | "unsafe_range" };

export function validateMoneyAmountInput(value: unknown): MoneyAmountValidationResult {
  if (typeof value !== "string" && typeof value !== "number") {
    return { ok: false, reason: "invalid_format" };
  }
  const raw = String(value).trim();
  if (raw.startsWith("-")) return { ok: false, reason: "negative" };
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(raw)) {
    return { ok: false, reason: "invalid_format" };
  }
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || !Number.isSafeInteger(Math.round(numeric * 100))) {
    return { ok: false, reason: "unsafe_range" };
  }
  return { ok: true, numeric };
}

function money(raw: string, label: string, required = false): number {
  if (typeof raw === "string" && !raw.trim() && !required) return 0;
  const result = validateMoneyAmountInput(raw);
  if (!result.ok) {
    if (result.reason === "unsafe_range") throw new Error(label + " is outside the supported monetary range.");
    throw new Error(label + " must be a valid non-negative amount (up to 2 decimals).");
  }
  return result.numeric;
}

/** Reject malformed form data before the shared createOrder transaction is called. */
export function parseServiceOrderPriceDraft(form: OrderPriceDraft) {
  const bulk = form.serviceType === "wholesale" || form.serviceType === "uniform";
  const quantity = bulk ? Number(form.quantity.trim()) : 1;
  if (bulk && (!/^[1-9]\d*$/.test(form.quantity.trim()) || !Number.isSafeInteger(quantity))) {
    throw new Error("Quantity must be a positive whole number.");
  }
  const unitPrice = bulk ? money(form.unitPrice, "Unit price", true) : undefined;
  const grossCents = bulk
    ? Math.round(unitPrice! * 100) * quantity
    : Math.round(money(form.price, "Price", true) * 100);
  if (!Number.isSafeInteger(grossCents)) {
    throw new Error("Service order total is outside the supported monetary range.");
  }
  const price = grossCents / 100;
  const discount = bulk ? 0 : money(form.discount, "Discount");
  const bulkDiscount = bulk ? money(form.bulkDiscount, "Bulk discount") : 0;
  const deductionCents = Math.round((bulk ? bulkDiscount : discount) * 100);
  if (deductionCents > grossCents) {
    throw new Error("Discount cannot exceed the service order price.");
  }
  const advance = money(form.advance, "Advance");
  if (Math.round(advance * 100) > grossCents - deductionCents) {
    throw new Error("Advance cannot exceed the amount payable.");
  }
  const externalMaterialCost = money(form.externalMaterialCost, "External material cost");
  return { price, discount, advance, externalMaterialCost, quantity, unitPrice, bulkDiscount };
}
