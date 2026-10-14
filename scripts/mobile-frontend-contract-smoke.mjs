import assert from "node:assert/strict";
import fs from "node:fs";

const source = (path) => fs.readFileSync(path, "utf8");
const shell = source("packages/ui/src/components/layout/AppShell.tsx");
const header = source("packages/ui/src/components/layout/Header.tsx");
const web = source("apps/web/src/components/AppLayoutClient.tsx");

// Mobile navigation must expose real routes, reachable buttons, an active-page
// indicator and a discoverable full-menu escape hatch on a small viewport.
assert.match(shell, /aria-label="Mobile quick navigation"/);
assert.match(shell, /aria-current=\{active \? "page" : undefined\}/);
assert.match(shell, /md:hidden/);
for (const route of ["/dashboard", "/sales", "/products", "/customers"]) {
  assert.ok(shell.includes(route), `Mobile quick navigation must link to ${route}`);
}
assert.match(shell, /aria-label="More modules"/);
assert.match(shell, /aria-expanded=\{mobileOpen\}/);
assert.match(shell, /setMobileOpen\(true\)/);
assert.match(shell, /safe-area-inset-bottom/);

// Mobile global search must be keyboard-accessible and use the same callback
// as desktop search. Never bypass the normal authenticated app shell.
assert.match(header, /aria-label="Search records"/);
assert.match(header, /aria-expanded=\{mobileSearchOpen\}/);
assert.match(header, /id="mobile-record-search"/);
assert.match(header, /aria-label="Search customers, orders, products and invoices on mobile"/);
assert.match(header, /onSearch\?\.\(e\.target\.value\)/);
assert.match(header, /event\.key === "Escape"/);
assert.match(web, /showSearch:\s*true/);
console.log("Frontend mobile navigation and search contract PASS");
