/**
 * Exact money draft validation before creating/editing staff records.
 * Zero salary is allowed when explicitly entered, but a blank field is not.
 */
export function parseStaffSalaryDraft(raw: string): number {
  const value = raw.trim();
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(value)) {
    throw new Error("Staff salary must be a non-negative amount with up to two decimal places.");
  }
  const amount = Number(value);
  const minor = Math.round(amount * 100);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(minor)) {
    throw new Error("Staff salary is outside the supported monetary range.");
  }
  return minor / 100;
}
