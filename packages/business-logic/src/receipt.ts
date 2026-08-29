/**
 * Plain-text / HTML receipt builders for sales invoices.
 */

import type { Sale } from "@minarvabiz/types";
import { formatMoney } from "@minarvabiz/utils";

export function buildSaleReceiptText(
  sale: Sale,
  opts?: { shopName?: string; address?: string; phone?: string }
): string {
  const shop = opts?.shopName ?? "Minarva Biz";
  const lines: string[] = [
    shop,
    opts?.address ?? "",
    opts?.phone ? `Tel: ${opts.phone}` : "",
    "--------------------------------",
    `Invoice: ${sale.invoiceNumber}`,
    `Date: ${new Date(sale.saleDate).toLocaleString("en-IN")}`,
    sale.customerName ? `Customer: ${sale.customerName}` : "Customer: Walk-in",
    "--------------------------------",
  ];
  for (const item of sale.items) {
    lines.push(
      `${item.productName} x${item.quantity}`,
      `  ${formatMoney(item.unitPrice)} = ${formatMoney(item.lineTotal)}`
    );
  }
  lines.push("--------------------------------");
  lines.push(`Subtotal: ${formatMoney(sale.subtotal)}`);
  if (sale.discountAmount) lines.push(`Discount: ${formatMoney(sale.discountAmount)}`);
  if (sale.taxAmount) lines.push(`Tax: ${formatMoney(sale.taxAmount)}`);
  lines.push(`TOTAL: ${formatMoney(sale.total)}`);
  lines.push(`Paid: ${formatMoney(sale.paidAmount)}`);
  if (sale.balanceAmount > 0) lines.push(`Balance: ${formatMoney(sale.balanceAmount)}`);
  lines.push("--------------------------------");
  lines.push("Thank you!");
  return lines.filter((l) => l !== undefined).join("\n");
}

export function buildSaleReceiptHtml(
  sale: Sale,
  opts?: { shopName?: string; address?: string; phone?: string }
): string {
  const text = buildSaleReceiptText(sale, opts);
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html><html><head><title>${sale.invoiceNumber}</title>
<style>
  body { font-family: ui-monospace, monospace; font-size: 12px; padding: 16px; }
  pre { white-space: pre-wrap; }
  @media print { body { padding: 0; } }
</style></head><body><pre>${escaped}</pre>
<script>window.onload=function(){window.print();}</script>
</body></html>`;
}

/** Open print dialog in browser */
export function printSaleReceipt(
  sale: Sale,
  opts?: { shopName?: string; address?: string; phone?: string }
): void {
  if (typeof window === "undefined") return;
  const html = buildSaleReceiptHtml(sale, opts);
  const w = window.open("", "_blank", "width=400,height=600");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
