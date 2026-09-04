import * as React from "react";
import {
  AppShell, Dashboard, CustomerList, ProductList, PosBilling, SalesList,
  OrderList, OrderForm, emptyOrderForm, OrderDetail, LaundryList, LaundryForm,
  ExpenseList, PurchaseList, StaffList, NotificationCenter, ReportsPanel,
  BackupPanel, SettingsPanel, Modal, Button, FormField, inputClass, selectClass,
  type QuickAction, type NavItemId, type DashboardData, type OrderFormValues,
} from "@minarvabiz/ui";
import { store, ordersStore, phase5Store, phase6Store, phase7Store, scheduleAutoSave, getShopProfile, updateShopProfile, getTaxConfig, updateTaxConfig, getAutoBackupSettings, setAutoBackupSettings } from "@minarvabiz/business-logic";
import type { Customer, Product, Category, Sale, CartLine, PaymentMethod, ServiceOrder, MeasurementProfile, ServiceType, OrderStatus, RoleName } from "@minarvabiz/types";
import { fetchDashboardData } from "./lib/dashboard-data";
import { bootstrapDesktopSqlite, persistDomainToSqlite } from "./lib/sqlite-bootstrap";

function ModuleCard({ title, description }: { title: string; description: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"><h2 className="text-xl font-semibold text-slate-900">{title}</h2><p className="mt-2 text-sm text-slate-500">{description}</p></div>;
}

export function App() {
  const [dbReady, setDbReady] = React.useState(false);
  const [dbError, setDbError] = React.useState<string | null>(null);
  const [activeNav, setActiveNav] = React.useState<NavItemId>("dashboard");
  const [dash, setDash] = React.useState<DashboardData | null>(null);
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [products, setProducts] = React.useState<Product[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [sales, setSales] = React.useState<Sale[]>([]);
  const [salesTab, setSalesTab] = React.useState<"pos" | "history">("pos");
  const [orders, setOrders] = React.useState<ServiceOrder[]>([]);
  const [profiles, setProfiles] = React.useState<MeasurementProfile[]>([]);
  const [orderQuery, setOrderQuery] = React.useState("");
  const [orderStatus, setOrderStatus] = React.useState<OrderStatus | null>(null);
  const [orderType, setOrderType] = React.useState<ServiceType | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [form, setForm] = React.useState<OrderFormValues>(emptyOrderForm());
  const [formError, setFormError] = React.useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = React.useState<ServiceOrder | null>(null);
  const [custOpen, setCustOpen] = React.useState(false);
  const [custForm, setCustForm] = React.useState({ name: "", phone: "", email: "" });
  const [lowStockOnly, setLowStockOnly] = React.useState(false);
  const [moduleTick, setModuleTick] = React.useState(0);
  const [laundryMode, setLaundryMode] = React.useState<"outsourced" | "in_house_ironing" | null>(null);
  const [laundryError, setLaundryError] = React.useState<string | null>(null);
  const [expenseOpen, setExpenseOpen] = React.useState(false);
  const [purchaseOpen, setPurchaseOpen] = React.useState(false);
  const [staffOpen, setStaffOpen] = React.useState(false);
  const [moduleError, setModuleError] = React.useState<string | null>(null);
  const [expenseForm, setExpenseForm] = React.useState({ categoryId: "", amount: "", paymentMethod: "cash" as PaymentMethod, description: "", reference: "", orderId: "" });
  const [purchaseForm, setPurchaseForm] = React.useState({ supplierId: "", description: "", amount: "", paidAmount: "", paymentMethod: "cash" as PaymentMethod, kind: "general" as "general" | "order_specific", orderId: "", notes: "" });
  const [staffForm, setStaffForm] = React.useState({ name: "", phone: "", email: "", role: "staff" as RoleName, salary: "", joiningDate: "", notes: "" });

  const refreshAll = React.useCallback(() => {
    setCustomers(store.listCustomers());
    setProducts(store.listProducts({ lowStockOnly }));
    setCategories(store.listCategories());
    setSales(store.listSales());
    setOrders(ordersStore.listOrders({ query: orderQuery || undefined, status: orderStatus ?? undefined, serviceType: orderType ?? undefined }));
    setModuleTick((v) => v + 1);
  }, [lowStockOnly, orderQuery, orderStatus, orderType]);

  const persistAndRefresh = React.useCallback(() => {
    refreshAll();
    try { persistDomainToSqlite(); } catch { scheduleAutoSave(250); }
  }, [refreshAll]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let i = 0; i < 50 && !window.minarvaDesktop; i++) await new Promise((r) => setTimeout(r, 20));
      if (!window.minarvaDesktop) { if (!cancelled) setDbError("Electron bridge missing. Reinstall Minarva Biz desktop."); return; }
      const result = await bootstrapDesktopSqlite();
      if (cancelled) return;
      if (!result.ok) { setDbError(result.error || "SQLite failed to initialize"); return; }
      setDbReady(true);
      fetchDashboardData().then(setDash);
    })();
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => { if (dbReady) refreshAll(); }, [dbReady, refreshAll]);
  React.useEffect(() => { if (dbReady) fetchDashboardData().then(setDash); }, [dbReady, moduleTick]);

  if (dbError) return <div style={{ padding: 32, fontFamily: "system-ui", maxWidth: 560 }}><h1>Database required</h1><p>Minarva Biz Offline cannot start without SQLite.</p><pre>{dbError}</pre></div>;
  if (!dbReady) return <div style={{ padding: 48, fontFamily: "system-ui", textAlign: "center" }}><p>Initializing SQLite database…</p></div>;

  const actions: QuickAction[] = [
    { id: "sale", label: "New Sale", description: "Create Invoice", icon: <span>🛒</span>, tone: "blue", onClick: () => { setActiveNav("sales"); setSalesTab("pos"); } },
    { id: "order", label: "New Order", description: "Tailoring Order", icon: <span>👗</span>, tone: "pink", onClick: () => { setActiveNav("services"); setCreateOpen(true); } },
  ];

  function handleSale(payload: { customerId: string | null; lines: CartLine[]; paidAmount: number; paymentMethod: PaymentMethod }) {
    const result = store.createSale(payload); if (result.errors.length) return { success: false, errors: result.errors }; persistAndRefresh(); return { success: true, invoiceNumber: result.sale.invoiceNumber };
  }

  function handleCreateOrder() {
    const price = form.serviceType === "tshirt_printing" ? form.tshirt.customerPrice : form.serviceType === "wholesale" || form.serviceType === "uniform" ? (parseFloat(form.unitPrice) || 0) * (parseInt(form.quantity, 10) || 1) : parseFloat(form.price) || 0;
    const result = ordersStore.createOrder({ customerId: form.customerId, serviceType: form.serviceType, deliveryDate: form.deliveryDate || null, price, discount: parseFloat(form.discount) || 0, advance: parseFloat(form.advance) || 0, notes: form.notes || null, materialDetails: form.materialDetails || null, customerSuppliedMaterial: form.customerSuppliedMaterial, shopSuppliedMaterial: form.shopSuppliedMaterial, measurements: form.measurements, measurementProfileId: form.measurementProfileId || null, externalMaterialCost: parseFloat(form.externalMaterialCost) || 0, quantity: parseInt(form.quantity, 10) || 1, unitPrice: parseFloat(form.unitPrice) || undefined, bulkDiscount: parseFloat(form.bulkDiscount) || 0, tshirt: form.serviceType === "tshirt_printing" ? form.tshirt : null });
    if (result.errors.length || !result.order) { setFormError(result.errors.join("; ") || "Failed"); return; }
    setCreateOpen(false); setForm(emptyOrderForm()); setFormError(null); persistAndRefresh(); setSelectedOrder(result.order);
  }

  function handleCreateLaundry(data: { customerId: string; garment: string; quantity: number; supplierId: string | null; supplierRate: number; customerRate: number; paidAmount: number; notes: string }) {
    if (!laundryMode) return;
    const result = phase5Store.createLaundryOrder({ ...data, mode: laundryMode, paymentMethod: "cash" });
    if (result.errors.length || !result.order) { setLaundryError(result.errors.join("; ") || "Failed to create laundry ticket"); return; }
    setLaundryMode(null); setLaundryError(null); persistAndRefresh();
  }

  function handleCreateExpense() {
    const result = phase5Store.createExpense({ categoryId: expenseForm.categoryId, amount: parseFloat(expenseForm.amount) || 0, paymentMethod: expenseForm.paymentMethod, description: expenseForm.description || null, reference: expenseForm.reference || null, orderId: expenseForm.orderId || null });
    if (result.errors.length || !result.expense) { setModuleError(result.errors.join("; ") || "Failed to create expense"); return; }
    setExpenseOpen(false); setModuleError(null); setExpenseForm({ categoryId: "", amount: "", paymentMethod: "cash", description: "", reference: "", orderId: "" }); persistAndRefresh();
  }

  function handleCreatePurchase() {
    const result = phase5Store.createPurchase({ supplierId: purchaseForm.supplierId || null, description: purchaseForm.description, amount: parseFloat(purchaseForm.amount) || 0, paymentMethod: purchaseForm.paymentMethod, paidAmount: parseFloat(purchaseForm.paidAmount) || 0, kind: purchaseForm.kind, orderId: purchaseForm.orderId || null, notes: purchaseForm.notes || null });
    if (result.errors.length || !result.purchase) { setModuleError(result.errors.join("; ") || "Failed to create purchase"); return; }
    setPurchaseOpen(false); setModuleError(null); setPurchaseForm({ supplierId: "", description: "", amount: "", paidAmount: "", paymentMethod: "cash", kind: "general", orderId: "", notes: "" }); persistAndRefresh();
  }

  function handleCreateStaff() {
    if (!staffForm.name.trim()) { setModuleError("Staff name is required"); return; }
    phase6Store.createStaff({ name: staffForm.name.trim(), phone: staffForm.phone || null, email: staffForm.email || null, role: staffForm.role, salary: parseFloat(staffForm.salary) || 0, joiningDate: staffForm.joiningDate || null, notes: staffForm.notes || null });
    setStaffOpen(false); setModuleError(null); setStaffForm({ name: "", phone: "", email: "", role: "staff", salary: "", joiningDate: "", notes: "" }); persistAndRefresh();
  }

  function saveSettings() {
    persistAndRefresh();
    setModuleTick((v) => v + 1);
  }

  const navTo = (id: NavItemId) => { setActiveNav(id); setSelectedOrder(null); };
  const laundry = phase5Store.listLaundryOrders();
  const expenses = phase5Store.listExpenses();
  const purchases = phase5Store.listPurchases();
  const staff = phase6Store.listStaff();
  const notifications = phase6Store.listNotifications();
  const reportSales = phase7Store.salesReport();
  const reportDayEnd = phase7Store.dayEndReport();
  const reportStock = phase7Store.stockReport();
  const reportOutstanding = phase7Store.outstandingPaymentsReport();
  const backups = phase7Store.listBackups();
  const suppliers = phase5Store.listSuppliers();
  const expenseCategories = phase5Store.listExpenseCategories();
  const profile = getShopProfile();
  const tax = getTaxConfig();
  const backupSettings = getAutoBackupSettings();

  return <AppShell activeNav={activeNav} onNavigate={(_href, id) => navTo(id)} sidebar={{ user: { name: "Admin", role: "Super Admin" }, logoSrc: "logo-mark.png" }} header={{ showSearch: activeNav !== "dashboard", title: activeNav === "services" ? "Services & Orders" : activeNav, subtitle: "Welcome back, Admin!", notificationCount: phase6Store.unreadNotificationCount(), messageCount: 3 }}>
    {activeNav === "dashboard" && dash && <Dashboard data={dash} quickActions={actions} />}
    {activeNav === "customers" && <><CustomerList customers={customers} onAdd={() => setCustOpen(true)} onSearch={(q) => setCustomers(store.listCustomers(q))} /><Modal open={custOpen} title="Add Customer" onClose={() => setCustOpen(false)} footer={<><Button variant="outline" onClick={() => setCustOpen(false)}>Cancel</Button><Button onClick={() => { const r = store.createCustomer(custForm); if (r) { setCustOpen(false); setCustForm({ name: "", phone: "", email: "" }); persistAndRefresh(); } }}>Save</Button></>}><div className="space-y-3"><FormField label="Name"><input className={inputClass} value={custForm.name} onChange={(e) => setCustForm({ ...custForm, name: e.target.value })} /></FormField><FormField label="Phone"><input className={inputClass} value={custForm.phone} onChange={(e) => setCustForm({ ...custForm, phone: e.target.value })} /></FormField></div></Modal></>}
    {activeNav === "sales" && <div className="space-y-4"><div className="flex gap-2"><Button variant={salesTab === "pos" ? "primary" : "outline"} onClick={() => setSalesTab("pos")}>New Sale</Button><Button variant={salesTab === "history" ? "primary" : "outline"} onClick={() => setSalesTab("history")}>History</Button></div>{salesTab === "pos" && <PosBilling products={products} customers={customers} onCompleteSale={handleSale} onFindByBarcode={(c) => store.getProductByBarcode(c)} />}{salesTab === "history" && <SalesList sales={sales} />}</div>}
    {activeNav === "services" && <><>{!selectedOrder && <OrderList orders={orders} onAdd={() => { setForm(emptyOrderForm()); setCreateOpen(true); }} onSearch={setOrderQuery} onFilterStatus={setOrderStatus} onFilterType={setOrderType} onSelect={setSelectedOrder} />}</><>{selectedOrder && <OrderDetail order={selectedOrder} onStatusChange={(s) => { const res = ordersStore.updateOrderStatus(selectedOrder.id, s); if (res.order) { setSelectedOrder(res.order); persistAndRefresh(); } }} onAddExpense={(d, a) => { const res = ordersStore.addOrderExpense(selectedOrder.id, d, a); if (res.order) { setSelectedOrder(res.order); persistAndRefresh(); } }} onClose={() => setSelectedOrder(null)} />}</><Modal open={createOpen} title="New Service Order" onClose={() => setCreateOpen(false)} className="max-w-2xl"><OrderForm customers={customers} profiles={profiles} value={form} onChange={setForm} onLoadProfiles={(id) => setProfiles(id ? ordersStore.listMeasurementProfiles(id) : [])} onSubmit={handleCreateOrder} onCancel={() => setCreateOpen(false)} error={formError} /></Modal></>}
    {activeNav === "laundry" && <><LaundryList key={moduleTick} orders={laundry} onAddOutsourced={() => { setLaundryError(null); setLaundryMode("outsourced"); }} onAddIroning={() => { setLaundryError(null); setLaundryMode("in_house_ironing"); }} /><Modal open={laundryMode !== null} title={laundryMode === "outsourced" ? "Outsourced Laundry" : "In-house Ironing"} onClose={() => setLaundryMode(null)} className="max-w-2xl"><LaundryForm mode={laundryMode || "in_house_ironing"} customers={customers} suppliers={suppliers} onSubmit={handleCreateLaundry} onCancel={() => setLaundryMode(null)} error={laundryError} /></Modal></>}
    {activeNav === "expenses" && <div className="space-y-6"><ExpenseList expenses={expenses} onAdd={() => { setModuleError(null); setExpenseOpen(true); }} /><PurchaseList purchases={purchases} onAdd={() => { setModuleError(null); setPurchaseOpen(true); }} /><Modal open={expenseOpen} title="Add Expense" onClose={() => setExpenseOpen(false)} className="max-w-xl"><div className="space-y-3"><FormField label="Category *"><select className={selectClass} value={expenseForm.categoryId} onChange={(e) => setExpenseForm({ ...expenseForm, categoryId: e.target.value })}><option value="">Select category</option>{expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></FormField><FormField label="Amount *"><input type="number" className={inputClass} value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} /></FormField><FormField label="Payment method"><select className={selectClass} value={expenseForm.paymentMethod} onChange={(e) => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value as PaymentMethod })}><option value="cash">Cash</option><option value="card">Card</option><option value="bank">Bank</option><option value="upi">UPI</option><option value="online">Online</option></select></FormField><FormField label="Description"><input className={inputClass} value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} /></FormField><FormField label="Reference"><input className={inputClass} value={expenseForm.reference} onChange={(e) => setExpenseForm({ ...expenseForm, reference: e.target.value })} /></FormField><FormField label="Order (optional)"><select className={selectClass} value={expenseForm.orderId} onChange={(e) => setExpenseForm({ ...expenseForm, orderId: e.target.value })}><option value="">General expense</option>{orders.map((o) => <option key={o.id} value={o.id}>{o.orderNumber} — {o.customerName || "Customer"}</option>)}</select></FormField>{moduleError && <p className="text-sm text-rose-600">{moduleError}</p>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setExpenseOpen(false)}>Cancel</Button><Button onClick={handleCreateExpense}>Save Expense</Button></div></div></Modal><Modal open={purchaseOpen} title="Add Purchase" onClose={() => setPurchaseOpen(false)} className="max-w-xl"><div className="space-y-3"><FormField label="Supplier"><select className={selectClass} value={purchaseForm.supplierId} onChange={(e) => setPurchaseForm({ ...purchaseForm, supplierId: e.target.value })}><option value="">No supplier</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></FormField><FormField label="Description *"><input className={inputClass} value={purchaseForm.description} onChange={(e) => setPurchaseForm({ ...purchaseForm, description: e.target.value })} /></FormField><div className="grid grid-cols-2 gap-3"><FormField label="Amount *"><input type="number" className={inputClass} value={purchaseForm.amount} onChange={(e) => setPurchaseForm({ ...purchaseForm, amount: e.target.value })} /></FormField><FormField label="Paid now"><input type="number" className={inputClass} value={purchaseForm.paidAmount} onChange={(e) => setPurchaseForm({ ...purchaseForm, paidAmount: e.target.value })} /></FormField></div><FormField label="Payment method"><select className={selectClass} value={purchaseForm.paymentMethod} onChange={(e) => setPurchaseForm({ ...purchaseForm, paymentMethod: e.target.value as PaymentMethod })}><option value="cash">Cash</option><option value="card">Card</option><option value="bank">Bank</option><option value="upi">UPI</option><option value="online">Online</option></select></FormField><FormField label="Kind"><select className={selectClass} value={purchaseForm.kind} onChange={(e) => setPurchaseForm({ ...purchaseForm, kind: e.target.value as "general" | "order_specific" })}><option value="general">General</option><option value="order_specific">Order specific</option></select></FormField>{purchaseForm.kind === "order_specific" && <FormField label="Order *"><select className={selectClass} value={purchaseForm.orderId} onChange={(e) => setPurchaseForm({ ...purchaseForm, orderId: e.target.value })}><option value="">Select order</option>{orders.map((o) => <option key={o.id} value={o.id}>{o.orderNumber} — {o.customerName || "Customer"}</option>)}</select></FormField>}<FormField label="Notes"><input className={inputClass} value={purchaseForm.notes} onChange={(e) => setPurchaseForm({ ...purchaseForm, notes: e.target.value })} /></FormField>{moduleError && <p className="text-sm text-rose-600">{moduleError}</p>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPurchaseOpen(false)}>Cancel</Button><Button onClick={handleCreatePurchase}>Save Purchase</Button></div></div></Modal></div>}
    {activeNav === "staff" && <><StaffList staff={staff} onAdd={() => { setModuleError(null); setStaffOpen(true); }} /><Modal open={staffOpen} title="Add Staff" onClose={() => setStaffOpen(false)} className="max-w-xl"><div className="space-y-3"><FormField label="Name *"><input className={inputClass} value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })} /></FormField><div className="grid grid-cols-2 gap-3"><FormField label="Phone"><input className={inputClass} value={staffForm.phone} onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })} /></FormField><FormField label="Email"><input className={inputClass} value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} /></FormField></div><FormField label="Role"><select className={selectClass} value={staffForm.role} onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value as RoleName })}><option value="staff">Staff</option><option value="tailor">Tailor</option><option value="cashier">Cashier</option><option value="manager">Manager</option><option value="admin">Admin</option></select></FormField><div className="grid grid-cols-2 gap-3"><FormField label="Salary"><input type="number" className={inputClass} value={staffForm.salary} onChange={(e) => setStaffForm({ ...staffForm, salary: e.target.value })} /></FormField><FormField label="Joining date"><input type="date" className={inputClass} value={staffForm.joiningDate} onChange={(e) => setStaffForm({ ...staffForm, joiningDate: e.target.value })} /></FormField></div><FormField label="Notes"><input className={inputClass} value={staffForm.notes} onChange={(e) => setStaffForm({ ...staffForm, notes: e.target.value })} /></FormField>{moduleError && <p className="text-sm text-rose-600">{moduleError}</p>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setStaffOpen(false)}>Cancel</Button><Button onClick={handleCreateStaff}>Save Staff</Button></div></div></Modal></>}
    {activeNav === "reports" && <ReportsPanel key={moduleTick} salesRows={reportSales} dayEnd={reportDayEnd} stock={reportStock} outstanding={reportOutstanding} onRefresh={persistAndRefresh} />}
    {activeNav === "sms" && <NotificationCenter key={moduleTick} notifications={notifications} onMarkRead={(id) => { phase6Store.markNotificationRead(id); setModuleTick((v) => v + 1); }} onMarkAllRead={() => { phase6Store.markAllNotificationsRead(); setModuleTick((v) => v + 1); }} />}
    {activeNav === "backup" && <BackupPanel key={moduleTick} backups={backups} onCreate={() => { phase7Store.createBackup("manual"); persistAndRefresh(); }} onVerify={(id) => { phase7Store.verifyBackup(id); setModuleTick((v) => v + 1); }} onDownload={(id) => { const payload = phase7Store.getBackupPayload(id); if (!payload) return; const blob = new Blob([payload], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = backups.find((b) => b.id === id)?.filename || "minarvabiz-backup.json"; a.click(); URL.revokeObjectURL(a.href); }} onInspect={(id) => { phase7Store.inspectBackup(id); setModuleTick((v) => v + 1); }} />}
    {activeNav === "settings" && <SettingsPanel profile={profile} tax={{ enableGst: tax.enableGst, defaultRatePercent: tax.defaultRatePercent }} backup={{ enabled: backupSettings.enabled, intervalHours: backupSettings.intervalHours, retentionCount: backupSettings.retentionCount }} onSaveProfile={(patch) => { updateShopProfile(patch); saveSettings(); }} onSaveTax={(patch) => { updateTaxConfig(patch); saveSettings(); }} onSaveBackup={(patch) => { setAutoBackupSettings(patch); saveSettings(); }} />}
    {activeNav !== "dashboard" && activeNav !== "customers" && activeNav !== "sales" && activeNav !== "services" && activeNav !== "laundry" && activeNav !== "expenses" && activeNav !== "staff" && activeNav !== "reports" && activeNav !== "sms" && activeNav !== "backup" && activeNav !== "settings" && <ProductList products={products} categories={categories} lowStockOnly={lowStockOnly} onToggleLowStock={() => setLowStockOnly((v) => !v)} onSearch={(q) => setProducts(store.listProducts({ query: q, lowStockOnly }))} />}
  </AppShell>;
}
