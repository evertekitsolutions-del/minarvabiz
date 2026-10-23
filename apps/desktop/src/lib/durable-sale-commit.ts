/**
 * A-FIRST-CUSTOMER: a checkout is not complete until the native SQLite image
 * acknowledges persistence. A failed/ambiguous write leaves the *same* sale
 * pending in memory; retrying must never create a second invoice, stock debit,
 * payment or outbox event.
 */
export interface DurableSaleReceipt {
  success: boolean;
  saleId?: string;
  invoiceNumber?: string;
  errors?: string[];
}

type CreatedSale = {
  errors: string[];
  sale?: { id: string; invoiceNumber: string };
};

export function createDurableSaleCommit<TPayload>(
  createSale: (payload: TPayload) => CreatedSale,
  persist: () => Promise<boolean>,
) {
  let pending: { fingerprint: string; receipt: DurableSaleReceipt } | null = null;
  let saving = false;
  // If the operator saved a pending sale from the recovery banner, its original
  // form may still be open. The next identical submit returns that receipt once.
  let recovered: { fingerprint: string; receipt: DurableSaleReceipt } | null = null;

  const failure = (message: string): DurableSaleReceipt => ({
    success: false,
    errors: [message],
  });

  const saveExisting = async (): Promise<DurableSaleReceipt> => {
    if (!pending) return failure("No unsaved checkout exists.");
    try {
      if (!(await persist())) {
        return failure("SQLite did not confirm the sale was saved. The existing invoice is pending; retry the same checkout. Do not create a replacement sale.");
      }
      const receipt = pending.receipt;
      pending = null;
      return receipt;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return failure("SQLite save failed: " + detail + ". The existing invoice is pending; retry the same checkout. Do not create a replacement sale.");
    }
  };

  return {
    hasPending(): boolean { return pending !== null; },
    async submit(payload: TPayload): Promise<DurableSaleReceipt> {
      if (saving) return failure("A checkout is already being saved. Do not submit again.");
      let fingerprint: string;
      try {
        fingerprint = JSON.stringify(payload);
        if (typeof fingerprint !== "string") throw new Error("Invalid sale payload");
      } catch (error) {
        return failure("Cannot identify the checkout: " + (error instanceof Error ? error.message : String(error)));
      }
      if (recovered) {
        const previous = recovered;
        recovered = null;
        if (previous.fingerprint === fingerprint) return previous.receipt;
      }
      if (pending && pending.fingerprint !== fingerprint) {
        return failure("A previous invoice has not been saved. Retry that unchanged checkout first; do not create another sale.");
      }
      saving = true;
      try {
        if (!pending) {
          const created = createSale(payload);
          if (created.errors.length) return { success: false, errors: created.errors };
          if (!created.sale?.id || !created.sale.invoiceNumber) {
            return failure("Sale creation returned no invoice identity. Stop checkout and inspect the local data before retrying.");
          }
          pending = {
            fingerprint,
            receipt: { success: true, saleId: created.sale.id, invoiceNumber: created.sale.invoiceNumber },
          };
        }
        return await saveExisting();
      } catch (error) {
        return failure("Checkout failed: " + (error instanceof Error ? error.message : String(error)));
      } finally {
        saving = false;
      }
    },
    async retryPending(): Promise<DurableSaleReceipt> {
      if (saving) return failure("A checkout is already being saved.");
      if (!pending) return failure("No unsaved checkout exists.");
      saving = true;
      try {
        const previous = pending;
        const result = await saveExisting();
        if (result.success && previous) recovered = { fingerprint: previous.fingerprint, receipt: result };
        return result;
      } finally {
        saving = false;
      }
    },
  };
}
