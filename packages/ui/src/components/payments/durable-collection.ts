/**
 * Durable customer collection boundary for Windows SQLite.
 * The domain creates the payment, allocations and journal exactly once.
 * If SQLite rejects the image, only persistence may be retried.
 */
export type CollectionReceipt = { id: string };
export type CollectionMutation<T extends CollectionReceipt> = { payment: T | null; errors: string[] };
export type DurableCollectionResult = { ok: boolean; paymentId?: string; error?: string };

export function createDurableCollection<TInput, TReceipt extends CollectionReceipt>(
  createPayment: (input: TInput) => CollectionMutation<TReceipt>,
  persist: () => Promise<boolean>,
) {
  let pending: { paymentId: string; fingerprint: string } | null = null;
  let saving = false;
  let recovered: { fingerprint: string; paymentId: string } | null = null;
  const fingerprint = (input: TInput): string => JSON.stringify(input);
  const blocked = (): DurableCollectionResult => ({
    ok: false,
    error: "An earlier customer payment has not been saved to SQLite. Retry saving that existing payment before collecting another. Do not create a replacement payment.",
  });
  const saveExisting = async (isRecoveryRetry = false): Promise<DurableCollectionResult> => {
    if (!pending) return { ok: false, error: "No unsaved customer payment exists." };
    try {
      if (!await persist()) return {
        ok: false, error: "SQLite did not confirm the customer payment. The same payment and allocations are pending; retry saving without collecting again.",
      };
      const saved = pending;
      pending = null;
      if (isRecoveryRetry) recovered = saved;
      return { ok: true, paymentId: saved.paymentId };
    } catch (error) {
      return {
        ok: false,
        error: "SQLite customer payment save failed: " + (error instanceof Error ? error.message : String(error)) +
          ". Retry saving the existing payment; do not collect again.",
      };
    }
  };
  return {
    hasPending(): boolean { return pending !== null; },
    pendingPaymentId(): string | null { return pending?.paymentId ?? null; },
    async collect(input: TInput): Promise<DurableCollectionResult> {
      let inputFingerprint: string;
      try { inputFingerprint = fingerprint(input); }
      catch (error) { return { ok: false, error: "Cannot identify the collection request: " + (error instanceof Error ? error.message : String(error)) }; }
      if (saving || pending) return blocked();
      if (recovered?.fingerprint === inputFingerprint) {
        const receipt = recovered;
        recovered = null;
        return { ok: true, paymentId: receipt.paymentId };
      }
      saving = true;
      try {
        const result = createPayment(input);
        if (result.errors.length || !result.payment?.id) {
          return { ok: false, error: result.errors.join("; ") || "Collection did not return a payment identity." };
        }
        pending = { paymentId: result.payment.id, fingerprint: inputFingerprint };
        return await saveExisting();
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      } finally {
        saving = false;
      }
    },
    async retryPending(): Promise<DurableCollectionResult> {
      if (saving) return blocked();
      if (!pending) return { ok: false, error: "No unsaved customer payment exists." };
      saving = true;
      try { return await saveExisting(true); }
      finally { saving = false; }
    },
    /** Return a receipt once, for a form left open while a pending payment was saved manually. */
    consumeRecoveredPaymentId(): string | null {
      const value = recovered?.paymentId ?? null;
      recovered = null;
      return value;
    },
  };
}
