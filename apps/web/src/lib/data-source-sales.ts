import { configFromEnv, pgRpc } from "@minarvabiz/database";
import type { Sale, Payment } from "@minarvabiz/types";
import {
  serializeDimensionSaleLine,
  requireDimensionSaleCapability,
  requireDimensionSaleReceipt,
  type RemoteWriter,
} from "@minarvabiz/business-logic";

type Config = NonNullable<ReturnType<typeof configFromEnv>>;

/**
 * Existing legacy sale RPC mapping, with a deployment-verified dimensional
 * writer. Keeps tenant/session fencing at the caller, never trusts a cache.
 */
export function createSaleRemoteWriter(
  cfg: Config,
  isSessionCurrent: () => boolean,
): Pick<RemoteWriter, "createSale" | "createDimensionalSale"> {
    const writeAtomicSale = async (
      sale: Sale, salePayments: Payment[], allowNegativeStock: boolean, dimensional: boolean
    ): Promise<void> => {
      const hasDimension = sale.items?.some(item => item.dimensionMetadata != null) ?? false;
      if (dimensional !== hasDimension) {
        throw new Error("Dimensional sale writer protocol mismatch");
      }
      if (!dimensional && sale.items?.some(item => Object.hasOwn(item, "dimension_metadata"))) {
        throw new Error("Legacy sale cannot accept dimensional metadata");
      }
      if (dimensional) {
        // No cached version: the authenticated server must attest the deployed
        // transaction/schema for each write. Missing RPC or permission fails closed.
        if (!isSessionCurrent()) {
          throw new Error("Dimensional sale session authority changed");
        }
        // Validate and canonicalize every measurement BEFORE contacting the cloud.
        for (const item of sale.items) serializeDimensionSaleLine(item);
        const cap = await pgRpc<Record<string, unknown>>(
          cfg, "ubp_dimension_sale_capability", {}
        );
        if (cap.error) throw new Error(cap.error.message);
        requireDimensionSaleCapability(cap.data);
        if (!isSessionCurrent()) {
          throw new Error("Dimensional sale session revoked during negotiation");
        }
      }

        const result = await pgRpc<Record<string, unknown>>(cfg, "create_sale", {
          p_sale: {
            id: sale.id,
            invoice_number: sale.invoiceNumber,
            customer_id: sale.customerId ?? null,
            customer_name: sale.customerName ?? null,
            sale_date: sale.saleDate,
            subtotal: sale.subtotal,
            discount_amount: sale.discountAmount,
            tax_amount: sale.taxAmount,
            total: sale.total,
            paid_amount: sale.paidAmount,
            balance_amount: sale.balanceAmount,
            status: sale.status,
            notes: sale.notes ?? null,
            created_at: sale.createdAt,
            updated_at: sale.updatedAt,
            branch_id: sale.branchId ?? null,
            device_id: sale.deviceId ?? null,
            created_by: sale.createdBy ?? null,
            version: sale.version,
            items: sale.items.map((item) => ({
              id: item.id,
              product_id: item.productId,
              product_name: item.productName,
              sku: item.sku ?? null,
              quantity: item.quantity,
              unit_price: item.unitPrice,
              cost_price: item.costPrice,
              discount_percent: item.discountPercent,
              tax_rate: item.taxRate,
              line_total: item.lineTotal,
              ...(dimensional ? serializeDimensionSaleLine(item) : {}),
            })),
          },
          p_payments: salePayments.map((payment) => ({
            id: payment.id,
            amount: payment.amount,
            method: payment.method,
            reference_type: payment.referenceType,
            reference_id: payment.referenceId,
            customer_id: payment.customerId ?? null,
            notes: payment.notes ?? null,
            paid_at: payment.paidAt,
            created_at: payment.createdAt,
            created_by: payment.createdBy ?? null,
            branch_id: payment.branchId ?? null,
            device_id: payment.deviceId ?? null,
            version: payment.version,
          })),
          p_allow_negative_stock: allowNegativeStock,
        });
        if (result.error) throw new Error(result.error.message);
        if (dimensional) requireDimensionSaleReceipt(result.data, sale.id);
    };

  return {
    createSale: (sale, payments, negative) =>
      writeAtomicSale(sale, payments, negative, false),
    createDimensionalSale: (sale, payments, negative) =>
      writeAtomicSale(sale, payments, negative, true),
  };
}
