/**
 * PLT-015: read-only company/branch balance consolidation.
 * Inputs must be authorised, posted ledger projections supplied by the host.
 * Never grants access or writes financial records.
 */
export type ScopedLedgerBalance = Readonly<{
  tenantId: string;
  companyId: string;
  branchId: string;
  currency: string;
  accountId: string;
  postedDebitMinor: number;
  postedCreditMinor: number;
}>;

export type ConsolidationScope = Readonly<{
  tenantId: string;
  companyIds: readonly string[];
  branchIds: readonly string[];
  currency: string;
}>;

export type ConsolidatedAccountBalance = Readonly<{
  accountId: string;
  debitMinor: number;
  creditMinor: number;
  netMinor: number;
}>;

const validId = (value: string): boolean =>
  typeof value === "string" && value.length > 0 && value.trim() === value &&
  !/[\u0000-\u001f]/.test(value);

const validMinor = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0;

function addSafe(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new RangeError("Ledger consolidation overflow");
  return result;
}

/**
 * Fails closed on any out-of-scope row, mixed currency, invalid amounts or
 * duplicate source scope/account rows. Caller must verify RBAC before loading rows.
 * Company-wide consolidation requires explicitly enumerated authorised branches.
 */
export function consolidatePostedAccountBalances(
  scope: ConsolidationScope,
  rows: readonly ScopedLedgerBalance[],
): ConsolidatedAccountBalance[] {
  if (!validId(scope.tenantId) || !validId(scope.currency) ||
      scope.companyIds.length === 0 || scope.branchIds.length === 0 ||
      !scope.companyIds.every(validId) || !scope.branchIds.every(validId) ||
      new Set(scope.companyIds).size !== scope.companyIds.length ||
      new Set(scope.branchIds).size !== scope.branchIds.length) {
    throw new Error("Invalid authorised consolidation scope");
  }
  const companies = new Set(scope.companyIds);
  const branches = new Set(scope.branchIds);
  const seen = new Set<string>();
  const totals = new Map<string, { debitMinor: number; creditMinor: number }>();
  for (const row of rows) {
    if (!validId(row.accountId) || !validId(row.companyId) || !validId(row.branchId) ||
        row.tenantId !== scope.tenantId || row.currency !== scope.currency ||
        !companies.has(row.companyId) || !branches.has(row.branchId) ||
        !validMinor(row.postedDebitMinor) || !validMinor(row.postedCreditMinor)) {
      throw new Error("Out-of-scope or invalid posted ledger projection");
    }
    const key = JSON.stringify([row.companyId, row.branchId, row.accountId]);
    if (seen.has(key)) throw new Error("Duplicate posted ledger projection");
    seen.add(key);
    const previous = totals.get(row.accountId) ?? { debitMinor: 0, creditMinor: 0 };
    totals.set(row.accountId, {
      debitMinor: addSafe(previous.debitMinor, row.postedDebitMinor),
      creditMinor: addSafe(previous.creditMinor, row.postedCreditMinor),
    });
  }
  return [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([accountId, totals]) => ({
    accountId,
    ...totals,
    netMinor: addSafe(totals.debitMinor, -totals.creditMinor),
  }));
}
