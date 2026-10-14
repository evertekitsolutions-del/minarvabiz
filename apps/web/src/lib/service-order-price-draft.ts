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

function money(raw: string, label: string, required = false): number {
  const text = raw.trim();
  if (!text && !required) return 0;
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(text)) {
    throw new Error(label + " must be a valid non-negative amount (up to 2 decimals).");
  }
  const amount = Number(text);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(Math.round(amount * 100))) {
    throw new Error(label + " is outside the supported monetary range.");
  }
  return amount;
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
