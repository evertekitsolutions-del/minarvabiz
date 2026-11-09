/* SPDX-License-Identifier: MIT
 * Copyright (c) 2025-2026 Open Mercato contributors
 * Source: open-mercato/open-mercato@69f0884009598b0ac034fee67f5dd34962434fa7
 * packages/core/src/modules/catalog/lib/optionSchemaTranslations.ts
 * Adaptation: replace donor-specific type import with equivalent local wire shape.
 * Complete MIT notice: ./LICENSE
 */
export type TranslatableFieldExpansion = { key: string; label: string; baseValue: string }

export const OPTION_SCHEMA_TEMPLATE_ENTITY_TYPE = 'catalog:catalog_option_schema_template'

export function optionLabelTranslationField(optionCode: string): string {
  return `options.${optionCode}.label`
}

export function optionChoiceLabelTranslationField(optionCode: string, choiceCode: string): string {
  return `options.${optionCode}.choices.${choiceCode}.label`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

export function expandOptionSchemaTranslationFields(record: Record<string, unknown>): TranslatableFieldExpansion[] {
  const schema = isRecord(record.schema) ? record.schema : null
  const options = schema && Array.isArray(schema.options) ? schema.options : []
  const expansions: TranslatableFieldExpansion[] = []
  const seen = new Set<string>()
  const push = (expansion: TranslatableFieldExpansion) => {
    if (seen.has(expansion.key)) return
    seen.add(expansion.key)
    expansions.push(expansion)
  }
  for (const option of options) {
    if (!isRecord(option)) continue
    const optionCode = nonEmptyText(option.code)
    if (!optionCode) continue
    const optionLabel = nonEmptyText(option.label) ?? optionCode
    push({
      key: optionLabelTranslationField(optionCode),
      label: optionLabel,
      baseValue: nonEmptyText(option.label) ?? '',
    })
    const choices = Array.isArray(option.choices) ? option.choices : []
    for (const choice of choices) {
      if (!isRecord(choice)) continue
      const choiceCode = nonEmptyText(choice.code)
      if (!choiceCode) continue
      const choiceLabel = nonEmptyText(choice.label)
      push({
        key: optionChoiceLabelTranslationField(optionCode, choiceCode),
        label: `${optionLabel} › ${choiceLabel ?? choiceCode}`,
        baseValue: choiceLabel ?? '',
      })
    }
  }
  return expansions
}
