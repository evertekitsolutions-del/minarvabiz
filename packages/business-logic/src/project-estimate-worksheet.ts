/**
 * PRJ-006 — industry-neutral project estimate worksheet.
 * Original Minarva Biz source; no third-party code or dependencies.
 * Non-posting proposal: financial posting remains with the core ledger.
 */
export type ProjectEstimateKind = "labor" | "material" | "expense";
export interface ProjectEstimateLine {
  readonly id: string;
  readonly description: string;
  readonly kind: ProjectEstimateKind;
  readonly quantity: string;
  readonly unitCost: string;
  readonly markupPercent: string;
}
export interface ProjectEstimateInput {
  readonly tenantId: string;
  readonly companyId: string;
  readonly branchId: string;
  readonly projectId: string;
  readonly currency: string;
  readonly revision: number;
  readonly lines: readonly ProjectEstimateLine[];
}
export interface ProjectEstimateScope {
  readonly tenantId: string;
  readonly companyId: string;
  readonly branchId: string;
  readonly projectId: string;
  readonly canViewCosts: boolean;
}
export interface ProjectEstimateResult {
  readonly projectId: string;
  readonly revision: number;
  readonly currency: string;
  readonly costMinor: number;
  readonly proposedRevenueMinor: number;
  readonly grossMarginMinor: number;
  readonly lines: readonly { id: string; kind: ProjectEstimateKind; costMinor: number; proposedRevenueMinor: number }[];
}
function required(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 128) throw new Error("Invalid " + name);
  return value;
}
function decimal(raw: string, name: string, scale: number, maxWhole: number): bigint {
  if (typeof raw !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw)) throw new Error("Invalid " + name);
  const [whole, fraction = ""] = raw.split(".");
  if (whole.length > maxWhole || fraction.length > scale) throw new Error("Invalid " + name + " precision");
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, "0"));
}
function roundedDivide(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}
function safeMinor(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Estimate monetary total overflow");
  return Number(value);
}
/** Requires an authoritative host-validated scope; does not persist, approve, tax or post. */
export function calculateProjectEstimate(input: ProjectEstimateInput, scope: ProjectEstimateScope): ProjectEstimateResult {
  if (!scope.canViewCosts) throw new Error("Project cost permission denied");
  for (const key of ["tenantId", "companyId", "branchId", "projectId"] as const) {
    if (required(input[key], key) !== required(scope[key], key)) throw new Error("Project scope mismatch");
  }
  const currency = required(input.currency, "currency");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid currency code");
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new Error("Invalid estimate revision");
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 500) throw new Error("Estimate requires 1–500 lines");
  const seen = new Set<string>();
  let totalCost = 0n, totalRevenue = 0n;
  const lines = input.lines.map(line => {
    const id = required(line.id, "line ID");
    if (seen.has(id)) throw new Error("Duplicate estimate line ID");
    seen.add(id);
    if (!["labor", "material", "expense"].includes(line.kind)) throw new Error("Invalid estimate line kind");
    if (typeof line.description !== "string" || !line.description.trim() || line.description.length > 500) throw new Error("Invalid line description");
    const quantity = decimal(line.quantity, "quantity", 3, 6);
    const unitCost = decimal(line.unitCost, "unit cost", 2, 10);
    const markup = decimal(line.markupPercent, "markup", 2, 3);
    if (quantity === 0n || markup > 100000n) throw new Error("Invalid quantity or markup range");
    const cost = roundedDivide(quantity * unitCost, 1000n);
    const revenue = roundedDivide(cost * (10000n + markup), 10000n);
    totalCost += cost;
    totalRevenue += revenue;
    return Object.freeze({ id, kind: line.kind, costMinor: safeMinor(cost), proposedRevenueMinor: safeMinor(revenue) });
  });
  return Object.freeze({
    projectId: input.projectId, revision: input.revision, currency,
    costMinor: safeMinor(totalCost), proposedRevenueMinor: safeMinor(totalRevenue),
    grossMarginMinor: safeMinor(totalRevenue - totalCost), lines: Object.freeze(lines),
  });
}

/** Host adapter must atomically compare revision, persist the worksheet and append its audit event.
 * Implementations may use SQLite or a tenant-scoped remote transaction; no financial posting.
 */
