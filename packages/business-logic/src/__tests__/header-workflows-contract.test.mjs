import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const nav = read("packages/ui/src/lib/nav.ts");
const desktop = read("apps/desktop/src/App.tsx");
const web = read("apps/web/src/components/AppLayoutClient.tsx");
const notifications = read("packages/ui/src/components/notifications/NotificationCenter.tsx");
const messages = read("packages/ui/src/components/notifications/CustomerMessagesPanel.tsx");
const agenda = read("packages/ui/src/components/agenda/BusinessAgenda.tsx");
const offline = read("packages/ui/src/components/desktop/OfflineModulesPanel.tsx");

assert.match(nav, /id: "notifications", label: "Alerts & Notifications"/);
assert.match(nav, /id: "messages", label: "Customer Messages"/);
assert.match(nav, /id: "agenda", label: "Business Agenda"/);

assert.match(desktop, /onMessagesClick:\(\)=>navTo\("messages"\)/);
assert.match(desktop, /onNotificationsClick:\(\)=>navTo\("notifications"\)/);
assert.match(desktop, /onCalendarClick:\(\)=>navTo\("agenda"\)/);
assert.match(desktop, /listCustomerCommunicationQueue\(\).*status==="pending".*status==="failed"/);

assert.match(web, /router\.push\("\/messages"\)/);
assert.match(web, /router\.push\("\/notifications"\)/);
assert.match(web, /router\.push\("\/agenda"\)/);
assert.match(web, /messageCount: messageAttentionCount/);

assert.doesNotMatch(notifications, /CustomerCommunicationCenter/);
assert.match(messages, /CustomerCommunicationCenter/);
assert.match(offline, /activeNav === "messages"/);
assert.match(offline, /activeNav === "agenda"/);
assert.match(agenda, /Overdue/);
assert.match(agenda, /Due today/);
assert.match(agenda, /Next 7 days/);
assert.match(agenda, /Ready to deliver/);

console.log("Header alerts/messages/agenda contract PASS");
