/** Product CSV import/export with preflight validation and atomic rollback. */
import type { Product } from "@minarvabiz/types";
import * as store from "./store";
import { assertPermission } from "./permissions";
import { assertLimit } from "./feature-gates";
import * as phase9Store from "./phase9-store";
import * as phase5Store from "./phase5-store";
import { exportDomainSnapshotFull, importDomainSnapshot } from "./persistence";

export interface ProductCsvRow {
  name: string;
  sku?: string;
  barcode?: string;
  cost?: number;
  price?: number;
  stock?: number;
  min?: number;
  unit?: string;
}

function parseCsvRecord(line: string): string[] {
  const cols: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      cols.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (quoted) throw new Error("Unclosed quoted CSV field");
  cols.push(current.trim());
  return cols;
}


/** Parse records (not physical lines) so a quoted product name may contain CRLF. */
function readCsvRecords(source: string): Array<{ text: string; line: number }> {
  const records: Array<{ text: string; line: number }> = [];
  let quoted = false, current = "", startLine = 1, line = 1;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '"') {
      current += ch;
      if (quoted && source[i + 1] === '"') {
        current += source[++i];
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && source[i + 1] === "\n") i += 1;
      if (quoted) current += "\n";
      else {
        if (current.trim()) records.push({ text: current, line: startLine });
        current = "";
        startLine = line + 1;
      }
      line += 1;
      continue;
    }
    current += ch;
  }
  if (quoted) throw new Error("Row " + startLine + ": Unclosed quoted CSV field");
  if (current.trim()) records.push({ text: current, line: startLine });
  return records;
}

