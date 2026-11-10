import type {Metadata} from "next";
import {LegalPageShell} from "@/components/LegalPageShell";
export const metadata:Metadata={title:"Refund Policy | Minarva Biz",description:"How to request a refund or report a subscription billing error."};
export default function RefundPolicyPage(){return <LegalPageShell title="Refund Policy" description="Guidance for subscription charges, billing mistakes and refund enquiries.">
 <section><h2>Before you pay</h2><p>Review the annual plan, applicable taxes, available features and account details at checkout. A trial does not authorize a charge by itself. Paid access requires a confirmed payment made through the supported payment gateway.</p></section>
 <section><h2>Requesting a review</h2><p>If you were charged incorrectly, paid more than once, could not activate a paid subscription, or wish to request a refund, email <a href="mailto:minarvatechnologies@gmail.com">minarvatechnologies@gmail.com</a> with your registered business email, payment reference, amount, date and a description. Do not send card numbers, passwords or OTPs.</p></section>
 <section><h2>Eligibility and processing</h2><p>Refund requests are reviewed against the applicable law, the order terms and the circumstances of the charge. We do not promise automatic refunds for all used subscription periods. Approved refunds are processed through the original payment provider where supported, with settlement timing determined by banking and provider processes.</p></section>
 <section><h2>Access and disputes</h2><p>Requesting a refund does not automatically remove or change your account data. Contact support promptly for disputed transactions. This policy does not limit non-waivable statutory rights.</p></section>
 </LegalPageShell>;}
