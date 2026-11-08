import { assert, amount, calculate, createTenant, emptyState, partyBalance, postInvoice, validateState } from './core.mjs';
import { openStore, transact, synchronize } from './storage.mjs';
const $ = id => document.getElementById(id);
// Same escaping convention as packages/business-logic/src/html.ts; no user HTML.
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid = () => crypto.randomUUID();
let db, workspace = 'local', record = { data: emptyState() }, active = '', cart = [], busy = false, syncing = false, session = null;
let draftId = uuid();
const tenant = () => record.data.tenants.find(t => t.id === active);
const money = (minor, t = tenant()) => `${t?.symbol || ''}${(minor / 10 ** (t?.decimals || 2)).toFixed(t?.decimals || 2)}`;
function notice(message) { $('notice').textContent = message; $('notice').hidden = !message; }
function tab(id) { document.querySelectorAll('main>section').forEach(el => el.hidden = el.id !== id); document.querySelectorAll('nav button').forEach(el => el.classList.toggle('active', el.dataset.tab === id)); }
function clear() { cart = []; draftId = uuid(); $('paid').value = ''; $('interstate').checked = false; $('payment').value = 'CASH'; renderCart(); }
function selectOptions(id, options, placeholder) {
  const previous = $(id).value;
  $(id).innerHTML = `<option value="">${esc(placeholder)}</option>` + options.map(o => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join('');
  if (options.some(o => o.id === previous)) $(id).value = previous;
}
function table(headers, rows) { return `<table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${headers.length}">No records yet.</td></tr>`}</tbody></table>`; }
function bills(invoices) {
  return table(['Invoice', 'Date', 'Customer', 'Total', 'Due', 'Action'], invoices.map(i => `<tr><td>${esc(i.invNumber)}</td><td>${esc(new Date(i.date).toLocaleString())}</td><td>${esc(i.partyName)}</td><td>${esc(money(i.grandTotal, i.business))}</td><td>${esc(money(i.balanceDue, i.business))}</td><td><button data-print="${esc(i.id)}">Print</button></td></tr>`));
}
function render() {
  const data = record.data;
  if (!data.tenants.some(t => t.id === active)) active = data.tenants[0]?.id || '';
  const t = tenant(), items = data.items.filter(i => i.tenantId === active), parties = data.parties.filter(p => p.tenantId === active), invoices = data.invoices.filter(i => i.tenantId === active);
  $('tenantSelect').innerHTML = data.tenants.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join(''); $('tenantSelect').value = active;
  $('businessName').textContent = t?.name || 'Create your business in Settings';
  const metrics = [['Sales revenue', money(invoices.reduce((s,i) => s+i.grandTotal,0))],['Receivable', money(invoices.reduce((s,i) => s+i.balanceDue,0))],['Collected', money(invoices.reduce((s,i) => s+i.paidAmount,0))],['Low stock', `${items.filter(i => i.stock <= 5).length} items`]];
  $('kpis').innerHTML = metrics.map(([label, value]) => `<div class="card"><small>${label}</small><p class="kpi">${esc(value)}</p></div>`).join('');
  $('recent').innerHTML = bills(invoices.slice(0,5)); $('history').innerHTML = bills(invoices);
  selectOptions('customer', parties.map(p => ({id:p.id,label:p.name})), 'Walk-in (full payment only)');
  selectOptions('picker', items.map(i => ({id:i.id,label:`${i.name} — ${money(amount(i.price,t.decimals))} — stock ${i.stock}`})), '+ Choose product');
  $('products').innerHTML = table(['Name','SKU','Price','Tax','Stock','Action'], items.map(i => `<tr><td>${esc(i.name)}</td><td>${esc(i.sku)}</td><td>${esc(money(amount(i.price,t.decimals)))}</td><td>${esc(i.taxRate)}%</td><td>${esc(i.stock)}</td><td><button data-stock="${esc(i.id)}">+1</button></td></tr>`));
  $('customers').innerHTML = table(['Name','Phone','Tax number','Receivable'], parties.map(p => `<tr><td>${esc(p.name)}</td><td>${esc(p.phone)}</td><td>${esc(p.taxNo)}</td><td>${esc(money(partyBalance(data,p.id)))}</td></tr>`));
  $('account').textContent = session ? `Account: ${session.email} · cloud revision ${record.revision}` : 'Local workspace — no cloud account connected';
  $('status').textContent = record.conflict ? 'Conflict — local changes preserved. Export & review.' : record.operation ? 'Upload pending — retry before further edits.' : record.dirty ? 'Saved on this device · cloud upload pending' : session ? `Cloud snapshot loaded · revision ${record.revision}` : 'Local only · no Supabase connected';
  $('interstate').disabled = t?.taxRegime !== 'GST';
  renderCart();
}
function renderCart() {
  $('cart').innerHTML = cart.map((r,i) => `<tr>${['name','qty','price','discount','taxRate'].map(field => `<td><input aria-label="${field}" class="${field==='name'?'description':''}" data-row="${i}" data-field="${field}" type="${field==='name'?'text':'number'}" step="any" min="0" value="${esc(r[field])}"></td>`).join('')}<td id="line-${i}"></td><td><button data-remove="${i}" class="secondary">×</button></td></tr>`).join('');
  totals();
}
function totals() {
  if (!tenant()) { $('totals').textContent = 'Create a business in Settings.'; return; }
  try {
    const c = calculate(cart, tenant(), $('interstate').checked);
    c.items.forEach((r,i) => { $(`line-${i}`).textContent = money(r.lineTotal); });
    const tendered = $('paid').value === '' ? c.grandTotal : amount($('paid').value,tenant().decimals);
    const pairs = [['Taxable subtotal',c.subtotal], ...(tenant().taxRegime === 'GST' ? $('interstate').checked ? [['IGST',c.igst]] : [['CGST',c.cgst],['SGST',c.sgst]] : [['VAT',c.totalTax]]), ['Grand total',c.grandTotal],['Balance due',Math.max(0,c.grandTotal-tendered)],['Change',Math.max(0,tendered-c.grandTotal)]];
    $('totals').innerHTML = pairs.map(([k,v]) => `<p><span>${k}</span><strong>${esc(money(v))}</strong></p>`).join('');
  } catch (err) { $('totals').textContent = err.message; }
}
async function mutate(fn) {
  record = await transact(db, workspace, s => {
    assert(!s.operation && !s.conflict, 'Resolve pending sync before editing. Your data is preserved.');
    fn(s.data); s.dirty = true;
  });
  render();
}
async function api(path, options = {}) {
  assert(session, 'Sign in to connect cloud.');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${session.url}${path}`, { ...options, signal: controller.signal, headers: { apikey:session.key, Authorization:`Bearer ${session.token}`, 'Content-Type':'application/json', ...options.headers } });
    const data = await response.json();
    if (!response.ok) { const error = new Error(response.status === 401 ? 'Session expired. Sign in again; pending data is preserved.' : data.message || 'Cloud request failed.'); error.code = data.code; throw error; }
    return data;
  } finally { clearTimeout(timer); }
}
function remote() {
  return { read: async () => {
    const rows = await api(`/rest/v1/html_pos_workspaces?owner_id=eq.${encodeURIComponent(session.userId)}&select=data,revision`);
    const row = rows[0]; if (row) validateState(row.data); return row;
  }, write: op => api('/rest/v1/rpc/html_pos_commit', {method:'POST',body:JSON.stringify({p_expected:op.revision,p_operation:op.id,p_data:op.data})}) };
}
async function sync() {
  assert(!syncing, 'Sync already running.'); assert(session, 'Local save complete. Sign in under Settings to use cloud.');
  syncing = true;
  try { record = await synchronize(db, workspace, remote()); render(); notice('Cloud request acknowledged.'); }
  catch (err) { record = await transact(db, workspace); render(); throw err; }
  finally { syncing = false; }
}
async function save(print) {
  assert(!busy, 'Save in progress.'); busy = true; $('save').disabled = $('savePrint').disabled = true;
  let invoice;
  const saleTenant = active, saleDraft = draftId, saleRows = structuredClone(cart);
  const saleInput = {id:saleDraft,date:new Date().toISOString(),partyId:$('customer').value,paid:$('paid').value,interState:$('interstate').checked,paymentMode:$('payment').value};
  try {
    await mutate(data => { invoice = postInvoice(data, saleTenant, saleRows, saleInput); });
    if (active === saleTenant && draftId === saleDraft) clear(); notice(`Invoice ${invoice.invNumber} saved on this device.`);
    if (print) printReceipt(invoice);
    if (session) { try { await sync(); } catch (err) { notice(`Invoice saved locally. ${err.message}`); } }
  } finally { busy = false; $('save').disabled = $('savePrint').disabled = false; }
}
function printReceipt(i) {
  const t = i.business, taxes = t.taxRegime === 'GST' ? i.interState ? [['IGST',i.igst]] : [['CGST',i.cgst],['SGST',i.sgst]] : [['VAT',i.totalTax]];
  $('receipt').innerHTML = `<h2>${esc(t.name)}</h2><p>${esc(t.taxRegime)} No: ${esc(t.taxNumber || 'Not provided')}</p><p>Invoice: ${esc(i.invNumber)}</p><p>${esc(new Date(i.date).toLocaleString())}</p><p>Customer: ${esc(i.partyName)}</p><p>Mode: ${esc(i.paymentMode)}</p>${table(['Item','Qty','Total'],i.items.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.qty)}</td><td class="right">${esc(money(r.lineTotal,t))}</td></tr>`))}${[['Taxable',i.subtotal],...taxes,['Grand total',i.grandTotal],['Received',i.paidAmount],['Balance due',i.balanceDue],['Change',i.change]].map(([k,v])=>`<p class="row"><span>${k}</span><strong>${esc(money(v,t))}</strong></p>`).join('')}<p style="text-align:center">Thank you!</p>`;
  window.print();
}
function backup() {
  const blob = new Blob([JSON.stringify({schema:2,exportedAt:new Date().toISOString(),workspace,record},null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `minarva-pos-${new Date().toISOString().replace(/[:.]/g,'-')}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const run = fn => async event => { try { await fn(event); } catch(err) { notice(err.message || 'Operation failed.'); } };
