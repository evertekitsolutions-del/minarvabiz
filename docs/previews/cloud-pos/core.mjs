// Standalone HTML adapter. The production ERP uses its existing shared domain/outbox.
export const emptyState = () => ({ tenants: [], items: [], parties: [], invoices: [] });
export function assert(ok, message) { if (!ok) throw new Error(message); }
export function amount(value, decimals = 2) {
  const n = Number(value), factor = 10 ** decimals;
  assert(value !== '' && Number.isFinite(n) && n >= 0 && n <= 1e9, 'Enter a valid non-negative amount.');
  const result = Math.round((n + Number.EPSILON) * factor);
  assert(Number.isSafeInteger(result), 'Amount too large.');
  return result;
}
export function quantity(value) {
  const n = Number(value);
  assert(Number.isFinite(n) && n > 0 && n <= 1e6 && Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6, 'Quantity must be positive, with up to 3 decimals.');
  return n;
}
export function calculate(rows, tenant, interState = false) {
  assert(tenant && [2, 3].includes(tenant.decimals), 'Select a business.');
  let subtotal = 0, totalTax = 0, cgst = 0, sgst = 0, igst = 0, grandTotal = 0;
  const calculated = rows.map(row => {
    const qty = quantity(row.qty), price = amount(row.price, tenant.decimals), discount = amount(row.discount, tenant.decimals);
    const rate = Number(row.taxRate);
    assert(Number.isFinite(rate) && rate >= 0 && rate <= 100, 'Invalid tax rate.');
    const gross = Math.round(qty * price);
    assert(discount <= gross, 'Discount exceeds line amount.');
    const lineTotal = gross - discount;
    const taxable = Math.round(lineTotal * 100 / (100 + rate)), tax = lineTotal - taxable;
    subtotal += taxable; totalTax += tax; grandTotal += lineTotal;
    if (tenant.taxRegime === 'GST') {
      if (interState) igst += tax;
      else { const half = Math.round(tax / 2); cgst += half; sgst += tax - half; }
    }
    return { ...row, name: row.name.trim(), qty, taxable, tax, lineTotal };
  });
  assert(Number.isSafeInteger(grandTotal) && grandTotal <= 1e12, 'Bill total too large.');
  return { items: calculated, subtotal, totalTax, cgst, sgst, igst, grandTotal };
}
export function createTenant(state, input, id) {
  const profiles = { INR: ['GST', '₹', 2], OMR: ['VAT', 'OMR ', 3], AED: ['VAT', 'AED ', 2] };
  assert(input.name.trim() && profiles[input.currency], 'Business name and currency required.');
  const [taxRegime, symbol, decimals] = profiles[input.currency];
  const t = { id, name: input.name.trim(), currency: input.currency, taxNumber: input.taxNumber.trim(), taxRegime, symbol, decimals, invoiceCounter: 0 };
  state.tenants.push(t); return t;
}
export function postInvoice(state, tenantId, rows, input) {
  const previous = state.invoices.find(i => i.id === input.id);
  if (previous) { assert(previous.tenantId === tenantId, 'Invoice scope mismatch.'); return previous; }
  const tenant = state.tenants.find(t => t.id === tenantId);
  assert(rows.length > 0, 'Add bill items first.');
  const calc = calculate(rows, tenant, input.interState);
  assert(rows.length && rows.length <= 500 && rows.every(r => r.name.trim()), 'Enter an item description for every row.');
  assert(calc.grandTotal > 0, 'Add bill items first.');
  assert(['CASH', 'UPI', 'CARD', 'BANK'].includes(input.paymentMode), 'Invalid payment mode.');
  const tendered = input.paid === '' ? calc.grandTotal : amount(input.paid, tenant.decimals);
  assert(input.paymentMode === 'CASH' || tendered <= calc.grandTotal, 'Non-cash payment exceeds bill total.');
  const paidAmount = Math.min(tendered, calc.grandTotal), balanceDue = calc.grandTotal - paidAmount;
  const party = input.partyId ? state.parties.find(p => p.id === input.partyId && p.tenantId === tenantId) : null;
  assert(!input.partyId || party, 'Customer belongs to another business or no longer exists.');
  assert(!balanceDue || party, 'Select a named customer for a credit sale.');
  const demand = new Map();
  for (const row of calc.items) if (row.itemId) demand.set(row.itemId, (demand.get(row.itemId) || 0) + Math.round(row.qty * 1000));
  for (const [id, qty] of demand) {
    const item = state.items.find(i => i.id === id && i.tenantId === tenantId);
    assert(item && Math.round(item.stock * 1000) >= qty, 'Insufficient stock or invalid product.');
  }
  const invoice = { ...calc, id: input.id, tenantId, invNumber: `MBZ-${String(tenant.invoiceCounter + 1).padStart(6, '0')}`,
    date: input.date, business: { ...tenant }, partyId: party?.id || null, partyName: party?.name || 'Walk-in',
    paymentMode: input.paymentMode, paidAmount, balanceDue, change: tendered - paidAmount, interState: !!input.interState };
  // No mutation happens until every validation passes. Host persists this entire update atomically.
  for (const [id, qty] of demand) { const item = state.items.find(i => i.id === id); item.stock = (Math.round(item.stock * 1000) - qty) / 1000; }
  tenant.invoiceCounter++; state.invoices.unshift(invoice);
  return invoice;
}
export function partyBalance(state, id) { return state.invoices.filter(i => i.partyId === id).reduce((sum, i) => sum + i.balanceDue, 0); }
export function validateState(state) {
  assert(state && ['tenants', 'items', 'parties', 'invoices'].every(k => Array.isArray(state[k])), 'Unsupported workspace data.');
  const ids = new Set();
  for (const t of state.tenants) {
    assert(typeof t.id === 'string' && !ids.has(t.id) && typeof t.name === 'string' && [2,3].includes(t.decimals) && Number.isSafeInteger(t.invoiceCounter), 'Invalid business data.'); ids.add(t.id);
  }
  for (const key of ['items', 'parties', 'invoices']) {
    const seen = new Set();
    for (const r of state[key]) { assert(ids.has(r.tenantId) && typeof r.id === 'string' && !seen.has(r.id), 'Invalid or duplicate record.'); seen.add(r.id); }
  }
  return state;
}
