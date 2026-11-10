import type {Metadata} from "next";
import {LegalPageShell} from "@/components/LegalPageShell";
export const metadata:Metadata={title:"Support & Contact | Minarva Biz",description:"Get assistance with Minarva Biz accounts, billing and cloud ERP."};
export default function SupportPage(){return <LegalPageShell title="Support & Contact" description="Help with account access, billing, feature availability and business operations.">
 <section><h2>Contact support</h2><p>Email <a href="mailto:minarvatechnologies@gmail.com?subject=Minarva%20Biz%20Support">minarvatechnologies@gmail.com</a> and include your registered business email, affected module, relevant error message and approximate time. Do not include passwords, private keys, OTPs or complete payment-card data.</p></section>
 <section><h2>Account and subscriptions</h2><p>For sign-in problems use the <a href="/forgot-password">password reset</a> flow. For plan details review <a href="/pricing">pricing</a>. For billing issues include the payment reference and consult the <a href="/refund-policy">refund policy</a>.</p></section>
 <section><h2>Data protection requests</h2><p>Privacy, export and data correction requests can be sent to the same support address. Account ownership may need to be verified before requests are processed. See the <a href="/privacy">Privacy Policy</a>.</p></section>
 </LegalPageShell>;}
