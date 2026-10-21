/**
 * FIN-019 — Fixed-rate loan amortization preview for bookkeeping planning.
 * Original portable TypeScript; inspired by common ERP loan schedule workflows.
 * Does not create a ledger loan or authorize any payment/interest posting.
 */
export interface LoanRepaymentInput {
  readonly loanReference: string;
  readonly principal: string;
  /** Nominal annual rate (APR-like percentage), 0 to 100, max 4 decimals. */
  readonly annualRatePercent: string;
  readonly termMonths: number;
  readonly firstPaymentDate: string;
}
export interface LoanRepaymentPeriod {
  readonly month: number;
  readonly paymentDate: string;
  readonly openingPrincipal: number;
  readonly payment: number;
  readonly principalPaid: number;
  readonly interestPaid: number;
  readonly closingPrincipal: number;
}
export interface LoanRepaymentPlan {
  readonly loanReference: string;
  readonly principal: number;
  readonly ratePercent: number;
  readonly termMonths: number;
  readonly plannedMonthlyPayment: number;
  readonly totalInterest: number;
  readonly totalPayments: number;
  readonly periods: readonly LoanRepaymentPeriod[];
  readonly csv: string;
}
function parseCents(rawInput: string): number {
  const raw=rawInput.trim();
  if (!/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(raw)) throw new Error("Principal must be an exact two-decimal amount");
  const [whole, frac=""] = raw.split(".");
  const cents=Number(whole)*100+Number(frac.padEnd(2,"0"));
  if (!Number.isSafeInteger(cents) || cents<=0) throw new Error("Principal must be positive and within safe range");
  return cents;
}
function rateScaled(rawInput: string): number {
  const raw=rawInput.trim();
  if(!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,4})?$/.test(raw)) throw new Error("Annual interest rate supports up to four decimal places");
  const [whole, frac=""] = raw.split(".");
  const scaled=Number(whole)*10000+Number(frac.padEnd(4,"0"));
  if(!Number.isSafeInteger(scaled)||scaled>1000000)throw new Error("Annual rate must be between 0% and 100%");
  return scaled;
}
function readDate(value:string): {year:number;month:number;day:number}{
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(value))throw new Error("Payment date must be YYYY-MM-DD");
  const [year,month,day]=value.split("-").map(Number);
  const d=new Date(Date.UTC(year,month-1,day));
  if(d.getUTCFullYear()!==year||d.getUTCMonth()+1!==month||d.getUTCDate()!==day){
    throw new Error("Invalid first payment date");
  }
  return {year,month,day};
}
function nextDate(start:ReturnType<typeof readDate>, offset:number):string{
  const first=new Date(Date.UTC(start.year,start.month-1+offset,1));
  const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(start.day,last))).toISOString().slice(0,10);
}
function add(a:number,b:number):number {
  const out=a+b;
  if(!Number.isSafeInteger(out))throw new Error("Loan schedule totals exceed safe monetary limits");
  return out;
}
function csvCell(value:string|number):string{
  const raw=String(value);
  const safe=/^[\s\uFEFF]*[=+\-@\t\r]/u.test(raw)?"'"+raw:raw;
  return '"'+safe.replace(/"/g,'""')+'"';
}

/**
 * Monthly nominal interest computed on outstanding principal and rounded
 * half-up to cents; final installment adjusts to clear remaining principal.
 * No daily-interest proration, compounding beyond monthly cycle, or fees.
 */
export function buildLoanRepaymentPlan(input:LoanRepaymentInput):LoanRepaymentPlan{
  const loanReference=input.loanReference.trim();
  if(!loanReference||loanReference.length>128)throw new Error("Loan reference is required (max 128 characters)");
  if(!Number.isInteger(input.termMonths)||input.termMonths<1||input.termMonths>360){
    throw new Error("Loan term must be 1 to 360 whole months");
  }
  const start=readDate(input.firstPaymentDate);
  const principalCents=parseCents(input.principal);
  if(principalCents<input.termMonths)throw new Error("Loan principal is too small for monthly installments");
  const rate=rateScaled(input.annualRatePercent);
  const monthlyRate=rate/12000000;
  const nominalEmi=rate===0
    ? principalCents/input.termMonths
    : principalCents*monthlyRate/(1-Math.pow(1+monthlyRate,-input.termMonths));
  const emi=Math.max(1,Math.round(nominalEmi));
  if(!Number.isSafeInteger(emi)||emi<=0)throw new Error("Loan monthly installment exceeds monetary limits");
  const periods:LoanRepaymentPeriod[]=[];
  let balance=principalCents,totalInterest=0,totalPayments=0;
  for(let i=0;i<input.termMonths;i++){
    const opening=balance;
    const numerator=BigInt(balance)*BigInt(rate);
    const denom=12000000n; // 12 months x 100 (%) x 10,000 precision
    const interest=Number((numerator+denom/2n)/denom);
    const payment=i===input.termMonths-1 ? add(balance,interest)
      : Math.min(add(balance,interest),Math.max(emi,interest+1));
    const principal=payment-interest;
    if(principal<0||principal>balance)throw new Error("Loan repayment would overdraw principal");
    balance-=principal;
    totalInterest=add(totalInterest,interest);
    totalPayments=add(totalPayments,payment);
    periods.push({
      month:i+1,paymentDate:nextDate(start,i),
      openingPrincipal:opening/100,payment:payment/100,
      principalPaid:principal/100,interestPaid:interest/100,
      closingPrincipal:balance/100,
    });
  }
  if(balance!==0||totalPayments!==add(principalCents,totalInterest)){
    throw new Error("Loan payment schedule does not reconcile");
  }
  const csv=[
    ["Loan reference","Month","Payment date","Opening principal","Payment",
      "Principal paid","Interest paid","Closing principal"],
    ...periods.map(row=>[
      loanReference,String(row.month),row.paymentDate,row.openingPrincipal.toFixed(2),
      row.payment.toFixed(2),row.principalPaid.toFixed(2),
      row.interestPaid.toFixed(2),row.closingPrincipal.toFixed(2),
    ]),
  ].map(row=>row.map(csvCell).join(",")).join("\r\n")+"\r\n";
  return {
    loanReference,principal:principalCents/100,ratePercent:rate/10000,
    termMonths:input.termMonths,plannedMonthlyPayment:emi/100,
    totalInterest:totalInterest/100,totalPayments:totalPayments/100,periods,csv,
  };
}
