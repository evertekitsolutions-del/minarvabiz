import assert from "node:assert/strict";
import fs from "node:fs";
import { exportLaundryTicketsCsv } from "../laundry-tickets-csv.ts";

const ticket = (other = {}) => ({
  orderNumber: "LND-001",
  createdAt: "2026-10-15T07:30:00+05:30",
  customerName: "Customer, \"A\"",
  mode: "outsourced",
  status: "pending",
  garment: "Dress",
  quantity: 2,
  supplierName: "Quality Laundry",
  totalCustomerCharge: 140,
  totalSupplierCost: 70,
  profit: 70,
  paidAmount: 100,
  balanceAmount: 40,
  notes: "Urgent",
  ...other,
});
const tickets = [ticket(), ticket({ orderNumber: "=HYPERLINK(\"https://invalid.example\")", garment: " \t+cmd", customerName: "@untrusted", status: "cancelled", profit: -3, notes: "\n-IMPORTRANGE(1)" })];
const before = JSON.stringify(tickets);
const csv = exportLaundryTicketsCsv(tickets);
assert.equal(JSON.stringify(tickets), before);
assert.match(csv, /^ticket_number,date,customer,mode,status,garment,quantity,supplier,customer_charge,supplier_cost,profit,paid,balance,notes\n/);
assert.ok(csv.includes('"Customer, ""A"""'));
assert.ok(csv.includes("\"'=HYPERLINK(\"\"https://invalid.example\"\")\""));
assert.ok(csv.includes("'@untrusted"));
assert.ok(csv.includes("' \t+cmd"));
assert.ok(csv.includes("\"'\n-IMPORTRANGE(1)\""));
assert.ok(csv.includes(",cancelled,"));
assert.ok(csv.includes(",-3,"));
assert.equal(exportLaundryTicketsCsv([]), "ticket_number,date,customer,mode,status,garment,quantity,supplier,customer_charge,supplier_cost,profit,paid,balance,notes\n");
assert.throws(() => exportLaundryTicketsCsv([ticket({ totalSupplierCost: Infinity })]), /invalid numeric/);
assert.throws(() => exportLaundryTicketsCsv([ticket({ profit: NaN })]), /invalid numeric/);

const ui = fs.readFileSync(new URL("../../../ui/src/components/laundry/LaundryList.tsx", import.meta.url), "utf8");
assert.match(ui, /exportLaundryTicketsCsv\(filtered\)/, "must export exactly visible filter results");
assert.match(ui, /rows=\{filtered\}/);
assert.match(ui, /disabled=\{filtered\.length === 0\}/);
assert.match(ui, /onClick=\{downloadFilteredTickets\}/);
assert.match(ui, /String\.fromCharCode\(0xfeff\)/);
assert.match(ui, /URL\.revokeObjectURL\(url\)/);
console.log("Filtered laundry CSV export content and UI safety tests PASS");