document.addEventListener('click', run(async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.tab) tab(b.dataset.tab);
  if (b.dataset.print) { const i = record.data.invoices.find(i=>i.id===b.dataset.print && i.tenantId===active); assert(i,'Invoice not found.'); printReceipt(i); }
  if (b.dataset.stock) await mutate(data => { const i = data.items.find(i=>i.id===b.dataset.stock && i.tenantId===active); assert(i,'Product not found.'); assert(i.stock < 1e6,'Stock limit reached.'); i.stock = (Math.round(i.stock*1000)+1000)/1000; });
  if (b.dataset.remove !== undefined) { cart.splice(Number(b.dataset.remove),1); renderCart(); }
}));
$('tenantSelect').onchange = run(e => { if (busy) { e.target.value=active; throw Error('Wait for invoice save.'); } if (cart.length && !confirm('Discard this unsaved bill and switch business?')) { e.target.value=active; return; } active=e.target.value; clear(); $('customer').value=''; render(); });
$('picker').onchange = run(e => { assert(!busy, 'Wait for invoice save.'); const item=record.data.items.find(i=>i.id===e.target.value && i.tenantId===active); e.target.value=''; if(!item)return; const row=cart.find(r=>r.itemId===item.id); if(row)row.qty=Number(row.qty)+1; else cart.push({itemId:item.id,name:item.name,qty:1,price:item.price,discount:0,taxRate:item.taxRate}); renderCart(); });
$('cart').oninput = run(e => { assert(!busy, 'Wait for invoice save.'); if(e.target.dataset.field) { cart[Number(e.target.dataset.row)][e.target.dataset.field]=e.target.value; totals(); } });
$('paid').oninput=totals; $('interstate').onchange=totals;
$('custom').onclick=run(()=>{ assert(!busy, 'Wait for invoice save.'); assert(tenant(),'Create a business first.'); cart.push({itemId:null,name:'',qty:1,price:0,discount:0,taxRate:tenant().taxRegime==='GST'?18:5}); renderCart(); });
$('clear').onclick=()=>{if(busy)return;if(!cart.length||confirm('Clear this unsaved bill?'))clear();};
$('save').onclick=run(()=>save(false)); $('savePrint').onclick=run(()=>save(true));
$('businessForm').onsubmit=run(async e=>{e.preventDefault(); assert(!busy, 'Wait for invoice save.'); const input=Object.fromEntries(new FormData(e.target)), id=uuid(); assert(!cart.length || confirm('Discard unsaved bill and switch to new business?'),'Business creation cancelled.'); await mutate(data=>createTenant(data,input,id)); active=id;clear();render();e.target.reset();notice('Business saved on this device.');});
$('itemForm').onsubmit=run(async e=>{e.preventDefault(); const input=Object.fromEntries(new FormData(e.target)); assert(tenant(),'Create a business first.'); const price=amount(input.price,tenant().decimals), stock=Number(input.stock), taxRate=Number(input.taxRate); assert(input.name.trim()&&price>0&&Number.isFinite(stock)&&stock>=0&&stock<=1e6&&Number.isInteger(stock*1000)&&Number.isFinite(taxRate)&&taxRate>=0&&taxRate<=100,'Check product values.'); await mutate(data=>{assert(!input.sku || !data.items.some(i=>i.tenantId===active&&i.sku===input.sku.trim()),'SKU already exists.');data.items.push({id:uuid(),tenantId:active,name:input.name.trim(),sku:input.sku.trim()||uuid(),price:price/10**tenant().decimals,stock,taxRate});});e.target.reset();notice('Product saved on this device.');});
$('partyForm').onsubmit=run(async e=>{e.preventDefault(); const input=Object.fromEntries(new FormData(e.target)); assert(tenant()&&input.name.trim(),'Business and customer name required.');await mutate(data=>data.parties.push({id:uuid(),tenantId:active,name:input.name.trim(),phone:input.phone.trim(),taxNo:input.taxNo.trim()}));e.target.reset();notice('Customer saved on this device.');});
$('cloudForm').onsubmit=run(async e=>{
  e.preventDefault(); assert(!syncing&&!busy,'Wait for current operation.'); assert(!cart.length || confirm('Discard the unsaved bill and open the account workspace?'),'Sign-in cancelled.');
  const url=new URL($('url').value.trim()), key=$('key').value.trim();
  assert(url.protocol==='https:' && !url.username && !url.password && url.pathname==='/' && !url.search && !url.hash,'Use an HTTPS project origin.');
  assert(!key.startsWith('sb_secret_'),'Never use a secret or service-role key in this browser.');
  if (!key.startsWith('sb_publishable_')) { let role; try { role=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role; } catch {} assert(role==='anon','Use a publishable key or legacy anon key.'); }
  const response=await fetch(`${url.origin}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:$('email').value,password:$('password').value}),signal:AbortSignal.timeout(15000)});
  const result=await response.json(); $('password').value=''; assert(response.ok&&result.user?.id&&result.access_token,result.msg||result.error_description||'Sign-in failed.');
  session={url:url.origin,key,token:result.access_token,userId:result.user.id,email:result.user.email}; workspace=`${session.url}:${session.userId}`;
  clear(); active=''; record=await transact(db,workspace);render();await sync();
});
$('sync').onclick=run(sync); $('export').onclick=run(backup);
$('logout').onclick=run(async()=>{assert(!syncing&&!busy,'Wait for current operation.');assert(!cart.length||confirm('Discard unsaved bill and return to local workspace?'),'Cancelled.');session=null;workspace='local';active='';clear();record=await transact(db,workspace);render();notice('Cloud session removed from memory. Account data stays separate.');});
$('reload').onclick=run(async()=>{
  assert(!syncing&&!busy,'Wait for current operation.');assert(session,'Sign in first.');
  const cloud=await remote().read(); assert(cloud,'No cloud workspace found. Local data preserved.');
  const counts=`Cloud: ${cloud.data.invoices.length} invoices, ${cloud.data.items.length} products. Local: ${record.data.invoices.length} invoices, ${record.data.items.length} products.`;
  if(!confirm(`${counts}\nExport local backup and replace local workspace with cloud? Unsynced records must be reconciled manually.`))return;
  // Archive inside the same durable transaction before replacement, in addition to download.
  backup(); record=await transact(db,workspace,s=>{s.archives=[...(s.archives||[]),{at:new Date().toISOString(),data:s.data,operation:s.operation,revision:s.revision}];s.data=cloud.data;s.revision=cloud.revision;s.dirty=false;s.operation=null;s.conflict=false;});clear();render();notice('Cloud loaded; previous local version is retained in backup archives.');
});
try { db=await openStore();record=await transact(db,workspace);validateState(record.data);render();tab(record.data.tenants.length?'dashboard':'settings'); }
catch(err){notice(`Workspace could not open: ${err.message}. Existing storage has not been reset.`);document.querySelectorAll('button').forEach(b=>b.disabled=true);}
