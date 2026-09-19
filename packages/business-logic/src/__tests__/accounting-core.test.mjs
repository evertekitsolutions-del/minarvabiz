import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../accounting-store.ts", import.meta.url), "utf8");
const remote = fs.readFileSync(new URL("../remote-write.ts", import.meta.url), "utf8");
const types = fs.readFileSync(new URL("../../../types/src/index.ts", import.meta.url), "utf8");
const ui = fs.readFileSync(new URL("../../../ui/src/components/accounting/AccountingPanel.tsx", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../../../../supabase/migrations/20260919_accounting_core.sql", import.meta.url), "utf8");

assert.match(types, /interface AccountingAccount/);
assert.match(types, /interface JournalEntry/);
assert.match(types, /interface TrialBalanceRow/);
assert.match(source, /createJournalEntry/);
assert.match(source, /postJournalEntry/);
assert.match(source, /voidJournalEntry/);
assert.match(source, /buildTrialBalance/);
assert.match(source, /buildGeneralLedger/);
assert.match(source, /Journal is not balanced/);
assert.match(source, /Reversal of/);
assert.match(source, /remoteUpsertJournalEntry\(cloneEntry\(entry\)\)/);
assert.match(remote, /enqueueOutbox\("journal_entries"/);
assert.match(remote, /enqueueOutbox\("journal_entry_lines"/);
assert.match(ui, /Chart of Accounts/);
assert.match(ui, /Trial Balance/);
assert.match(ui, /General Ledger/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.accounts/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.journal_entries/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.journal_entry_lines/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /organization_members/);

console.log("Accounting core contract tests passed");