export interface ProjectEstimateStore {
  saveAtomically(command: {
    readonly scope: Pick<ProjectEstimateInput, "tenantId" | "companyId" | "branchId" | "projectId">;
    readonly expectedRevision: number;
    readonly nextRevision: number;
    readonly idempotencyKey: string;
    readonly worksheet: ProjectEstimateInput;
    readonly totals: ProjectEstimateResult;
    readonly audit: { readonly actorId: string; readonly action: "project.estimate.saved"; readonly revision: number };
  }): Promise<"saved" | "replayed" | "conflict">;
}
export interface ProjectEstimateWriteScope extends ProjectEstimateScope {
  readonly canEditEstimates: boolean;
  readonly actorId: string;
}
export async function saveProjectEstimate(
  input: ProjectEstimateInput,
  scope: ProjectEstimateWriteScope,
  idempotencyKey: string,
  store: ProjectEstimateStore,
): Promise<{ readonly status: "saved" | "replayed"; readonly result: ProjectEstimateResult }> {
  if (!scope.canEditEstimates) throw new Error("Project estimate edit permission denied");
  const actorId = required(scope.actorId, "actor ID");
  const key = required(idempotencyKey, "idempotency key");
  const result = calculateProjectEstimate(input, scope);
  if (input.revision >= Number.MAX_SAFE_INTEGER) throw new Error("Estimate revision overflow");
  // Clone before invoking an untrusted async adapter: caller mutations must not alter the write.
  const worksheet: ProjectEstimateInput = {
    tenantId: input.tenantId, companyId: input.companyId, branchId: input.branchId,
    projectId: input.projectId, currency: input.currency, revision: input.revision,
    lines: input.lines.map(line => ({ ...line })),
  };
  const outcome = await store.saveAtomically({
    scope: { tenantId: input.tenantId, companyId: input.companyId, branchId: input.branchId, projectId: input.projectId },
    expectedRevision: input.revision, nextRevision: input.revision + 1,
    idempotencyKey: key, worksheet, totals: result,
    audit: { actorId, action: "project.estimate.saved", revision: input.revision + 1 },
  });
  if (outcome === "conflict") throw new Error("Project estimate revision conflict");
  if (outcome !== "saved" && outcome !== "replayed") throw new Error("Invalid estimate storage acknowledgement");
  return { status: outcome, result };
}

/** Export a reviewed estimate as an Excel-safe, UTF-8 CSV proposal.
 * This is a non-posting export; caller must enforce document download permissions.
 * Every source value is revalidated using the same scoped calculator.
 */
export function exportProjectEstimateCsv(input: ProjectEstimateInput, scope: ProjectEstimateScope): string {
  const totals = calculateProjectEstimate(input, scope);
  const cell = (value: string): string => {
    // Prefix formula-looking values, including after whitespace/control characters.
    const safe = /^[\s\u0000-\u001f]*[=+@-]/u.test(value) ? "'" + value : value;
    return '"' + safe.replace(/"/g, '""') + '"';
  };
  const rows: string[][] = [
    ["Line ID", "Description", "Type", "Quantity", "Unit cost", "Markup %", "Cost minor", "Proposed revenue minor", "Currency"],
    ...input.lines.map((line, i) => [
      line.id, line.description, line.kind, line.quantity, line.unitCost, line.markupPercent,
      String(totals.lines[i].costMinor), String(totals.lines[i].proposedRevenueMinor), totals.currency,
    ]),
    ["TOTAL", "", "", "", "", "", String(totals.costMinor), String(totals.proposedRevenueMinor), totals.currency],
  ];
  return "\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** Read-only loader for persisted estimates. The host must enforce RLS and return
 * a complete scoped worksheet; no caller-supplied permissions are authoritative.
 * Missing rows are represented by null, never by an empty invented estimate.
 */
export interface ProjectEstimateReader {
  loadScoped(scope: Pick<ProjectEstimateInput, "tenantId" | "companyId" | "branchId" | "projectId">): Promise<ProjectEstimateInput | null>;
}
export async function loadProjectEstimate(
  scope: ProjectEstimateScope,
  reader: ProjectEstimateReader,
): Promise<{ readonly worksheet: ProjectEstimateInput; readonly totals: ProjectEstimateResult } | null> {
  if (!scope.canViewCosts) throw new Error("Project cost permission denied");
  const ids = {
    tenantId: required(scope.tenantId, "tenantId"),
    companyId: required(scope.companyId, "companyId"),
    branchId: required(scope.branchId, "branchId"),
    projectId: required(scope.projectId, "projectId"),
  };
  const row = await reader.loadScoped(ids);
  if (row === null) return null;
  // Recompute totals; never trust cached monetary values or another tenant's row.
  const totals = calculateProjectEstimate(row, scope);
  const worksheet: ProjectEstimateInput = Object.freeze({
    ...ids, currency: row.currency, revision: row.revision,
    lines: Object.freeze(row.lines.map(line => Object.freeze({ ...line }))),
  });
  return Object.freeze({ worksheet, totals });
}
