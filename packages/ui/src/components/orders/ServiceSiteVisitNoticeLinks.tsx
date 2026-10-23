"use client";

import * as React from "react";
import type { Customer } from "@minarvabiz/types";
import { buildManualServiceWhatsAppLink, parseGoogleReviewUrl } from "@minarvabiz/business-logic";
import type { ServiceSiteVisit } from "@minarvabiz/business-logic";
import { availableVisitNoticeKinds, buildVisitNoticeMessage, serviceVisitNoticeLabel } from "./service-site-visit-notices";

/** No background send. Explicit WhatsApp compose links for the same branch/customer only. */
export function ServiceSiteVisitNoticeLinks({ visit, customer, orderNumber, businessName, technicianName, googleReviewUrl, canShare }: {
  visit: ServiceSiteVisit;
  customer: Customer | undefined;
  orderNumber: string;
  businessName: string;
  technicianName: string;
  googleReviewUrl: string;
  canShare: boolean;
}) {
  if (!canShare || !customer || customer.deletedAt ||
    customer.id !== visit.customerId || (customer.branchId && customer.branchId !== visit.branchId)) {
    return null;
  }
  const phone = customer.whatsapp || customer.phone;
  if (!phone) return null;

  const links = availableVisitNoticeKinds(visit.status).flatMap(kind => {
    try {
      let message = buildVisitNoticeMessage(kind, {
        status: visit.status, orderNumber, businessName, technicianName,
        scheduledOn: visit.scheduledOn, siteAddress: visit.siteAddress,
        arrivedAt: visit.arrivedAt, completedAt: visit.completedAt,
      });
      if (kind === "feedback" && googleReviewUrl.trim()) {
        message += "\nOptional Google review: " + parseGoogleReviewUrl(googleReviewUrl);
      }
      return [{ kind, url: buildManualServiceWhatsAppLink(phone, message) }];
    } catch {
      return [];
    }
  });
  if (!links.length) return null;
  return <div className="mt-2 flex flex-col gap-1" aria-label="Manual site visit WhatsApp updates">
    {links.map(({ kind, url }) => <a key={kind} href={url} target="_blank"
      rel="noopener noreferrer" className="text-xs font-medium text-indigo-700 underline underline-offset-2">
      WhatsApp: {serviceVisitNoticeLabel(kind)}
    </a>)}
    <span className="text-[11px] text-slate-500">Opens WhatsApp compose; sending requires operator action and customer permission.</span>
  </div>;
}
