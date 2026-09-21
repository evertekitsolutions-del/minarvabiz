"use client";

import * as React from "react";
import type { LaundryOrder, PaymentMethod } from "@minarvabiz/types";
import { Button } from "../Button";
import { FormField, selectClass } from "../forms/FormField";
import { formatMoney } from "../customers/format";

export type LaundryCancellationValues = {
  refundPaymentMethod?: PaymentMethod;
  supplierCostAction?: "keep" | "reverse";
};

export function LaundryCancellationForm({
  order,
  error,
  onSubmit,
  onCancel,
}: {
  order: LaundryOrder;
  error?: string | null;
  onSubmit: (values: LaundryCancellationValues) => void;
  onCancel: () => void;
}) {
  const [refundPaymentMethod, setRefundPaymentMethod] = React.useState<PaymentMethod>("cash");
  const [supplierCostAction, setSupplierCostAction] = React.useState<"" | "keep" | "reverse">("");

  React.useEffect(() => {
    setRefundPaymentMethod("cash");
    setSupplierCostAction("");
  }, [order.id]);

  const needsSupplierChoice = order.totalSupplierCost > 0;
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
        <div className="font-medium">{order.orderNumber}</div>
        <div className="mt-1">Customer refund: {formatMoney(order.paidAmount)}</div>
        <div>Customer outstanding to remove: {formatMoney(order.balanceAmount)}</div>
        {needsSupplierChoice && <div>Recorded supplier cost: {formatMoney(order.totalSupplierCost)}</div>}
      </div>

      {order.paidAmount > 0 && (
        <FormField label="Laundry refund payment method">
          <select
            className={selectClass}
            value={refundPaymentMethod}
            onChange={(e) => setRefundPaymentMethod(e.target.value as PaymentMethod)}
          >
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
            <option value="card">Card</option>
            <option value="upi">UPI</option>
            <option value="online">Online</option>
            <option value="other">Other</option>
          </select>
        </FormField>
      )}

      {needsSupplierChoice && (
        <FormField label="Supplier cost handling">
          <select
            className={selectClass}
            value={supplierCostAction}
            onChange={(e) => setSupplierCostAction(e.target.value as "" | "keep" | "reverse")}
          >
            <option value="">Select handling</option>
            <option value="keep">Keep supplier payable / cost — supplier is still owed</option>
            <option value="reverse">Reverse supplier payable / cost — supplier waived or is not owed</option>
          </select>
        </FormField>
      )}

      <p className="text-xs text-slate-500">
        Cancellation reverses customer revenue/receivable and records any refund using the selected tender.
        Supplier cost changes only when you explicitly choose to reverse it.
      </p>
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Keep Ticket</Button>
        <Button
          type="button"
          variant="danger"
          disabled={needsSupplierChoice && !supplierCostAction}
          onClick={() => onSubmit({
            refundPaymentMethod: order.paidAmount > 0 ? refundPaymentMethod : undefined,
            supplierCostAction: needsSupplierChoice ? (supplierCostAction || undefined) : undefined,
          })}
        >
          Cancel Ticket
        </Button>
      </div>
    </div>
  );
}
