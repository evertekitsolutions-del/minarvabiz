"use client";

import * as React from "react";
import type { SalesReportRow } from "@minarvabiz/types";
import { Button } from "../Button";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { formatMoney } from "../customers/format";

export interface DayEndView { totalSales:number; totalExpenses:number; costOfGoods:number; serviceRevenue:number; serviceExpenses:number; grossProfit:number; netProfit:number; cashReceived:number; cardPayments:number; otherPayments:number; outstandingAmount:number; }
export interface StockRow { id:string; name:string; sku?:string|null; stock:number; min:number; value:number; low:boolean; }
type ReportTab = "sales" | "dayend" | "stock" | "outstanding";

function csvCell(value: unknown) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
function downloadFile(name: string, text: string, type: string) { const blob = new Blob([text], { type }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
function pdfEscape(text: string) { return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }
function downloadPdf(name: string, title: string, lines: string[]) {
  const visible = [title, ...lines].slice(0, 48);
  const commands = ["BT", "/F1 11 Tf", "50 760 Td"];
  visible.forEach((line, index) => { if (index > 0) commands.push("0 -16 Td"); commands.push(`(${pdfEscape(line.slice(0, 105))}) Tj`); });
  commands.push("ET");
  const stream = commands.join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  objects.forEach((obj, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  downloadFile(name, pdf, "application/pdf");
}

export function ReportsPanel({ salesRows, sales, dayEnd, stock, outstanding, onExportCsv, onRefresh }: { salesRows?:SalesReportRow[]; sales?:SalesReportRow[]; dayEnd:DayEndView; stock:Array<StockRow>; outstanding:Array<{id:string;name:string;phone?:string|null;outstanding:number}>; onExportCsv?:(kind:ReportTab)=>void; onRefresh?:()=>void }) {
  const [tab,setTab]=React.useState<ReportTab>("sales");
  const rows=salesRows??sales??[];
  const exportCurrent = () => {
    onExportCsv?.(tab);
    if (tab === "sales") downloadFile("minarva-sales-report.csv", ["Period,Products,Services,Laundry,Revenue,Expenses,Net Profit", ...rows.map(r => [r.label,r.productSales,r.serviceRevenue,r.laundryRevenue,r.totalRevenue,r.expenses,r.netProfit].map(csvCell).join(","))].join("\n"), "text/csv;charset=utf-8");
    if (tab === "stock") downloadFile("minarva-inventory-report.csv", ["Product,SKU,Stock,Minimum,Value", ...stock.map(r => [r.name,r.sku,r.stock,r.min,r.value].map(csvCell).join(","))].join("\n"), "text/csv;charset=utf-8");
    if (tab === "outstanding") downloadFile("minarva-outstanding-report.csv", ["Customer,Phone,Outstanding", ...outstanding.map(r => [r.name,r.phone,r.outstanding].map(csvCell).join(","))].join("\n"), "text/csv;charset=utf-8");
    if (tab === "dayend") downloadFile("minarva-dayend-report.csv", ["Metric,Amount", `Total sales,${dayEnd.totalSales}`, `Service revenue,${dayEnd.serviceRevenue}`, `Cost of goods,${dayEnd.costOfGoods}`, `Gross profit,${dayEnd.grossProfit}`, `Total expenses,${dayEnd.totalExpenses}`, `Net profit,${dayEnd.netProfit}`, `Cash received,${dayEnd.cashReceived}`, `Card / UPI,${dayEnd.cardPayments}`, `Other payments,${dayEnd.otherPayments}`, `Outstanding,${dayEnd.outstandingAmount}`].map((x,i)=>i===0?x:x).join("\n"), "text/csv;charset=utf-8");
  };
  const pdfLines: string[] = [];
  if (tab === "sales") rows.forEach(r => pdfLines.push(`${r.label} | Revenue ${formatMoney(r.totalRevenue)} | Expenses ${formatMoney(r.expenses)} | Net ${formatMoney(r.netProfit)}`));
  if (tab === "stock") stock.forEach(r => pdfLines.push(`${r.name} | ${r.stock}/${r.min} | ${formatMoney(r.value)}`));
  if (tab === "outstanding") outstanding.forEach(r => pdfLines.push(`${r.name} | ${r.phone || ""} | ${formatMoney(r.outstanding)}`));
  if (tab === "dayend") [["Total sales",dayEnd.totalSales],["Service revenue",dayEnd.serviceRevenue],["Cost of goods",dayEnd.costOfGoods],["Gross profit",dayEnd.grossProfit],["Total expenses",dayEnd.totalExpenses],["Net profit",dayEnd.netProfit],["Cash received",dayEnd.cashReceived],["Card / UPI",dayEnd.cardPayments],["Other payments",dayEnd.otherPayments],["Outstanding",dayEnd.outstandingAmount]].forEach(([label,value]) => pdfLines.push(`${label}: ${formatMoney(value as number)}`));
  return <div className="space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-semibold text-slate-900">Reports & Analytics</h2><p className="text-sm text-slate-500">Sales, profitability, inventory and outstanding reports</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={onRefresh}>Refresh</Button><Button variant="outline" onClick={exportCurrent}>Export CSV</Button><Button variant="outline" onClick={() => window.print()}>Print</Button><Button onClick={() => downloadPdf(`minarva-${tab}-report.pdf`, `Minarva Biz — ${tab.toUpperCase()} report`, pdfLines)}>Download PDF</Button></div></div><div className="flex flex-wrap gap-2 print:hidden">{(["sales","dayend","stock","outstanding"] as ReportTab[]).map(t=><Button key={t} size="sm" variant={tab===t?"primary":"outline"} onClick={()=>setTab(t)}>{t==="dayend"?"Day-end":t==="outstanding"?"Outstanding":t.charAt(0).toUpperCase()+t.slice(1)}</Button>)}</div>
    {tab==="sales"&&<Card><CardHeader><CardTitle className="text-sm font-semibold">Sales summary</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase text-slate-400"><th>Period</th><th>Products</th><th>Services</th><th>Laundry</th><th>Revenue</th><th>Expenses</th><th>Net profit</th></tr></thead><tbody>{rows.map(r=><tr key={r.label} className="border-b border-slate-50"><td className="py-2 font-medium">{r.label}</td><td>{formatMoney(r.productSales)}</td><td>{formatMoney(r.serviceRevenue)}</td><td>{formatMoney(r.laundryRevenue)}</td><td>{formatMoney(r.totalRevenue)}</td><td>{formatMoney(r.expenses)}</td><td className="font-semibold">{formatMoney(r.netProfit)}</td></tr>)}</tbody></table></CardContent></Card>}
    {tab==="dayend"&&<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{[["Total sales",dayEnd.totalSales],["Service revenue",dayEnd.serviceRevenue],["Cost of goods",dayEnd.costOfGoods],["Gross profit",dayEnd.grossProfit],["Total expenses",dayEnd.totalExpenses],["Net profit",dayEnd.netProfit],["Cash received",dayEnd.cashReceived],["Card / UPI",dayEnd.cardPayments],["Other payments",dayEnd.otherPayments],["Outstanding",dayEnd.outstandingAmount]].map(([label,val])=><Card key={String(label)}><CardContent className="p-4"><div className="text-xs text-slate-500">{label}</div><div className="text-lg font-bold text-slate-900">{formatMoney(val as number)}</div></CardContent></Card>)}</div>}
    {tab==="stock"&&<Card><CardContent className="overflow-x-auto p-4"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase text-slate-400"><th>Product</th><th>SKU</th><th>Stock</th><th>Min</th><th>Value</th></tr></thead><tbody>{stock.map(r=><tr key={r.id} className="border-b border-slate-50"><td className="py-2 font-medium">{r.name}</td><td>{r.sku||"—"}</td><td>{r.stock}</td><td>{r.min}</td><td>{formatMoney(r.value)}</td></tr>)}</tbody></table></CardContent></Card>}
    {tab==="outstanding"&&<Card><CardContent className="space-y-2 p-4">{outstanding.length===0&&<p className="text-sm text-slate-400">No outstanding balances</p>}{outstanding.map(c=><div key={c.id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><div><div className="font-medium">{c.name}</div><div className="text-xs text-slate-500">{c.phone||""}</div></div><span className="font-semibold text-rose-600">{formatMoney(c.outstanding)}</span></div>)}</CardContent></Card>}
  </div>;
}