function csvNumber(value: string | undefined, field: string, line: number, errors: string[]): number {
  if (!value?.trim()) return 0;
  const raw = value.trim();
  const scale = field === "stock" || field === "min" ? 1000 : 100;
  const decimals = scale === 1000 ? 3 : 2;
  if (!(scale === 1000 ? /^\d+(?:\.\d{1,3})?$/ : /^\d+(?:\.\d{1,2})?$/).test(raw)) {
    errors.push("Row " + line + ": " + field + " must be a finite non-negative number with no more than " + decimals + " decimal places");
    return 0;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isSafeInteger(Math.round(parsed * scale))) {
    errors.push("Row " + line + ": " + field + " is outside the supported safe numeric range");
    return 0;
  }
  return parsed;
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Neutralize spreadsheet formulas in untrusted product text before CSV quoting. */
function safeProductSpreadsheetText(value: unknown): string {
  const raw = String(value ?? "");
  return /^[\s\uFEFF]*[=+\-@]/u.test(raw) ? "'" + raw : raw;
}

export function exportProductsCsv(products: Product[] = store.listProducts()): string {
  const header = ["name", "sku", "barcode", "cost", "price", "stock", "min", "unit"];
  const lines = products.map((p) => [
    safeProductSpreadsheetText(p.name),
    safeProductSpreadsheetText(p.sku ?? ""),
    safeProductSpreadsheetText(p.barcode ?? ""),
    p.costPrice ?? 0,
    p.sellingPrice ?? 0,
    p.stockQuantity ?? 0,
    p.minimumStock ?? 0,
    safeProductSpreadsheetText(p.unit ?? "pcs"),
  ].map(csvCell).join(","));
  return [header.join(","), ...lines].join("\n");
}

const PRODUCT_CSV_COLUMNS = ["name", "sku", "barcode", "cost", "price", "stock", "min", "unit"] as const;
const MAX_PRODUCT_CSV_CHARS = 10 * 1024 * 1024;
const MAX_PRODUCT_CSV_ROWS = 50_000;

export function parseProductCsv(text: string): {
  rows: ProductCsvRow[];
  errors: string[];
} {
  // Bound parser and bulk-import memory before allocating records or snapshots.
  if (text.length > MAX_PRODUCT_CSV_CHARS) {
    return { rows: [], errors: ["Product CSV exceeds 10 Mi characters"] };
  }
  const errors: string[] = [];
  let records: Array<{ text: string; line: number }>;
  try {
    records = readCsvRecords(text.replace(/^\uFEFF/, ""));
  } catch (error) {
    return { rows: [], errors: [error instanceof Error ? error.message : String(error)] };
  }
  if (records.length < 2) return { rows: [], errors: ["CSV needs header + rows"] };
  if (records.length > MAX_PRODUCT_CSV_ROWS + 1) {
    return { rows: [], errors: ["Product CSV exceeds 50,000 rows"] };
  }

  let header: string[];
  try {
    header = parseCsvRecord(records[0].text).map(h => h.toLowerCase().trim());
  } catch (error) {
    return { rows: [], errors: ["Header: " + (error instanceof Error ? error.message : String(error))] };
  }
  if (new Set(header).size !== header.length) errors.push("Header: duplicate column names are not allowed");
  if (!header.includes("name")) errors.push("Missing name column");
  for (const column of header) {
    if (!(PRODUCT_CSV_COLUMNS as readonly string[]).includes(column)) {
      errors.push("Header: unsupported column " + column + " (only product master and opening stock fields are allowed)");
    }
  }
  if (errors.length) return { rows: [], errors };

  const idx = (name: string) => header.indexOf(name);
  const rows: ProductCsvRow[] = [];
  const rowLines: number[] = [];
  const seenSku = new Set<string>();
  const seenBarcode = new Set<string>();
  for (const record of records.slice(1)) {
    const number = record.line;
    let cols: string[];
    try { cols = parseCsvRecord(record.text); }
    catch (error) {
      errors.push("Row " + number + ": " + (error instanceof Error ? error.message : String(error)));
      continue;
    }
    if (cols.length !== header.length) {
      errors.push("Row " + number + ": expected " + header.length + " columns but found " + cols.length);
      continue;
    }
    const name = cols[idx("name")]?.trim();
    if (!name) { errors.push("Row " + number + ": empty name"); continue; }
    const sku = idx("sku") >= 0 ? cols[idx("sku")]?.trim() || undefined : undefined;
    const barcode = idx("barcode") >= 0 ? cols[idx("barcode")]?.trim() || undefined : undefined;
    if (sku) {
      const key = sku.toLowerCase();
      if (seenSku.has(key)) errors.push("Row " + number + ": duplicate SKU " + sku + " in CSV");
      seenSku.add(key);
    }
    if (barcode) {
      if (seenBarcode.has(barcode)) errors.push("Row " + number + ": duplicate barcode " + barcode + " in CSV");
      seenBarcode.add(barcode);
    }
    const numeric = (field: string) => csvNumber(idx(field) >= 0 ? cols[idx(field)] : undefined, field, number, errors);
    const cost = numeric("cost"), price = numeric("price"), stock = numeric("stock"), min = numeric("min");
    if (stock > 0 && !Number.isSafeInteger(Math.round(stock * cost * 100))) {
      errors.push("Row " + number + ": opening stock value is outside the supported safe amount");
    }
    rows.push({ name, sku, barcode, cost, price, stock, min,
      unit: idx("unit") >= 0 ? cols[idx("unit")]?.trim() || "pcs" : "pcs" });
    rowLines.push(number);
  }
  const existing = [...store.listProducts(), ...store.listArchivedProducts()];
  const existingSku = new Set(existing.map(p => p.sku?.toLowerCase()).filter(Boolean));
  const existingBarcode = new Set(existing.map(p => p.barcode).filter(Boolean));
  rows.forEach((row, index) => {
    const number = rowLines[index];
    if (row.sku && existingSku.has(row.sku.toLowerCase())) errors.push("Row " + number + ": SKU " + row.sku + " already exists");
    if (row.barcode && existingBarcode.has(row.barcode)) errors.push("Row " + number + ": barcode " + row.barcode + " already exists");
  });
  return { rows, errors };
}

export function importProductsFromCsv(text: string): { created: number; errors: string[] } {
  const { rows, errors } = parseProductCsv(text);
  if (errors.length) return { created: 0, errors };
  if (!rows.length) return { created: 0, errors: ["CSV contains no importable product rows"] };

  // A multi-row import must not bypass the same permission and licensed
  // capacity gates as individual product creation. Validate the whole batch
  // before taking a snapshot or queuing stock/accounting/remote writes.
  try {
    assertPermission("products.manage");
    const allowed = assertLimit("products");
    if (!allowed.allowed) return { created: 0, errors: [allowed.reason ?? "Product limit reached"] };
    const usage = phase9Store.usageSnapshot();
    const maxProducts = usage.limits.maxProducts;
    if (maxProducts >= 0 && usage.usage.products + rows.length > maxProducts) {
      return {
        created: 0,
        errors: [
          "Product plan limit: " + maxProducts + " allowed, " +
          usage.usage.products + " existing, " + rows.length + " proposed",
        ],
      };
    }
  } catch (error) {
    return { created: 0, errors: [error instanceof Error ? error.message : String(error)] };
  }

  const rollback = exportDomainSnapshotFull();
  let created = 0;
  try {
    for (const row of rows) {
      store.createProduct({
        name: row.name,
        sku: row.sku ?? null,
        barcode: row.barcode ?? null,
        unit: row.unit ?? "pcs",
        costPrice: row.cost ?? 0,
        sellingPrice: row.price ?? 0,
        stockQuantity: row.stock ?? 0,
        minimumStock: row.min ?? 0,
        isActive: true,
      } as Omit<Product, "id" | "createdAt" | "updatedAt" | "deletedAt" | "version">);
      created += 1;
    }
    return { created, errors: [] };
  } catch (error) {
    const restore = importDomainSnapshot(rollback);
    const message = error instanceof Error ? error.message : String(error);
    return {
      created: 0,
      errors: [
        restore.ok
          ? `Import failed and was rolled back safely: ${message}`
          : `Import failed: ${message}. Rollback failed: ${restore.error}`,
      ],
    };
  }
}


/**
 * First-customer migration: safe, previewable customer master CSV.
 * Only master fields are accepted; receivables, credit and sales must go
 * through their controlled financial migration and reconciliation.
 */
export interface CustomerCsvRow {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

const customerColumns = ["name", "phone", "email", "address", "notes"] as const;
const normalizeCustomerPhone = (value: string) => value.replace(/\D/g, "");
const normalizeCustomerEmail = (value: string) => value.trim().toLowerCase();
const customerPhoneValid = (value: string) =>
  value.length >= 7 && value.length <= 20 &&
  /^[+\d\s\-()]+$/.test(value) &&
  normalizeCustomerPhone(value).length >= 7;

export function parseCustomerCsv(text: string): { rows: CustomerCsvRow[]; errors: string[] } {
  if (text.length > 2 * 1024 * 1024) {
    return { rows: [], errors: ["Customer CSV exceeds 2 MB limit"] };
  }
  let records: ReturnType<typeof readCsvRecords>;
  try {
    records = readCsvRecords(text.replace(/^\uFEFF/, ""));
  } catch (error) {
    return { rows: [], errors: [error instanceof Error ? error.message : String(error)] };
  }
  if (records.length < 2) return { rows: [], errors: ["CSV needs header + rows"] };
  if (records.length > 5001) return { rows: [], errors: ["Customer CSV exceeds 5,000 rows"] };
  let header: string[];
  try {
    header = parseCsvRecord(records[0].text).map(field => field.trim().toLowerCase());
  } catch (error) {
    return { rows: [], errors: ["Header: " + (error instanceof Error ? error.message : String(error))] };
  }

  const errors: string[] = [];
  if (new Set(header).size !== header.length) errors.push("Header: duplicate column names");
  if (!header.includes("name")) errors.push("Missing name column");
  for (const column of header) {
    if (!(customerColumns as readonly string[]).includes(column)) {
      errors.push("Header: unsupported column " + column + " (financial fields cannot be imported here)");
    }
  }
  if (errors.length) return { rows: [], errors };

  const rows: CustomerCsvRow[] = [];
  const lines: number[] = [];
  const phones = new Set<string>();
  const emails = new Set<string>();
  for (const record of records.slice(1)) {
    let cols: string[];
    try {
      cols = parseCsvRecord(record.text);
    } catch (error) {
      errors.push("Row " + record.line + ": " + (error instanceof Error ? error.message : String(error)));
      continue;
    }
    if (cols.length !== header.length) {
      errors.push("Row " + record.line + ": expected " + header.length + " columns but found " + cols.length);
      continue;
    }
    const get = (column: typeof customerColumns[number]) =>
      header.includes(column) ? cols[header.indexOf(column)].trim() : "";
    const row: CustomerCsvRow = {
      name: get("name"),
      phone: get("phone") || undefined,
      email: get("email") || undefined,
      address: get("address") || undefined,
      notes: get("notes") || undefined,
    };
    if (!row.name || row.name.length > 500) errors.push("Row " + record.line + ": name must contain 1–500 characters");
    if (row.phone && !customerPhoneValid(row.phone)) errors.push("Row " + record.line + ": invalid phone number");
    if (row.email && (row.email.length > 255 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))) {
      errors.push("Row " + record.line + ": invalid email address");
    }
    if (row.address && row.address.length > 1000) errors.push("Row " + record.line + ": address exceeds 1,000 characters");
    if (row.notes && row.notes.length > 2000) errors.push("Row " + record.line + ": notes exceed 2,000 characters");
    if (row.phone) {
      const key = normalizeCustomerPhone(row.phone);
      if (phones.has(key)) errors.push("Row " + record.line + ": duplicate phone in CSV");
      phones.add(key);
    }
    if (row.email) {
      const key = normalizeCustomerEmail(row.email);
      if (emails.has(key)) errors.push("Row " + record.line + ": duplicate email in CSV");
      emails.add(key);
    }
    rows.push(row);
    lines.push(record.line);
  }
  const existing = [...store.listCustomers(), ...store.listArchivedCustomers()];
  const existingPhones = new Set(existing.filter(c => c.phone).map(c => normalizeCustomerPhone(c.phone!)));
  const existingEmails = new Set(existing.filter(c => c.email).map(c => normalizeCustomerEmail(c.email!)));
  rows.forEach((row, idx) => {
    if (row.phone && existingPhones.has(normalizeCustomerPhone(row.phone))) {
      errors.push("Row " + lines[idx] + ": phone already exists");
    }
    if (row.email && existingEmails.has(normalizeCustomerEmail(row.email))) {
      errors.push("Row " + lines[idx] + ": email already exists");
    }
  });
  return { rows, errors };
}

function safeCustomerCsvCell(value: unknown): string {
  let text = String(value ?? "");
  // Excel-compatible exports must not evaluate customer-submitted CSV formulas.
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
  return csvCell(text);
}

export function exportCustomersCsv(customers = store.listCustomers()): string {
  const lines = customers.map(customer => [
    safeCustomerCsvCell(customer.name),
    // Phone is constrained to punctuation/digits by validation. +country code
    // is a legitimate phone prefix, not a spreadsheet formula to rewrite.
    csvCell(customer.phone),
    csvCell(customer.email),
    safeCustomerCsvCell(customer.address),
    safeCustomerCsvCell(customer.notes),
  ].join(","));
  return [customerColumns.join(","), ...lines].join("\n");
}

export function importCustomersFromCsv(text: string): { created: number; errors: string[] } {
  const preview = parseCustomerCsv(text);
  if (preview.errors.length) return { created: 0, errors: preview.errors };
  if (!preview.rows.length) return { created: 0, errors: ["CSV contains no customer rows"] };

  try {
    // Enforce the same RBAC and plan gate as single-customer creation.
    assertPermission("customers.manage");
    const limit = assertLimit("customers");
    if (!limit.allowed) return { created: 0, errors: [limit.reason ?? "Customer limit reached"] };
    // A single-customer limit check is insufficient for a bulk operation.
    // Refuse the entire batch before any remote or local outbox writes.
    const usage = phase9Store.usageSnapshot();
    const ceiling = usage.limits.maxCustomers;
    if (ceiling >= 0 && usage.usage.customers + preview.rows.length > ceiling) {
      return { created: 0, errors: [
        "Customer plan limit: " + ceiling + " allowed, " + usage.usage.customers +
        " existing, " + preview.rows.length + " proposed",
      ] };
    }
  } catch (error) {
    return { created: 0, errors: [error instanceof Error ? error.message : String(error)] };
  }

  const rollback = exportDomainSnapshotFull();
  try {
    for (const row of preview.rows) {
      store.createCustomer({
        name: row.name,
        phone: row.phone ?? null,
        email: row.email ?? null,
        address: row.address ?? null,
        notes: row.notes ?? null,
      });
    }
    return { created: preview.rows.length, errors: [] };
  } catch (error) {
    const restored = importDomainSnapshot(rollback);
    const message = error instanceof Error ? error.message : String(error);
    return { created: 0, errors: [
      restored.ok ? "Customer CSV import failed and local snapshot rolled back: " + message
        : "Customer CSV import failed: " + message + ". Snapshot recovery also failed: " + restored.error,
    ] };
  }
}


/**
 * First-customer supplier master onboarding.
 * Deliberately excludes opening balances/payables: financial opening migration
 * requires separate reconciled postings and cannot be silently CSV-created.
 */
export interface SupplierCsvRow {
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  address?: string;
  category: "general" | "materials" | "laundry";
  notes?: string;
}

const supplierColumns = ["name", "company", "phone", "email", "address", "category", "notes"] as const;
const supplierIdentity = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
const supplierNameKey = (name: string, company?: string | null) =>
  JSON.stringify([supplierIdentity(name), supplierIdentity(company ?? "")]);

export function parseSupplierCsv(text: string): { rows: SupplierCsvRow[]; errors: string[] } {
  if (text.length > 2 * 1024 * 1024) {
    return { rows: [], errors: ["Supplier CSV exceeds 2 MB limit"] };
  }
  let records: ReturnType<typeof readCsvRecords>;
  try {
    records = readCsvRecords(text.replace(/^\uFEFF/, ""));
  } catch (error) {
    return { rows: [], errors: [error instanceof Error ? error.message : String(error)] };
  }
  if (records.length < 2) return { rows: [], errors: ["CSV needs header + rows"] };
  if (records.length > 5001) return { rows: [], errors: ["Supplier CSV exceeds 5,000 rows"] };

  let header: string[];
  try {
    header = parseCsvRecord(records[0].text).map(field => field.trim().toLowerCase());
  } catch (error) {
    return { rows: [], errors: ["Header: " + (error instanceof Error ? error.message : String(error))] };
  }
  const errors: string[] = [];
  if (new Set(header).size !== header.length) errors.push("Header: duplicate column names");
  if (!header.includes("name")) errors.push("Missing name column");
  for (const field of header) {
    if (!(supplierColumns as readonly string[]).includes(field)) {
      errors.push("Header: unsupported column " + field + " (balances and payables require separate reconciliation)");
    }
  }
  if (errors.length) return { rows: [], errors };

  const rows: SupplierCsvRow[] = [];
  const physicalLines: number[] = [];
  const phones = new Set<string>(), emails = new Set<string>(), names = new Set<string>();
  for (const record of records.slice(1)) {
    let cols: string[];
    try {
      cols = parseCsvRecord(record.text);
    } catch (error) {
      errors.push("Row " + record.line + ": " + (error instanceof Error ? error.message : String(error)));
      continue;
    }
    if (cols.length !== header.length) {
      errors.push("Row " + record.line + ": expected " + header.length + " columns but found " + cols.length);
      continue;
    }
    const get = (field: typeof supplierColumns[number]) =>
      header.includes(field) ? cols[header.indexOf(field)].trim() : "";
    const category = get("category") || "general";
    const row: SupplierCsvRow = {
      name: get("name"),
      company: get("company") || undefined,
      phone: get("phone") || undefined,
      email: get("email") || undefined,
      address: get("address") || undefined,
      category: category as SupplierCsvRow["category"],
      notes: get("notes") || undefined,
    };

    if (!row.name || row.name.length > 500) errors.push("Row " + record.line + ": name must contain 1–500 characters");
    if (row.company && row.company.length > 500) errors.push("Row " + record.line + ": company exceeds 500 characters");
    if (row.phone && !customerPhoneValid(row.phone)) errors.push("Row " + record.line + ": invalid phone number");
    if (row.email && (row.email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))) {
      errors.push("Row " + record.line + ": invalid email address");
    }
    if (row.address && row.address.length > 1000) errors.push("Row " + record.line + ": address exceeds 1,000 characters");
    if (row.notes && row.notes.length > 2000) errors.push("Row " + record.line + ": notes exceed 2,000 characters");
    if (!["general", "materials", "laundry"].includes(category)) {
      errors.push("Row " + record.line + ": unsupported supplier category " + category);
    }
    const nameKey = supplierNameKey(row.name, row.company);
    if (names.has(nameKey)) errors.push("Row " + record.line + ": duplicate supplier name/company in CSV");
    names.add(nameKey);
    if (row.phone) {
      const key = normalizeCustomerPhone(row.phone);
      if (phones.has(key)) errors.push("Row " + record.line + ": duplicate phone in CSV");
      phones.add(key);
    }
    if (row.email) {
      const key = normalizeCustomerEmail(row.email);
      if (emails.has(key)) errors.push("Row " + record.line + ": duplicate email in CSV");
      emails.add(key);
    }
    rows.push(row);
    physicalLines.push(record.line);
  }

  const existing = [...phase5Store.listSuppliers(), ...phase5Store.listArchivedSuppliers()];
  const existingNames = new Set(existing.map(s => supplierNameKey(s.name, s.company)));
  const existingPhones = new Set(existing.filter(s => s.phone).map(s => normalizeCustomerPhone(s.phone!)));
  const existingEmails = new Set(existing.filter(s => s.email).map(s => normalizeCustomerEmail(s.email!)));
  rows.forEach((row, index) => {
    const line = physicalLines[index];
    if (existingNames.has(supplierNameKey(row.name, row.company))) {
      errors.push("Row " + line + ": supplier name/company already exists");
    }
    if (row.phone && existingPhones.has(normalizeCustomerPhone(row.phone))) {
      errors.push("Row " + line + ": supplier phone already exists");
    }
    if (row.email && existingEmails.has(normalizeCustomerEmail(row.email))) {
      errors.push("Row " + line + ": supplier email already exists");
    }
  });
  return { rows, errors };
}

