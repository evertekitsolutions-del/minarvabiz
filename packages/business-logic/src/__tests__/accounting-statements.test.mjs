import assert from 'node:assert/strict';
import { calculateProfitAndLoss as pnl, calculateBalanceSheet as sheet } from '../accounting-statements.ts';

const accounts = [
  ['cash', 'asset'], ['payable', 'liability'], ['capital', 'equity'], ['sales', 'income'], ['expense', 'expense'],
].map(([id, type]) => ({ id, code: id, name: id, type, isActive: id !== 'expense' }));
const line = (accountId, debit = 0, credit = 0) => ({ accountId, debit, credit });
const journal = (entryDate, lines, status = 'posted') => ({ entryDate, lines, status });
const entries = [
  journal('2025-12-31', [line('cash', 1000), line('capital', 0, 1000)]),
  journal('2026-01-01', [line('cash', 200), line('sales', 0, 200)]),
  journal('2026-01-02', [line('expense', 50), line('payable', 0, 50)]),
  journal('2026-01-03', [line('expense', 20), line('cash', 0, 20)], 'void'),
  journal('2026-02-01', [line('cash', 20), line('expense', 0, 20)]),
  journal('2026-01-05', [line('cash', 999), line('sales', 0, 999)], 'draft'),
];
const january = pnl(accounts, entries, '2026-01-01', '2026-01-31');
assert.equal(january.totalIncome, 200);
assert.equal(january.totalExpenses, 70); // includes inactive account and void original before reversal
assert.equal(january.netProfit, 130);
const janSheet = sheet(accounts, entries, '2026-01-31');
assert.equal(janSheet.totalAssets, 1180);
assert.equal(janSheet.totalLiabilities, 50);
assert.equal(janSheet.recordedEquity, 1000);
assert.equal(janSheet.unclosedEarnings, 130);
assert.equal(janSheet.difference, 0);
assert.equal(janSheet.balanced, true);
assert.equal(pnl(accounts, entries, '2026-02-01', '2026-02-01').netProfit, 20);
assert.equal(sheet(accounts, entries, '2026-02-01').unclosedEarnings, 150);
assert.equal(sheet(accounts, entries, '2025-12-31').totalAssets, 1000);
assert.equal(sheet(accounts, [], '2026-01-31').balanced, true);
assert.equal(pnl(accounts, []).netProfit, 0);
const loss = [journal('2026-01-01', [line('expense', 20), line('cash', 0, 20)])];
assert.equal(pnl(accounts, loss).netProfit, -20);
assert.equal(sheet(accounts, loss).balanced, true);
// A closing entry transfers earnings to equity without double counting.
const closed = [...entries, journal('2026-02-28', [line('sales', 200), line('expense', 0, 50), line('capital', 0, 150)])];
assert.equal(sheet(accounts, closed).unclosedEarnings, 0);
assert.equal(sheet(accounts, closed).totalEquity, 1150);
assert.equal(sheet(accounts, closed).balanced, true);
const cents = Array.from({ length: 1000 }, () => journal('2026-01-01', [line('cash', .01), line('sales', 0, .01)]));
assert.equal(pnl(accounts, cents).netProfit, 10);
assert.equal(sheet(accounts, cents).difference, 0);
assert.equal(sheet(accounts, [journal('2026-01-01', [line('cash', 1)])]).balanced, false);
assert.throws(() => pnl(accounts, entries, '2026-02-01', '2026-01-01'), /start date/);
assert.throws(() => sheet(accounts, entries, '2026-02-30'), /valid statement date/);
assert.throws(() => sheet(accounts, [journal('2026-01-01', [line('missing', 1)])]), /unknown account/);
assert.throws(() => sheet(accounts, [journal('2026-01-01', [line('cash', Infinity)])]), /invalid journal amount/);
const saved = JSON.parse(JSON.stringify({ accounts, entries }));
assert.deepEqual(sheet(saved.accounts, saved.entries), sheet(accounts, entries));
console.log('Financial statements: periods, drafts, reversal dates, inactive accounts, losses, closing, cents, validation and state round-trip PASS');
