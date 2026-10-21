"use client";

import * as React from "react";
import type { SalesReportRow } from "@minarvabiz/types";
import { can, listAuthorizedCustomerOriginalGrossMargins, listAuthorizedProductOriginalGrossMargins, listAuthorizedServiceOriginalGrossMargins, buildAuthorizedCashBankFlow } from "@minarvabiz/business-logic";
import type { CustomerOriginalGrossMarginRow, ProductOriginalGrossMarginRow, ServiceOriginalGrossMarginRow, CashBankFlowReport } from "@minarvabiz/business-logic";
import { Button } from "../Button";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { formatMoney } from "../customers/format";

export interface DayEndView {
  totalSales:number; totalExpenses:number; costOfGoods:number; serviceRevenue:number; serviceExpenses:number;
  grossProfit:number; netProfit:number; cashReceived:number; cardPayments:number; otherPayments:number; outstandingAmount:number;
}
export interface StockRow { id:string; name:string; sku?:string|null; stock:number; min:number; value:number; low:boolean; }
export interface ReceivableRow { id:string; name:string; phone?:string|null; outstanding:number; }
export interface PayableAgingRow {
  supplierId:string; supplierName:string; current:number; days1to30:number; days31to60:number;
  days61to90:number; days90plus:number; totalOutstanding:number;
}
export interface StatementRow { accountId:string; code:string; name:string; amount:number; }
export interface FinancialReportsView {
  trialBalance:Array<{ accountId:string; code:string; name:string; type:string; debit:number; credit:number }>;
  profit:{ income:StatementRow[]; expenses:StatementRow[]; totalIncome:number; totalExpenses:number; netProfit:number };
  balance:{
    assets:StatementRow[]; liabilities:StatementRow[]; equity:StatementRow[];
    totalAssets:number; totalLiabilities:number; recordedEquity:number; unclosedEarnings:number;
    totalEquity:number; liabilitiesAndEquity:number; difference:number; balanced:boolean;
  };
}
export interface TaxReconciliationView {
  from:string|null; to:string|null; periodOutputTax:number; periodInputTax:number; periodPurchaseTaxPending:number;
  outputTaxPayable:number; inputTaxCredit:number; purchaseTaxPending:number; netTaxPosition:number; reviewRequired:boolean;
}
type ReportTab = "sales" | "dayend" | "stock" | "receivables" | "payables" | "financial" | "tax" | "customer-profit" | "product-profit" | "service-profit" | "cash-bank-flow";

