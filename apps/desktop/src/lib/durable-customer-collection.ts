/** Keep customer payment mutations pending until native SQLite confirms the full snapshot. */
export function createDurableCustomerCollection<TInput, TPayment extends { id: string }>(
  createPayment: (input: TInput) => { payment: TPayment | null; errors: string[] },
  persist: () => Promise<boolean>,
) {
  let pending: { paymentId: string } | null = null;
  let saving = false;
  const failure = (error: string) => ({ ok: false as const, error });
  async function savePending() {
    if (!pending) return failure("No unsaved customer payment exists.");
    try {
      if (!await persist()) return failure("SQLite did not confirm the customer payment. The same payment is pending; retry saving it before collecting again.");
      const paymentId = pending.paymentId;
      pending = null;
      return { ok: true as const, paymentId };
    } catch (error) {
      return failure("SQLite customer payment save failed: " + (error instanceof Error ? error.message : String(error)) + ". Retry the existing payment; do not collect again.");
    }
  }
  return {
    hasPending: () => pending !== null,
    async collect(input: TInput) {
      if (saving || pending) return failure("An earlier customer payment is not saved. Retry saving it before collecting again.");
      saving = true;
      try {
        const result = createPayment(input);
        if (result.errors.length || !result.payment?.id) return failure(result.errors.join("; ") || "Payment creation returned no identity.");
        pending = { paymentId: result.payment.id };
        return await savePending();
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      } finally {
        saving = false;
      }
    },
    async retryPending() {
      if (saving || !pending) return failure("No retryable customer payment exists.");
      saving = true;
      try { return await savePending(); }
      finally { saving = false; }
    },
  };
}
