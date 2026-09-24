import assert from "node:assert/strict";
import fs from "node:fs";

const dataSource = fs.readFileSync(
  new URL("../../../../apps/web/src/lib/data-source.ts", import.meta.url),
  "utf8"
);
const appLayout = fs.readFileSync(
  new URL("../../../../apps/web/src/components/AppLayoutClient.tsx", import.meta.url),
  "utf8"
);

assert.match(dataSource, /export type SupabaseHydrationDomain/);
assert.match(dataSource, /supabaseHydrationDomainsForPath/);
assert.match(dataSource, /hydratedDomains = new Set<SupabaseHydrationDomain>/);
assert.match(dataSource, /domains = requested\.filter\(\(domain\) => !hydratedDomains\.has\(domain\)\)/);
assert.match(dataSource, /Requested Supabase domains are already hydrated/);

const dashboardRule = dataSource.slice(
  dataSource.indexOf("export function supabaseHydrationDomainsForPath"),
  dataSource.indexOf("export async function hydrateStoresFromSupabase")
);
assert.match(dashboardRule, /"\/dashboard", "\/laundry", "\/expenses"/);
assert.match(dashboardRule, /"\/dashboard", "\/staff"/);
assert.doesNotMatch(dashboardRule, /"\/dashboard", "\/warehouse"/);
assert.doesNotMatch(dashboardRule, /"\/dashboard", "\/accounting"/);

assert.match(dataSource, /if \(loadOperations\)/);
assert.match(dataSource, /if \(loadStaff\)/);
assert.match(dataSource, /if \(loadWarehouse\)/);
assert.match(dataSource, /if \(loadProcurement\)/);
assert.match(dataSource, /if \(loadAccounting\)/);
assert.match(dataSource, /if \(loadAccounting\) for \(const account of accountingStore\.listAccounts\(\)\)/);

assert.match(appLayout, /supabaseHydrationDomainsForPath\(pathname\)/);
assert.match(appLayout, /hydrateStoresFromSupabase\(token, domains\)/);
assert.match(appLayout, /\[pathname, refreshNotificationCount\]/);
assert.doesNotMatch(appLayout, /hydrateStoresFromSupabase\(token\)\.then/);

console.log("Supabase route-based lazy hydration contract tests passed");
