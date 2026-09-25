import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const migrationPath = path.join(repoRoot, "supabase/migrations/20260925_accounting_fk_indexes_batch1.sql");
const sql = fs.readFileSync(migrationPath, "utf8");

const expected = [
  ["idx_accounts_branch_id", "public.accounts", "branch_id"],
  ["idx_accounts_parent_id", "public.accounts", "parent_id"],
  ["idx_journal_entries_branch_id", "public.journal_entries", "branch_id"],
  ["idx_journal_entries_created_by", "public.journal_entries", "created_by"],
  ["idx_journal_entries_reversal_journal_id", "public.journal_entries", "reversal_journal_id"],
  ["idx_journal_entry_lines_org_id", "public.journal_entry_lines", "org_id"],
];

for (const [indexName, tableName, columnName] of expected) {
  const normalized = sql.replace(/\s+/g, " ");
  const fragment = `CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columnName})`;
  assert.ok(normalized.includes(fragment), `missing expected FK index: ${fragment}`);
}

assert.equal((sql.match(/CREATE INDEX IF NOT EXISTS/g) ?? []).length, expected.length);
assert.doesNotMatch(sql, /DROP\s+INDEX/i);
assert.doesNotMatch(sql, /ALTER\s+TABLE/i);

console.log("Accounting FK index batch 1 migration contract PASS");
