"use client";

import * as React from "react";
import {buildLoanRepaymentPlan,type LoanRepaymentPlan} from "@minarvabiz/business-logic";
import {Button} from "../Button";
import {Card,CardContent,CardHeader,CardTitle} from "../Card";
import {FormField,inputClass} from "../forms/FormField";
import {formatMoney} from "../customers/format";

/** Preview only. Not a loan ledger, mandate or payment authorization. */
export function LoanRepaymentPanel(){
  const [reference,setReference]=React.useState("");
  const [principal,setPrincipal]=React.useState("");
  const [annualRate,setAnnualRate]=React.useState("12");
  const [months,setMonths]=React.useState("12");
  const [firstDate,setFirstDate]=React.useState("");
  const [plan,setPlan]=React.useState<LoanRepaymentPlan|null>(null);
  const [error,setError]=React.useState<string|null>(null);
  function reset(){setPlan(null);setError(null);}
  function preview(){
    reset();
    try{setPlan(buildLoanRepaymentPlan({
      loanReference:reference,principal,annualRatePercent:annualRate,
      termMonths:Number(months),firstPaymentDate:firstDate,
    }));}catch(e){setError(e instanceof Error?e.message:"Unable to generate loan schedule");}
  }
  function exportCsv(){
    if(!plan)return;
    setError(null);
    try{
      const url=URL.createObjectURL(new Blob(["\uFEFF",plan.csv],{type:"text/csv;charset=utf-8"}));
      const link=document.createElement("a");
      link.href=url;
      link.download="minarvabiz-loan-"+plan.periods[0].paymentDate+".csv";
      document.body.appendChild(link);
      try{link.click();}finally{link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
    }catch(e){setError(e instanceof Error?e.message:"Loan CSV export failed");}
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Loan Repayment / EMI Planner</CardTitle>
        <p className="text-xs text-slate-600">
          Calculate a fixed-rate loan repayment schedule using nominal annual rate,
          monthly reducing-balance interest and final-instalment adjustment.
          No loan record, auto-debit, journal or interest charge is posted.
          Actual lender calculations and fees may differ.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <FormField label="Loan reference">
            <input aria-label="Loan reference" className={inputClass} maxLength={128}
              value={reference} onChange={e=>{setReference(e.target.value);reset();}}
              placeholder="LN-2026-01" />
          </FormField>
          <FormField label="Loan principal">
            <input aria-label="Loan principal" className={inputClass} value={principal}
              inputMode="decimal" onChange={e=>{setPrincipal(e.target.value);reset();}}
              placeholder="100000.00" />
          </FormField>
          <FormField label="Annual interest rate (%)">
            <input aria-label="Annual loan interest rate" className={inputClass}
              value={annualRate} inputMode="decimal"
              onChange={e=>{setAnnualRate(e.target.value);reset();}} />
          </FormField>
          <FormField label="Loan term (1–360 months)">
            <input aria-label="Loan repayment months" className={inputClass}
              type="number" min={1} max={360} step={1} value={months}
              onChange={e=>{setMonths(e.target.value);reset();}} />
          </FormField>
          <FormField label="First payment due date">
            <input aria-label="First loan payment date" className={inputClass}
              type="date" value={firstDate} onChange={e=>{setFirstDate(e.target.value);reset();}} />
          </FormField>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={preview}>Preview loan repayments</Button>
          {plan&&<Button size="sm" variant="outline" onClick={exportCsv}>Export loan schedule CSV</Button>}
        </div>
        {error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}
        {plan&&(
          <div className="space-y-3">
            <p role="status" className="text-sm font-semibold text-slate-800">
              {plan.loanReference} · Scheduled EMI {formatMoney(plan.plannedMonthlyPayment)} ·
              Total interest {formatMoney(plan.totalInterest)} ·
              Total repayment {formatMoney(plan.totalPayments)}
            </p>
            <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
              <table className="min-w-[750px] w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-slate-600">
                  <tr><th className="p-2">Period</th><th className="p-2">Due date</th>
                    <th className="p-2 text-right">Opening</th>
                    <th className="p-2 text-right">Payment</th>
                    <th className="p-2 text-right">Principal</th>
                    <th className="p-2 text-right">Interest</th>
                    <th className="p-2 text-right">Remaining</th></tr>
                </thead>
                <tbody>{plan.periods.map(row=>(
                  <tr key={row.month} className="border-t border-slate-100">
                    <td className="p-2">{row.month}</td>
                    <td className="p-2">{row.paymentDate}</td>
                    <td className="p-2 text-right">{formatMoney(row.openingPrincipal)}</td>
                    <td className="p-2 text-right">{formatMoney(row.payment)}</td>
                    <td className="p-2 text-right">{formatMoney(row.principalPaid)}</td>
                    <td className="p-2 text-right">{formatMoney(row.interestPaid)}</td>
                    <td className="p-2 text-right">{formatMoney(row.closingPrincipal)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