export function exportSuppliersCsv(suppliers = phase5Store.listSuppliers()): string {
  const lines = suppliers.map(supplier => [
    safeCustomerCsvCell(supplier.name),
    safeCustomerCsvCell(supplier.company),
    // Preserve valid international +country prefixes; safely quote legacy invalid values.
    supplier.phone && customerPhoneValid(supplier.phone)
      ? csvCell(supplier.phone) : safeCustomerCsvCell(supplier.phone),
    safeCustomerCsvCell(supplier.email),
    safeCustomerCsvCell(supplier.address),
    safeCustomerCsvCell(supplier.category),
    safeCustomerCsvCell(supplier.notes),
  ].join(","));
  return [supplierColumns.join(","), ...lines].join("\n");
}

export function importSuppliersFromCsv(text: string): { created: number; errors: string[] } {
  // Re-parse on confirmation; never trust a stale read-only preview.
  const preview = parseSupplierCsv(text);
  if (preview.errors.length) return { created: 0, errors: preview.errors };
  if (!preview.rows.length) return { created: 0, errors: ["CSV contains no supplier rows"] };
  try {
    assertPermission("purchases.manage");
  } catch (error) {
    return { created: 0, errors: [error instanceof Error ? error.message : String(error)] };
  }
  const rollback = exportDomainSnapshotFull();
  try {
    for (const row of preview.rows) {
      phase5Store.createSupplier({
        name: row.name,
        company: row.company ?? null,
        phone: row.phone ?? null,
        email: row.email ?? null,
        address: row.address ?? null,
        category: row.category,
        notes: row.notes ?? null,
        openingBalance: 0,
      });
    }
    return { created: preview.rows.length, errors: [] };
  } catch (error) {
    const restored = importDomainSnapshot(rollback);
    const message = error instanceof Error ? error.message : String(error);
    return { created: 0, errors: [
      restored.ok ? "Supplier CSV import failed and local snapshot rolled back: " + message
        : "Supplier CSV import failed: " + message + ". Snapshot recovery also failed: " + restored.error,
    ] };
  }
}
