"use client";
import * as React from "react";
import type { LaundryOrder } from "@minarvabiz/types";
import {
  availableLaundryWhatsAppMessages, getShopProfile,
  laundryManualWhatsAppLink, store,
} from "@minarvabiz/business-logic";
import { Button } from "../Button";

export function LaundryWhatsAppActions({order}:{order:LaundryOrder}) {
  const [error,setError] = React.useState<string | null>(null);
  const customer=store.getCustomer(order.customerId);
  const phone=customer?.whatsapp?.trim() || customer?.phone?.trim() || "";
  const shop=getShopProfile();
  const templates=availableLaundryWhatsAppMessages(order,shop.shopName,shop.googleReviewUrl);
  const send=(template:typeof templates[number])=>{
    try {
      const url=laundryManualWhatsAppLink(phone,template);
      window.open(url,"_blank","noopener,noreferrer");
      setError(null);
    } catch(e) {setError(e instanceof Error?e.message:"Could not open WhatsApp");}
  };
  return <section className="rounded-xl border border-slate-200 p-3">
    <h3 className="text-sm font-semibold text-slate-900">Manual WhatsApp updates</h3>
    <p className="mt-1 text-xs text-slate-500">Opens WhatsApp with a prepared message. The operator must review and send it; nothing is sent automatically.</p>
    {!phone ? <p className="mt-2 text-xs text-amber-700">Add a WhatsApp number to the customer profile before sharing.</p> :
      <div className="mt-2 flex flex-wrap gap-2">
        {templates.length?templates.map(template=><Button key={template.id} size="sm" variant="outline" onClick={()=>send(template)}>{template.label}</Button>)
          : <p className="text-xs text-slate-500">No messages available for this ticket status.</p>}
      </div>}
    {error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
  </section>;
}
