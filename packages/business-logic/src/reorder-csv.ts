import type { Product } from "@minarvabiz/types";

const header = "name,sku,on_hand,min_stock,shortfall,unit";

function spreadsheetSafeCsv(value: unknown): string {
  const raw = String(value ?? "");
  // Spreadsheet apps can evaluate untrusted product names/SKUs as formulas.
  const safe = /^[\s\uFEFF]*[=+\-@]/u.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Export products at or below the configured minimum stock threshold. */
export function exportReorderCsv(
  products: readonly Pick<Product, "name" | "sku" | "stockQuantity" | "minimumStock" | "unit">[],
): string {
  const lines = products
    .filter((product) =>
      Number.isFinite(product.stockQuantity) &&
      Number.isFinite(product.minimumStock) &&
      product.stockQuantity <= product.minimumStock,
    )
    .map((product) => [
      product.name,
      product.sku ?? "",
      product.stockQuantity,
      product.minimumStock,
      Number(Math.max(0, product.minimumStock - product.stockQuantity).toFixed(3)),
      product.unit ?? "pcs",
    ].map(spreadsheetSafeCsv).join(","));
  return [header, ...lines].join("\n") + "\n";
}
