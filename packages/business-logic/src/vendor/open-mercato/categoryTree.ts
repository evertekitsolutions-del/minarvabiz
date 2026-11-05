/*!
 * Verbatim MIT source, Open Mercato contributors 2025–2026.
 * Upstream: https://github.com/open-mercato/open-mercato/blob/4374c48def1654927805c4b760f0e7f8648280f2/packages/core/src/modules/catalog/lib/categoryTree.ts
 * Full MIT license retained in THIRD_PARTY_NOTICES.md.
 */
export type CategoryTreeNode = {
  id: string
  name: string
  depth?: number
  pathLabel?: string
  isActive?: boolean
  selectable?: boolean
  children?: CategoryTreeNode[]
}

export function formatCategoryTreeLabel(name: string, depth: number): string {
  if (depth <= 0) return name
  const indent = '\u00A0'.repeat(Math.max(0, (depth - 1) * 2))
  return `${indent}↳ ${name}`
}
