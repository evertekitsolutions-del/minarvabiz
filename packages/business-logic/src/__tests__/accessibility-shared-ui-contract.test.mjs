import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const modal = read("packages/ui/src/components/forms/Modal.tsx");
const shell = read("packages/ui/src/components/layout/AppShell.tsx");
const table = read("packages/ui/src/components/data/DataTable.tsx");
const header = read("packages/ui/src/components/layout/Header.tsx");
const sidebar = read("packages/ui/src/components/layout/Sidebar.tsx");
const toast = read("packages/ui/src/components/Toast.tsx");
const authGate = read("packages/ui/src/components/auth/AuthGate.tsx");
const errorBoundary = read("packages/ui/src/components/ErrorBoundary.tsx");
const search = read("packages/ui/src/components/search/GlobalSearchPalette.tsx");
const webLayout = read("apps/web/src/components/AppLayoutClient.tsx");

for (const token of [
  'href="#main-content"',
  'id="main-content"',
  'tabIndex={-1}',
  'h-[100dvh]',
  'Skip to main content',
]) assert.equal(shell.includes(token), true, `AppShell accessibility contract missing: ${token}`);

for (const token of [
  'event.key === "Escape"',
  'event.key === "Tab"',
  'previousFocusRef',
  'aria-modal="true"',
  'aria-labelledby={titleId}',
  'aria-label={\`Close ${title}\`}',
]) assert.equal(modal.includes(token), true, `Modal accessibility contract missing: ${token}`);

assert.match(table, /event\.key !== "Enter" && event\.key !== " "/);
assert.match(table, /tabIndex=\{onRowClick \? 0 : undefined\}/);
assert.doesNotMatch(table, /role=\{onRowClick \? "button" : undefined\}/);
assert.match(table, /Press Enter or Space to open/);
assert.match(table, /role="status"/);
assert.match(table, /aria-label="Rows per page"/);

assert.match(header, /aria-label="Search customers, orders, products and invoices"/);
assert.match(header, /if \(e\.key === "Escape"\)/);
assert.match(header, /Messages, \$\{messageCount\} need attention/);
assert.match(header, /Notifications, \$\{notificationCount\} unread/);

assert.match(sidebar, /aria-current=\{active \? "page" : undefined\}/);
assert.match(sidebar, /aria-label="Primary navigation"/);
assert.match(sidebar, /aria-label="Minarva Biz modules"/);

assert.match(toast, /aria-live="polite"/);
assert.match(toast, /role=\{t\.tone === "error" \? "alert" : "status"\}/);
assert.match(authGate, /role="status"/);
assert.match(authGate, /aria-busy="true"/);
assert.match(errorBoundary, /role="alert"/);
assert.match(errorBoundary, /aria-live="assertive"/);

assert.match(search, /role="region"/);
assert.match(search, /aria-live="polite"/);
assert.match(search, /Close global search results/);
assert.doesNotMatch(search, /role="listbox"/);

assert.match(webLayout, /if \(event\.key === "Escape"\)/);
assert.match(webLayout, /No matching records found\./);
assert.match(webLayout, /aria-label="Global search results"/);

console.log("Shared accessibility, keyboard and responsive UX contract PASS");
