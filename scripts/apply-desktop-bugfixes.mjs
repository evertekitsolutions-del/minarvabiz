import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appPath = path.join(root, "apps/desktop/src/App.tsx");
const navPath = path.join(root, "packages/ui/src/lib/nav.ts");
const ipcPath = path.join(root, "apps/desktop/electron/main.ts");

function patch(file, replacements) {
  let text = fs.readFileSync(file, "utf8");
  for (const [from, to] of replacements) {
    if (!text.includes(from)) throw new Error(`Patch anchor not found in ${file}: ${from.slice(0, 100)}`);
    text = text.replace(from, to);
  }
  fs.writeFileSync(file, text);
}

patch(appPath, [
  [
    'import { store, ordersStore, phase5Store, phase6Store, phase7Store, scheduleAutoSave, getShopProfile, updateShopProfile, getTaxConfig, updateTaxConfig, getAutoBackupSettings, setAutoBackupSettings, recordBackupSuccess, recordBackupFailure, shouldRunAutoBackup, recordOrderQualityCheck, runAutomatedCustomerReminders } from "@minarvabiz/business-logic";',
    'import { store, ordersStore, phase5Store, phase6Store, phase7Store, scheduleAutoSave, getShopProfile, updateShopProfile, getTaxConfig, updateTaxConfig, getAutoBackupSettings, setAutoBackupSettings, recordBackupSuccess, recordBackupFailure, shouldRunAutoBackup, recordOrderQualityCheck, runAutomatedCustomerReminders, markNotificationRead, markAllNotificationsRead } from "@minarvabiz/business-logic";'
  ],
  [
    'header={{showSearch:view!=="dashboard",title:view==="services"?"Services & Orders":view,subtitle:"Welcome back, Admin!",notificationCount:phase6Store.unreadNotificationCount(),messageCount:phase6Store.unreadNotificationCount(),onMessagesClick:()=>navTo("notifications"),onNotificationsClick:()=>navTo("notifications"),onCalendarClick:()=>navTo("reports")}}>',
    'header={{showSearch:view!=="dashboard",title:view==="services"?"Services & Orders":view,subtitle:"Welcome back, Admin!",notificationCount:phase6Store.unreadNotificationCount(),messageCount:phase6Store.unreadNotificationCount(),onSearch:(query)=>{const q=query.trim().toLowerCase();if(!q){refreshAll();return;}setCustomers(store.listCustomers(query));setProducts(store.listProducts().filter(p=>[p.name,p.sku,p.barcode].some(v=>String(v??"").toLowerCase().includes(q))));setOrders(ordersStore.listOrders({query}));},onMessagesClick:()=>navTo("notifications"),onNotificationsClick:()=>navTo("notifications"),onCalendarClick:()=>navTo("reports")}}>'
  ],
  [
    '{view==="notifications"&&<NotificationCenter notifications={notifications}/>} ',
    '{view==="notifications"&&<NotificationCenter notifications={notifications} onMarkAllRead={()=>{markAllNotificationsRead();void persistAndRefresh();}} onMarkRead={(id)=>{markNotificationRead(id);void persistAndRefresh();}} onNavigate={(href)=>{const target:Record<string,NavItemId>={"/inventory":"products","/products":"products","/customers":"customers","/sales":"sales","/services":"services","/laundry":"laundry","/expenses":"expenses","/purchases":"purchases","/staff":"staff","/reports":"reports","/settings":"settings","/backup":"backup","/notifications":"notifications"};const id=target[href];if(id)navTo(id);}}/>} '
  ],
  [
    '{view==="reports"&&<ReportsPanel salesRows={reportSales} dayEnd={reportDayEnd} stock={reportStock} outstanding={reportOutstanding}/>} ',
    '{view==="reports"&&<ReportsPanel salesRows={reportSales} dayEnd={reportDayEnd} stock={reportStock} outstanding={reportOutstanding} onRefresh={()=>setModuleTick(v=>v+1)}/>} '
  ]
]);

patch(navPath, [
  ['  | "sms"\n', '']
]);

let ipc = fs.readFileSync(ipcPath, "utf8");
ipc = ipc.replace(/\n\s*ipcMain\.handle\(["']db:sqlitePath["'][\s\S]*?\n\s*\}\);/m, "");
fs.writeFileSync(ipcPath, ipc);

console.log("Desktop callback bugfixes applied successfully.");