function csvCell(value: unknown) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
function downloadFile(name: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function xmlEscape(value: unknown) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function spreadsheetXml(sheetName: string, headers: string[], rows: Array<Array<string | number>>) {
  const cell = (value: string | number) => `<Cell><Data ss:Type="${typeof value === "number" && Number.isFinite(value) ? "Number" : "String"}">${xmlEscape(value)}</Data></Cell>`;
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/></Style></Styles>
<Worksheet ss:Name="${xmlEscape(sheetName.slice(0,31))}"><Table>
<Row ss:StyleID="Header">${headers.map((h) => cell(h)).join("")}</Row>
${rows.map((row) => `<Row>${row.map((value) => cell(value)).join("")}</Row>`).join("")}
</Table></Worksheet></Workbook>`;
}
function pdfEscape(text: string) { return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }
function downloadPdf(name: string, title: string, lines: string[]) {
  const visible = [title, ...lines].slice(0, 48);
  const commands = ["BT", "/F1 11 Tf", "50 760 Td"];
  visible.forEach((line, index) => { if (index > 0) commands.push("0 -16 Td"); commands.push(`(${pdfEscape(line.slice(0, 105))}) Tj`); });
  commands.push("ET");
  const stream = commands.join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n"; const offsets:number[]=[0];
  objects.forEach((obj,index)=>{offsets.push(pdf.length);pdf+=`${index+1} 0 obj\n${obj}\nendobj\n`;});
  const xref=pdf.length; pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset)=>{pdf+=`${String(offset).padStart(10,"0")} 00000 n \n`;});
  pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  downloadFile(name,pdf,"application/pdf");
}
const moneyRow = (label:string,value:number):Array<string|number> => [label,value];

function StatementSection({ title, rows, total }: { title:string; rows:StatementRow[]; total:number }) {
  return <div className="space-y-2"><h4 className="text-sm font-semibold text-slate-800">{title}</h4><div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full text-sm"><tbody>{rows.map(row=><tr key={row.accountId} className="border-b border-slate-100"><td className="px-3 py-2">{row.code} · {row.name}</td><td className="px-3 py-2 text-right">{formatMoney(row.amount)}</td></tr>)}{!rows.length&&<tr><td className="px-3 py-4 text-slate-400">No balances</td><td/></tr>}</tbody><tfoot><tr className="bg-slate-50 font-semibold"><td className="px-3 py-2">Total {title.toLowerCase()}</td><td className="px-3 py-2 text-right">{formatMoney(total)}</td></tr></tfoot></table></div></div>;
}

export function ReportsPanel({
  salesRows, sales, dayEnd, stock, outstanding, payables = [], financial, taxReport,
  onRefresh, from, to, onFromChange, onToChange, reportError,
}: {
  salesRows?:SalesReportRow[]; sales?:SalesReportRow[]; dayEnd:DayEndView; stock:StockRow[]; outstanding:ReceivableRow[];
  payables?:PayableAgingRow[]; financial?:FinancialReportsView; taxReport?:TaxReconciliationView;
  onRefresh?:()=>void; from?:string; to?:string; onFromChange?:(value:string)=>void; onToChange?:(value:string)=>void; reportError?:string;
}) {
  const [tab,setTab]=React.useState<ReportTab>("sales");
  const rows=salesRows??sales??[];
  const mayReadCustomerMargins = can("accounting.view");
  let customerMargins: CustomerOriginalGrossMarginRow[] = [];
  let customerMarginError: string | null = null;
  if (mayReadCustomerMargins) {
    try { customerMargins = listAuthorizedCustomerOriginalGrossMargins(from, to); }
    catch (e) { customerMarginError = e instanceof Error ? e.message : "Unable to read customer gross margins"; }
  }

  const mayReadProductMargins = can("accounting.view");
  let productMargins: ProductOriginalGrossMarginRow[] = [];
  let productMarginError: string | null = null;
  if (mayReadProductMargins) {
    try { productMargins = listAuthorizedProductOriginalGrossMargins(from, to); }
    catch (error) { productMarginError = error instanceof Error ? error.message : "Unable to read product margins"; }
  }

  const mayReadServiceMargins = can("accounting.view");
  let serviceMargins: ServiceOriginalGrossMarginRow[] = [];
  let serviceMarginError: string | null = null;
  if (mayReadServiceMargins) {
    try { serviceMargins = listAuthorizedServiceOriginalGrossMargins(from,to); }
    catch(error) { serviceMarginError = error instanceof Error ? error.message : "Unable to read service margins"; }
  }

  const mayReadCashFlow = can("accounting.view");
  let cashFlow: CashBankFlowReport | null = null;
  let cashFlowError: string | null = null;
  if(mayReadCashFlow) {
    try { cashFlow=buildAuthorizedCashBankFlow(from,to); }
    catch(error) { cashFlowError=error instanceof Error ? error.message : "Unable to read cash flow"; }
  }

  const exportData = React.useMemo(() => {
    if(tab==="cash-bank-flow") {
      return mayReadCashFlow && cashFlow && !cashFlowError
        ? {name:"Posted Cash and Bank Flow",
          headers:["Date / Metric","Reference","Cash movement","Bank movement","Consolidated net"],
          rows:[
            ["Opening balance","",cashFlow.openingCash,cashFlow.openingBank,cashFlow.openingTotal],
            ["Period inflows","",0,0,cashFlow.cashInflows],
            ["Period outflows","",0,0,cashFlow.cashOutflows],
            ["Closing balance","",cashFlow.closingCash,cashFlow.closingBank,cashFlow.closingTotal],
            ...cashFlow.movements.map(row=>[row.date,row.journalNumber,row.cashChange,
              row.bankChange,row.netCashFlow] as Array<string|number>),
          ] as Array<Array<string|number>>}
        : {name:"Restricted Cash Flow",headers:["Status"],rows:[] as Array<Array<string|number>>};
    }
    if (tab==="service-profit") {
      return mayReadServiceMargins && !serviceMarginError
        ? {name:"Service Direct-cost Margin",
          headers:["Service","Delivered orders","Net order value","Materials","Direct expenses","Estimated gross profit","Margin %"],
          rows:serviceMargins.map(r=>[r.serviceName,r.deliveredOrderCount,r.orderRevenue,
            r.recordedMaterialCost,r.recordedDirectExpenses,r.estimatedGrossProfit,
            r.estimatedMarginPercent] as Array<string|number>)}
        : {name:"Restricted Service Margin",headers:["Status"],rows:[] as Array<Array<string|number>>};
    }
    if (tab==="product-profit") {
      return mayReadProductMargins && !productMarginError
        ? {name:"Product Original Gross Margin",
          headers:["Product","SKU","Invoices","Sold qty","Revenue ex tax","Historic COGS","Original gross profit","Margin %"],
          rows:productMargins.map(r=>[r.productName,r.sku??"",r.invoiceCount,r.soldQuantity,
            r.revenueExcludingTax,r.historicalCostOfGoods,r.originalGrossProfit,
            r.originalGrossMarginPercent] as Array<string|number>)}
        : {name:"Restricted Product Margin",headers:["Status"],rows:[] as Array<Array<string|number>>};
    }
    if(tab==="customer-profit") {
      return mayReadCustomerMargins && !customerMarginError
        ? {name:"Customer Original Gross Margin",
          headers:["Customer","Posted invoices","Revenue ex tax","Historic cost","Original gross profit","Margin %"],
          rows:customerMargins.map(r=>[r.customerName,r.invoiceCount,r.revenueExcludingTax,
            r.historicalCost,r.originalGrossProfit,r.originalGrossMarginPercent] as Array<string|number>)}
        : {name:"Restricted Customer Margin",headers:["Status"],rows:[] as Array<Array<string|number>>};
    }
    if(tab==="sales") return {name:"Sales",headers:["Period","Products","Services","Laundry","Revenue","Expenses","Net Profit"],rows:rows.map(r=>[r.label,r.productSales,r.serviceRevenue,r.laundryRevenue,r.totalRevenue,r.expenses,r.netProfit] as Array<string|number>)};
    if(tab==="stock") return {name:"Inventory",headers:["Product","SKU","Stock","Minimum","Value","Low Stock"],rows:stock.map(r=>[r.name,r.sku||"",r.stock,r.min,r.value,r.low?"Yes":"No"] as Array<string|number>)};
    if(tab==="receivables") return {name:"Receivables",headers:["Customer","Phone","Outstanding"],rows:outstanding.map(r=>[r.name,r.phone||"",r.outstanding] as Array<string|number>)};
    if(tab==="payables") return {name:"Payables Aging",headers:["Supplier","Current","1-30","31-60","61-90","90+","Outstanding"],rows:payables.map(r=>[r.supplierName,r.current,r.days1to30,r.days31to60,r.days61to90,r.days90plus,r.totalOutstanding] as Array<string|number>)};
    if(tab==="tax"&&taxReport) return {name:"Tax Reconciliation",headers:["Metric","Amount"],rows:[
      moneyRow("Period output tax",taxReport.periodOutputTax), moneyRow("Period input tax",taxReport.periodInputTax), moneyRow("Period purchase tax pending review",taxReport.periodPurchaseTaxPending),
      moneyRow("Closing output tax payable",taxReport.outputTaxPayable), moneyRow("Closing input tax credit",taxReport.inputTaxCredit), moneyRow("Closing purchase tax pending review",taxReport.purchaseTaxPending), moneyRow("Net tax position",taxReport.netTaxPosition),
    ]};
    if(tab==="financial"&&financial) return {name:"Financial Statements",headers:["Section","Account / Metric","Debit / Amount","Credit"],rows:[
      ...financial.trialBalance.map(r=>["Trial Balance",`${r.code} · ${r.name}`,r.debit,r.credit] as Array<string|number>),
      ...financial.profit.income.map(r=>["P&L Income",`${r.code} · ${r.name}`,r.amount,""] as Array<string|number>),
      ...financial.profit.expenses.map(r=>["P&L Expense",`${r.code} · ${r.name}`,r.amount,""] as Array<string|number>),
      ["P&L","Net profit / (loss)",financial.profit.netProfit,""],
      ["Balance Sheet","Total assets",financial.balance.totalAssets,""],["Balance Sheet","Total liabilities",financial.balance.totalLiabilities,""],["Balance Sheet","Total equity",financial.balance.totalEquity,""],["Balance Sheet","Difference",financial.balance.difference,""],
    ]};
    return {name:"Day End",headers:["Metric","Amount"],rows:[
      moneyRow("Total sales",dayEnd.totalSales),moneyRow("Service revenue",dayEnd.serviceRevenue),moneyRow("Cost of goods",dayEnd.costOfGoods),moneyRow("Gross profit",dayEnd.grossProfit),
      moneyRow("Total expenses",dayEnd.totalExpenses),moneyRow("Net profit",dayEnd.netProfit),moneyRow("Cash received",dayEnd.cashReceived),moneyRow("Card / UPI",dayEnd.cardPayments),moneyRow("Other payments",dayEnd.otherPayments),moneyRow("Outstanding",dayEnd.outstandingAmount),
    ]};
  },[tab,rows,stock,outstanding,payables,financial,taxReport,dayEnd,mayReadCustomerMargins,customerMargins,customerMarginError,mayReadProductMargins,productMargins,productMarginError,mayReadServiceMargins,serviceMargins,serviceMarginError,mayReadCashFlow,cashFlow,cashFlowError]);

  const exportCsv=()=>downloadFile(`minarva-${tab}-report.csv`,[exportData.headers.map(csvCell).join(","),...exportData.rows.map(r=>r.map(csvCell).join(","))].join("\n"),"text/csv;charset=utf-8");
  const exportExcel=()=>downloadFile(`minarva-${tab}-report.xls`,spreadsheetXml(exportData.name,exportData.headers,exportData.rows),"application/vnd.ms-excel;charset=utf-8");
  const pdfLines=exportData.rows.map(r=>r.map(String).join(" | "));
  const tabs: Array<[ReportTab,string]> = [["sales","Sales"],...(mayReadCustomerMargins ? [["customer-profit","Customer Margin"] as [ReportTab,string]] : []),...(mayReadProductMargins ? [["product-profit","Product Margin"] as [ReportTab,string]] : []),...(mayReadServiceMargins ? [["service-profit","Service Margin"] as [ReportTab,string]] : []),...(mayReadCashFlow ? [["cash-bank-flow","Cash / Bank Flow"] as [ReportTab,string]] : []),["dayend","Day-end"],["stock","Stock Valuation"],["receivables","Receivables"],["payables","Payables Aging"],["financial","Financial Statements"],["tax","GST / Tax"]];

  return <div className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="text-xl font-semibold text-slate-900">Reports & Analytics</h2><p className="text-sm text-slate-500">Operational, financial, receivable, payable, stock and tax reporting</p></div>
      <div className="flex flex-wrap gap-2 print:hidden">
        <Button variant="outline" onClick={onRefresh}>Refresh</Button>
        <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
        <Button variant="outline" onClick={exportExcel}>Export Excel</Button>
        <Button variant="outline" onClick={()=>window.print()}>Print</Button>
        <Button onClick={()=>downloadPdf(`minarva-${tab}-report.pdf`,`Minarva Biz — ${exportData.name}`,pdfLines)}>Download PDF</Button>
      </div>
    </div>

    {(onFromChange||onToChange)&&<div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 print:hidden">
      <label className="text-xs font-medium text-slate-600">From<input type="date" className="mt-1 block h-9 rounded-lg border border-slate-200 px-3 text-sm" value={from||""} onChange={e=>onFromChange?.(e.target.value)}/></label>
      <label className="text-xs font-medium text-slate-600">To / as of<input type="date" className="mt-1 block h-9 rounded-lg border border-slate-200 px-3 text-sm" value={to||""} onChange={e=>onToChange?.(e.target.value)}/></label>
      <span className="pb-2 text-xs text-slate-400">Range applies to sales, P&amp;L and tax movement. “To” is also the as-of date for Trial Balance, Balance Sheet and Payables Aging.</span>
    </div>}

    <div className="flex flex-wrap gap-2 print:hidden">{tabs.map(([id,label])=><Button key={id} size="sm" variant={tab===id?"primary":"outline"} onClick={()=>setTab(id)}>{label}</Button>)}</div>
    {reportError&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{reportError}</div>}

    {tab==="cash-bank-flow"&&mayReadCashFlow&&<Card>
      <CardHeader><CardTitle className="text-sm font-semibold">Posted journal Cash &amp; Bank Flow</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-slate-500">Actual posted ledger movements for the standard cash and bank accounts. Internal transfers are excluded from consolidated inflows and outflows. Not yet a classified operating/investing/financing statutory statement.</p>
        {cashFlowError&&<p role="alert" className="text-sm text-rose-700">{cashFlowError}</p>}
        {cashFlow&&<div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-600">Opening</div><div className="font-semibold">{formatMoney(cashFlow.openingTotal)}</div></div>
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-600">Net flow</div><div className="font-semibold">{formatMoney(cashFlow.netFlow)}</div></div>
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-600">Closing</div><div className="font-semibold">{formatMoney(cashFlow.closingTotal)}</div></div>
        </div>}
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase text-slate-500">
          <th className="px-2 py-2">Date</th><th className="px-2 py-2">Journal</th>
          <th className="px-2 py-2 text-right">Cash</th><th className="px-2 py-2 text-right">Bank</th>
          <th className="px-2 py-2 text-right">Net</th>
        </tr></thead><tbody>
          {cashFlow?.movements.map(row=><tr key={row.journalEntryId} className="border-b border-slate-100">
            <td className="px-2 py-2">{row.date}</td><td className="px-2 py-2" title={row.description}>{row.journalNumber}</td>
            <td className="px-2 py-2 text-right">{formatMoney(row.cashChange)}</td>
            <td className="px-2 py-2 text-right">{formatMoney(row.bankChange)}</td>
            <td className="px-2 py-2 text-right">{formatMoney(row.netCashFlow)}</td>
          </tr>)}
          {!cashFlow?.movements.length&&<tr><td colSpan={5} className="px-2 py-5 text-center text-slate-500">No posted cash or bank movements in this period</td></tr>}
        </tbody></table></div>
      </CardContent>
    </Card>}
    
    {tab==="service-profit"&&mayReadServiceMargins&&<Card>
      <CardHeader><CardTitle className="text-sm font-semibold">Delivered service direct-cost margin</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-slate-500">Service profitability by delivered order type. Uses net order value and recorded material/direct expenses. General overhead, payroll allocation, refunds and taxes not separately reconciled; not net P&amp;L.</p>
        {serviceMarginError&&<p role="alert" className="text-sm text-rose-700">{serviceMarginError}</p>}
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs uppercase text-slate-500">
            <th className="px-2 py-2">Service</th><th className="px-2 py-2 text-right">Delivered</th>
            <th className="px-2 py-2 text-right">Net order value</th><th className="px-2 py-2 text-right">Materials</th>
            <th className="px-2 py-2 text-right">Direct expenses</th><th className="px-2 py-2 text-right">Gross margin</th>
            <th className="px-2 py-2 text-right">Margin %</th>
          </tr></thead>
          <tbody>{serviceMargins.map(r=><tr key={r.serviceType} className="border-b border-slate-100">
            <td className="px-2 py-2">{r.serviceName}</td>
            <td className="px-2 py-2 text-right">{r.deliveredOrderCount}</td>
            <td className="px-2 py-2 text-right">{formatMoney(r.orderRevenue)}</td>
            <td className="px-2 py-2 text-right">{formatMoney(r.recordedMaterialCost)}</td>
            <td className="px-2 py-2 text-right">{formatMoney(r.recordedDirectExpenses)}</td>
            <td className="px-2 py-2 text-right font-semibold">{formatMoney(r.estimatedGrossProfit)}</td>
            <td className="px-2 py-2 text-right">{r.estimatedMarginPercent.toFixed(2)}%</td>
          </tr>)}
          {serviceMargins.length===0&&<tr><td colSpan={7} className="px-2 py-5 text-center text-slate-500">No delivered service orders in this date range</td></tr>}
          </tbody></table></div>
      </CardContent>
    </Card>}

    {tab==="product-profit"&&mayReadProductMargins&&<Card>
      <CardHeader><CardTitle className="text-sm font-semibold">Product-wise original posted invoice gross margin</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-slate-500">Original posted invoice product gross margin only. Historical cost per sale line, tax excluded. Returns/refunds, services, overhead and unallocated invoice discounts not netted.</p>
        {productMarginError&&<p role="alert" className="text-sm text-rose-700">{productMarginError}</p>}
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs uppercase text-slate-500">
            <th className="px-2 py-2">Product</th><th className="px-2 py-2">SKU</th>
            <th className="px-2 py-2 text-right">Invoices</th><th className="px-2 py-2 text-right">Sold qty</th>
            <th className="px-2 py-2 text-right">Sales ex tax</th>
            <th className="px-2 py-2 text-right">Historical COGS</th>
            <th className="px-2 py-2 text-right">Original gross profit</th><th className="px-2 py-2 text-right">Margin</th>
          </tr></thead><tbody>{productMargins.map(r=><tr key={r.productId} className="border-b border-slate-100">
            <td className="px-2 py-2">{r.productName}</td><td className="px-2 py-2">{r.sku??"—"}</td>
            <td className="px-2 py-2 text-right">{r.invoiceCount}</td><td className="px-2 py-2 text-right">{r.soldQuantity}</td>
            <td className="px-2 py-2 text-right">{formatMoney(r.revenueExcludingTax)}</td>
            <td className="px-2 py-2 text-right">{formatMoney(r.historicalCostOfGoods)}</td>
            <td className="px-2 py-2 text-right font-semibold">{formatMoney(r.originalGrossProfit)}</td>
            <td className="px-2 py-2 text-right">{r.originalGrossMarginPercent.toFixed(2)}%</td>
          </tr>)}
          {productMargins.length===0&&<tr><td colSpan={8} className="px-2 py-5 text-center text-slate-500">No posted product invoices in this date range</td></tr>}
          </tbody></table></div>
      </CardContent>
    </Card>}

    {tab==="customer-profit"&&mayReadCustomerMargins&&<Card>
      <CardHeader><CardTitle className="text-sm font-semibold">Customer-wise original posted invoice gross margin</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-slate-500">Original posted invoice gross margin only. Excludes later returns/refunds, service costs, and overhead. Not party-wise net profit.</p>
        {customerMarginError&&<p role="alert" className="text-sm text-rose-700">{customerMarginError}</p>}
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs uppercase text-slate-500">
            <th className="px-2 py-2">Customer</th><th className="px-2 py-2 text-right">Invoices</th>
            <th className="px-2 py-2 text-right">Sales ex tax</th><th className="px-2 py-2 text-right">Historical cost</th>
            <th className="px-2 py-2 text-right">Original gross profit</th><th className="px-2 py-2 text-right">Margin</th>
          </tr></thead><tbody>{customerMargins.map(r=><tr key={r.customerId} className="border-b border-slate-100">
            <td className="px-2 py-2">{r.customerName}</td><td className="px-2 py-2 text-right">{r.invoiceCount}</td>
            <td className="px-2 py-2 text-right">{formatMoney(r.revenueExcludingTax)}</td>
            <td className="px-2 py-2 text-right">{formatMoney(r.historicalCost)}</td>
            <td className="px-2 py-2 text-right font-semibold">{formatMoney(r.originalGrossProfit)}</td>
            <td className="px-2 py-2 text-right">{r.originalGrossMarginPercent.toFixed(2)}%</td>
          </tr>)}
          {customerMargins.length===0&&<tr><td colSpan={6} className="px-2 py-5 text-center text-slate-500">No posted customer invoices in this date range</td></tr>}
          </tbody></table></div>
      </CardContent>
    </Card>}

    {tab==="sales"&&<Card><CardHeader><CardTitle className="text-sm font-semibold">Sales summary</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase text-slate-400"><th>Period</th><th>Products</th><th>Services</th><th>Laundry</th><th>Revenue</th><th>Expenses</th><th>Net profit</th></tr></thead><tbody>{rows.map(r=><tr key={r.label} className="border-b border-slate-50"><td className="py-2 font-medium">{r.label}</td><td>{formatMoney(r.productSales)}</td><td>{formatMoney(r.serviceRevenue)}</td><td>{formatMoney(r.laundryRevenue)}</td><td>{formatMoney(r.totalRevenue)}</td><td>{formatMoney(r.expenses)}</td><td className="font-semibold">{formatMoney(r.netProfit)}</td></tr>)}</tbody></table></CardContent></Card>}

    {tab==="dayend"&&<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{[["Total sales",dayEnd.totalSales],["Service revenue",dayEnd.serviceRevenue],["Cost of goods",dayEnd.costOfGoods],["Gross profit",dayEnd.grossProfit],["Total expenses",dayEnd.totalExpenses],["Net profit",dayEnd.netProfit],["Cash received",dayEnd.cashReceived],["Card / UPI",dayEnd.cardPayments],["Other payments",dayEnd.otherPayments],["Outstanding",dayEnd.outstandingAmount]].map(([label,val])=><Card key={String(label)}><CardContent className="p-4"><div className="text-xs text-slate-500">{label}</div><div className="text-lg font-bold text-slate-900">{formatMoney(val as number)}</div></CardContent></Card>)}</div>}

    {tab==="stock"&&<Card><CardHeader><CardTitle className="text-sm font-semibold">Inventory stock valuation</CardTitle></CardHeader><CardContent className="overflow-x-auto p-4"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase text-slate-400"><th>Product</th><th>SKU</th><th>Stock</th><th>Minimum</th><th>Value</th><th>Low stock</th></tr></thead><tbody>{stock.map(r=><tr key={r.id} className="border-b border-slate-50"><td className="py-2 font-medium">{r.name}</td><td>{r.sku||"—"}</td><td>{r.stock}</td><td>{r.min}</td><td>{formatMoney(r.value)}</td><td>{r.low?"Yes":"No"}</td></tr>)}</tbody></table></CardContent></Card>}

    {tab==="receivables"&&<Card><CardHeader><CardTitle className="text-sm font-semibold">Customer receivables</CardTitle></CardHeader><CardContent className="space-y-2 p-4">{!outstanding.length&&<p className="text-sm text-slate-400">No outstanding receivables</p>}{outstanding.map(r=><div key={r.id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><div><div className="font-medium">{r.name}</div><div className="text-xs text-slate-500">{r.phone||""}</div></div><span className="font-semibold text-rose-600">{formatMoney(r.outstanding)}</span></div>)}</CardContent></Card>}

    {tab==="payables"&&<Card><CardHeader><CardTitle className="text-sm font-semibold">Supplier payables aging</CardTitle></CardHeader><CardContent className="overflow-x-auto p-0"><table className="min-w-[820px] w-full text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-2 text-left">Supplier</th><th className="px-3 py-2 text-right">Current</th><th className="px-3 py-2 text-right">1–30</th><th className="px-3 py-2 text-right">31–60</th><th className="px-3 py-2 text-right">61–90</th><th className="px-3 py-2 text-right">90+</th><th className="px-3 py-2 text-right">Outstanding</th></tr></thead><tbody>{!payables.length&&<tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">No supplier payables</td></tr>}{payables.map(r=><tr key={r.supplierId} className="border-t border-slate-100"><td className="px-3 py-2 font-medium">{r.supplierName}</td><td className="px-3 py-2 text-right">{formatMoney(r.current)}</td><td className="px-3 py-2 text-right">{formatMoney(r.days1to30)}</td><td className="px-3 py-2 text-right">{formatMoney(r.days31to60)}</td><td className="px-3 py-2 text-right">{formatMoney(r.days61to90)}</td><td className="px-3 py-2 text-right">{formatMoney(r.days90plus)}</td><td className="px-3 py-2 text-right font-semibold">{formatMoney(r.totalOutstanding)}</td></tr>)}</tbody></table></CardContent></Card>}

    {tab==="financial"&&<div className="space-y-4">{!financial?<Card><CardContent className="p-6 text-sm text-slate-400">Financial statements unavailable</CardContent></Card>:<>
      <Card><CardHeader><CardTitle className="text-sm font-semibold">Trial Balance {to?`· as of ${to}`:""}</CardTitle></CardHeader><CardContent className="overflow-x-auto p-0"><table className="min-w-[720px] w-full text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-2 text-left">Code</th><th className="px-3 py-2 text-left">Account</th><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th></tr></thead><tbody>{financial.trialBalance.map(r=><tr key={r.accountId} className="border-t border-slate-100"><td className="px-3 py-2 font-mono">{r.code}</td><td className="px-3 py-2">{r.name}</td><td className="px-3 py-2">{r.type}</td><td className="px-3 py-2 text-right">{r.debit?formatMoney(r.debit):"—"}</td><td className="px-3 py-2 text-right">{r.credit?formatMoney(r.credit):"—"}</td></tr>)}</tbody></table></CardContent></Card>
      <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle className="text-sm font-semibold">Profit & Loss</CardTitle></CardHeader><CardContent className="space-y-4"><StatementSection title="Income" rows={financial.profit.income} total={financial.profit.totalIncome}/><StatementSection title="Expenses" rows={financial.profit.expenses} total={financial.profit.totalExpenses}/><div className="flex justify-between rounded-xl bg-slate-100 p-3 font-semibold"><span>Net profit / (loss)</span><span>{formatMoney(financial.profit.netProfit)}</span></div></CardContent></Card><Card><CardHeader><CardTitle className="text-sm font-semibold">Balance Sheet</CardTitle></CardHeader><CardContent className="space-y-4"><StatementSection title="Assets" rows={financial.balance.assets} total={financial.balance.totalAssets}/><StatementSection title="Liabilities" rows={financial.balance.liabilities} total={financial.balance.totalLiabilities}/><StatementSection title="Recorded equity" rows={financial.balance.equity} total={financial.balance.recordedEquity}/><div className="space-y-2 rounded-xl bg-slate-100 p-3 text-sm"><div className="flex justify-between"><span>Unclosed earnings</span><span>{formatMoney(financial.balance.unclosedEarnings)}</span></div><div className="flex justify-between font-semibold"><span>Total equity</span><span>{formatMoney(financial.balance.totalEquity)}</span></div><div className="flex justify-between font-semibold"><span>Liabilities + equity</span><span>{formatMoney(financial.balance.liabilitiesAndEquity)}</span></div></div><p className={financial.balance.balanced?"text-sm text-emerald-700":"text-sm text-rose-700"}>{financial.balance.balanced?"Balance sheet balanced":`Balance sheet difference: ${formatMoney(financial.balance.difference)}`}</p></CardContent></Card></div>
    </>}</div>}

    {tab==="tax"&&<div className="space-y-4">{!taxReport?<Card><CardContent className="p-6 text-sm text-slate-400">Tax reconciliation unavailable</CardContent></Card>:<>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Card><CardContent className="p-4"><div className="text-xs text-slate-500">Period output tax</div><div className="text-lg font-bold">{formatMoney(taxReport.periodOutputTax)}</div></CardContent></Card><Card><CardContent className="p-4"><div className="text-xs text-slate-500">Period input tax</div><div className="text-lg font-bold">{formatMoney(taxReport.periodInputTax)}</div></CardContent></Card><Card><CardContent className="p-4"><div className="text-xs text-slate-500">Purchase tax pending review</div><div className="text-lg font-bold">{formatMoney(taxReport.periodPurchaseTaxPending)}</div></CardContent></Card><Card><CardContent className="p-4"><div className="text-xs text-slate-500">Net tax position</div><div className="text-lg font-bold">{formatMoney(taxReport.netTaxPosition)}</div><div className="text-[11px] text-slate-400">{taxReport.netTaxPosition>=0?"Net payable":"Net credit"}</div></CardContent></Card></div>
      <Card><CardHeader><CardTitle className="text-sm font-semibold">GST / Tax reconciliation</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Closing output tax payable</div><div className="font-semibold">{formatMoney(taxReport.outputTaxPayable)}</div></div><div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Closing input tax credit</div><div className="font-semibold">{formatMoney(taxReport.inputTaxCredit)}</div></div><div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Purchase tax pending review</div><div className="font-semibold">{formatMoney(taxReport.purchaseTaxPending)}</div></div><div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Period</div><div className="font-semibold">{taxReport.from||"Beginning"} → {taxReport.to||"Current"}</div></div></div>{taxReport.reviewRequired&&<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">Purchase tax remains in “Pending Review”. Classify eligible input tax before treating it as Input Tax Credit.</div>}<p className="text-xs text-slate-500">Ledger-based reconciliation from posted accounting entries. This is an internal reconciliation report, not a filed GST return.</p></CardContent></Card>
    </>}</div>}
  </div>;
}
