/**
 * Shared, industry-neutral custom field validation boundary.
 * This is a pure domain preflight; callers must enforce authoritative RBAC,
 * tenant-scoped schema lookup, audit and persistence separately.
 */
export type CustomFieldKind = "text" | "number" | "boolean" | "date" | "choice";
export type CustomFieldDefinition = Readonly<{
  key: string;
  kind: CustomFieldKind;
  required?: boolean;
  choices?: readonly string[];
  maxLength?: number;
}>;
export type CustomFieldValue = string | number | boolean | null;
const KEY = /^[a-z][a-z0-9_]{0,63}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"]);

export function validateCustomFieldValues(
  definitions: readonly CustomFieldDefinition[],
  submitted: Readonly<Record<string, unknown>>,
): Readonly<Record<string, CustomFieldValue>> {
  if (!Array.isArray(definitions) || definitions.length > 128) throw new Error("Invalid custom field schema");
  if (submitted === null || typeof submitted !== "object" || Array.isArray(submitted)) {
    throw new Error("Invalid custom field payload");
  }
  const seen = new Set<string>();
  for (const field of definitions) {
    if (!field || typeof field.key !== "string" || !KEY.test(field.key) || FORBIDDEN.has(field.key) || seen.has(field.key)) {
      throw new Error("Invalid or duplicate custom field key");
    }
    seen.add(field.key);
    if (!["text", "number", "boolean", "date", "choice"].includes(field.kind)) throw new Error("Invalid custom field kind");
    if (field.maxLength !== undefined && (!Number.isSafeInteger(field.maxLength) || field.maxLength < 1 || field.maxLength > 4096 || field.kind !== "text")) {
      throw new Error("Invalid custom field length");
    }
    if (field.kind === "choice") {
      if (!Array.isArray(field.choices) || field.choices.length === 0 || field.choices.length > 100 ||
          field.choices.some(v => typeof v !== "string" || !v || v.length > 128) ||
          new Set(field.choices).size !== field.choices.length) throw new Error("Invalid custom field choices");
    } else if (field.choices !== undefined) throw new Error("Unexpected custom field choices");
  }
  const keys = Object.keys(submitted);
  if (keys.length > 128) throw new Error("Too many custom fields");
  const result: Record<string, CustomFieldValue> = Object.create(null);
  for (const key of keys) {
    if (!seen.has(key) || !Object.prototype.hasOwnProperty.call(submitted, key)) throw new Error("Unknown custom field");
    const field = definitions.find(d => d.key === key)!;
    const value = submitted[key];
    if (value === null || value === "") {
      if (field.required) throw new Error("Required custom field missing");
      result[key] = null;
      continue;
    }
    switch (field.kind) {
      case "text":
        if (typeof value !== "string" || value.length > (field.maxLength ?? 4096)) throw new Error("Invalid text custom field");
        break;
      case "number":
        if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Invalid number custom field");
        break;
      case "boolean":
        if (typeof value !== "boolean") throw new Error("Invalid boolean custom field");
        break;
      case "date": {
        if (typeof value !== "string" || !ISO_DATE.test(value)) throw new Error("Invalid date custom field");
        const [year, month, day] = value.split("-").map(Number);
        const parsed = new Date(Date.UTC(year, month - 1, day));
        if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
          throw new Error("Invalid date custom field");
        }
        break;
      }
      case "choice":
        if (typeof value !== "string" || !field.choices!.includes(value)) throw new Error("Invalid choice custom field");
        break;
    }
    result[key] = value as CustomFieldValue;
  }
  for (const field of definitions) {
    if (field.required && !Object.prototype.hasOwnProperty.call(result, field.key)) throw new Error("Required custom field missing");
  }
  return result;
}
