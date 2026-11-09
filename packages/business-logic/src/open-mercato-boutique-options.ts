/**
 * MIT adaptation of Open Mercato catalog/components/products/variantForm.ts
 * from open-mercato/open-mercato@69f0884009598b0ac034fee67f5dd34962434fa7
 * Original copyright (c) 2025-2026 Open Mercato contributors.
 * License retained at vendor/mit-donors/open-mercato/LICENSE.
 *
 * Option normalization is pure/deterministic; UI offers searchable input and
 * user-entered values, but persistence is strictly via Supabase tenant RPC.
 */
export interface BoutiqueOptionDefinition {
  id: string;
  code: "brand" | "fabric" | "color" | "size";
  label: string;
  values: Array<{ id: string; label: string }>;
}

const labels = { brand: "Brand", fabric: "Fabric", color: "Color", size: "Size" } as const;
const codes = Object.keys(labels) as Array<keyof typeof labels>;
const standardValues: Record<keyof typeof labels, string[]> = {
  brand: [], fabric: [], color: [], size: ["S", "M", "L", "XL"],
};

function extractString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

/** Adapted from Open Mercato normalizeOptionSchema and option normalization. */
export function normalizeBoutiqueOptions(raw: unknown): BoutiqueOptionDefinition[] {
  const incoming = Array.isArray(raw) ? raw : [];
  return codes.map(code => {
    const entry = incoming.find(value =>
      value && typeof value === "object" && "code" in value &&
      extractString((value as { code: unknown }).code).toLowerCase() === code) as
      { values?: unknown } | undefined;
    const fromSource = Array.isArray(entry?.values)
      ? entry.values.map(value => {
        const item = value && typeof value === "object" ? value as { label?: unknown } : null;
        return extractString(item?.label);
      }) : [];
    const unique = new Map<string, string>();
    for (const value of [...standardValues[code], ...fromSource]) {
      const label = extractString(value).slice(0, 120);
      if (label) unique.set(label.toLocaleLowerCase("en"), label);
    }
    return {
      id: code, code, label: labels[code],
      values: [...unique.values()].map(label => ({ id: label, label })),
    };
  });
}

export const BOUTIQUE_OPTION_SCHEMA = normalizeBoutiqueOptions([]);
