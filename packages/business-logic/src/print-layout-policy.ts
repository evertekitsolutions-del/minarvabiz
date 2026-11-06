/**
 * PLT/SAL-019 — optional, tenant-scoped print-layout configuration policy.
 * Original implementation; no third-party source copied.
 * A pure policy for Online/Offline/Hybrid hosts. Persistence, RBAC and printing
 * remain host responsibilities; never trust tenant/branch from renderer input.
 */
export type PrintDocument = "invoice" | "quotation" | "receipt" | "purchase_order";
export type PrintPaper = "a4" | "thermal-58" | "thermal-80";
export type PrintField = "business_name" | "branch_name" | "document_number" |
  "document_date" | "customer_name" | "items" | "subtotal" | "tax" | "total" |
  "payment_status" | "footer";
export interface PrintLayoutScope {
  readonly tenantId: string;
  readonly companyId: string;
  readonly branchId: string | null;
}
export interface PrintLayoutConfig extends PrintLayoutScope {
  readonly id: string;
  readonly document: PrintDocument;
  readonly paper: PrintPaper;
  readonly title: string;
  readonly fields: readonly PrintField[];
  readonly footer: string;
  readonly revision: number;
  readonly enabled: boolean;
}
export interface PrintLayoutMutation {
  readonly operationId: string;
  readonly expectedRevision: number | null;
  readonly value: PrintLayoutConfig;
}
export type PrintLayoutDecision =
  | { readonly status: "create" | "update"; readonly next: PrintLayoutConfig }
  | { readonly status: "replay"; readonly next: PrintLayoutConfig }
  | { readonly status: "conflict" | "denied"; readonly reason: string };

const documents = new Set<PrintDocument>(["invoice","quotation","receipt","purchase_order"]);
const papers = new Set<PrintPaper>(["a4","thermal-58","thermal-80"]);
const fields = new Set<PrintField>([
  "business_name","branch_name","document_number","document_date",
  "customer_name","items","subtotal","tax","total","payment_status","footer"
]);
const required = new Set<PrintField>(["document_number","items","total"]);
const safeId = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
function checkId(value: string, label: string): void {
  if (typeof value !== "string" || !safeId.test(value)) throw new Error("Invalid " + label);
}
function sameScope(a: PrintLayoutScope, b: PrintLayoutScope): boolean {
  return a.tenantId === b.tenantId && a.companyId === b.companyId &&
    a.branchId === b.branchId;
}
export function validatePrintLayout(config: PrintLayoutConfig): PrintLayoutConfig {
  checkId(config.id, "layout ID");
  checkId(config.tenantId, "tenant ID");
  checkId(config.companyId, "company ID");
  if (config.branchId !== null) checkId(config.branchId, "branch ID");
  if (!documents.has(config.document)) throw new Error("Unsupported document");
  if (!papers.has(config.paper)) throw new Error("Unsupported paper");
  if (!Number.isSafeInteger(config.revision) || config.revision < 1)
    throw new Error("Invalid revision");
  if (typeof config.enabled !== "boolean") throw new Error("Invalid enabled flag");
  if (typeof config.title !== "string" || config.title.trim().length < 1 ||
      config.title.length > 100 || /[<>\u0000-\u001f]/.test(config.title))
    throw new Error("Invalid print title");
  if (typeof config.footer !== "string" || config.footer.length > 500 ||
      /[<>\u0000-\u001f]/.test(config.footer))
    throw new Error("Invalid print footer");
  // Treat layout text as plain printable content, never as bidirectional controls.
  // These controls can visually reverse totals or invoice identifiers in previews.
  const forbiddenBidi = /[\u202a-\u202e\u2066-\u2069\u200e\u200f]/u;
  if (forbiddenBidi.test(config.title))
    throw new Error("Unsafe bidirectional print title");
  if (forbiddenBidi.test(config.footer))
    throw new Error("Unsafe bidirectional print footer");
  // Reject unpaired surrogates before persisting or printing malformed Unicode.
  const malformedUnicode = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u;
  if (malformedUnicode.test(config.title))
    throw new Error("Malformed print title");
  if (malformedUnicode.test(config.footer))
    throw new Error("Malformed print footer");
  if (!Array.isArray(config.fields) || config.fields.length > fields.size ||
      config.fields.some(f => !fields.has(f)) ||
      new Set(config.fields).size !== config.fields.length ||
      [...required].some(f => !config.fields.includes(f)))
    throw new Error("Invalid or incomplete print fields");
  if (config.paper !== "a4" && config.fields.includes("footer") && config.footer.length > 120)
    throw new Error("Thermal footer exceeds safe length");
  return { ...config, fields: [...config.fields] };
}
/**
 * Caller supplies authoritative scope and the committed operation ID of the
 * previous successful write. Host must persist config + operation ID atomically.
 * A branch layout may override a company layout; it cannot mutate that layout.
 */
export function decidePrintLayoutMutation(
  scope: PrintLayoutScope,
  mutation: PrintLayoutMutation,
  existing: PrintLayoutConfig | null,
  lastOperationId: string | null,
): PrintLayoutDecision {
  checkId(scope.tenantId, "authorized tenant");
  checkId(scope.companyId, "authorized company");
  if (scope.branchId !== null) checkId(scope.branchId, "authorized branch");
  checkId(mutation.operationId, "operation ID");
  if (!sameScope(scope, mutation.value) || (existing && !sameScope(scope, existing)))
    return { status: "denied", reason: "Scope mismatch" };
  if (existing && existing.id !== mutation.value.id)
    return { status: "conflict", reason: "Layout identity mismatch" };
  if (existing && lastOperationId === mutation.operationId)
    return { status: "replay", next: validatePrintLayout(existing) };
  if (mutation.expectedRevision !== (existing?.revision ?? null))
    return { status: "conflict", reason: "Stale layout revision" };
  const next = validatePrintLayout(mutation.value);
  if (next.revision !== (existing?.revision ?? 0) + 1)
    return { status: "conflict", reason: "Revision must advance by one" };
  return { status: existing ? "update" : "create", next };
}
/** Resolve exact branch first, then company fallback. Never cross tenant/company. */
export function resolvePrintLayout(
  scope: PrintLayoutScope, document: PrintDocument, candidates: readonly PrintLayoutConfig[],
): PrintLayoutConfig | null {
  checkId(scope.tenantId, "authorized tenant");
  checkId(scope.companyId, "authorized company");
  if (scope.branchId !== null) checkId(scope.branchId, "authorized branch");
  if (!documents.has(document)) throw new Error("Unsupported document");
  const matching = candidates.filter(c => c.enabled && c.document === document &&
    c.tenantId === scope.tenantId && c.companyId === scope.companyId &&
    (c.branchId === scope.branchId || c.branchId === null));
  const selected = matching.find(c => scope.branchId !== null && c.branchId === scope.branchId)
    ?? matching.find(c => c.branchId === null);
  return selected ? validatePrintLayout(selected) : null;
}
