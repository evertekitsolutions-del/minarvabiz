"use client";
import {AccountingPanel} from "@minarvabiz/ui";
import {getRuntimeMode} from "@minarvabiz/business-logic";
import {SaasFinanceAccountingPanel} from "./saas-finance-accounting-panel";
export default function AccountingPage(){
 return getRuntimeMode()==="demo"?<AccountingPanel/>:<SaasFinanceAccountingPanel/>;
}
