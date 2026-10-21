/**
 * CRM-014 — manual customer dues reminder.
 *
 * Opens a user-reviewed WhatsApp COMPOSER only. Never sends a message,
 * schedules contact, changes customer balance, posts a payment or records
 * delivery. The host's CURRENT customer record is authoritative.
 */
import type { Customer } from "@minarvabiz/types";
import { formatMoney, toMinorUnits } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { getActiveBranch } from "./phase9-store";
import { getShopProfile } from "./shop-profile";
import { getCustomer } from "./store";
import { buildManualServiceWhatsAppLink } from "./manual-service-whatsapp";

export interface ManualCustomerDuesReminder {
  readonly customerId: string;
  readonly customerName: string;
  readonly outstandingBalance: number;
  readonly formattedBalance: string;
  readonly message: string;
  readonly whatsappUrl: string;
}

export function composeManualCustomerDuesReminder(
  customer: Pick<Customer, "id" | "name" | "phone" | "whatsapp" | "outstandingBalance" | "deletedAt">,
  shop: { shopName: string; currency: string; phone?: string | null },
): ManualCustomerDuesReminder {
  if (customer.deletedAt) throw new Error("Archived customers cannot receive payment reminders");
  const dueMinor = toMinorUnits(customer.outstandingBalance);
  if (dueMinor <= 0) throw new Error("No outstanding customer balance to remind");
  const rawName = customer.name.trim();
  if (!rawName) throw new Error("Customer name is missing");
  const shopName = shop.shopName.trim();
  if (!shopName) throw new Error("Business profile name is missing");
  // This release uses the existing two-decimal application money model;
  // do not silently format unknown currencies as INR.
  const currency = shop.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Business currency is invalid");
  const formattedBalance = formatMoney(customer.outstandingBalance, currency);
  const replyPhone = shop.phone?.trim() || "";
  const message = [
    "Hello " + rawName + ",",
    "",
    "This is a payment reminder from " + shopName + ".",
    "Our records show an outstanding account balance of " + formattedBalance + ".",
    "Please review the amount and contact us if you have already paid or need a statement.",
    replyPhone ? "For assistance: " + replyPhone : "",
    "",
    "Thank you,",
    shopName,
  ].filter((line, index, items) => line !== "" || items[index + 1] !== "").join("\n");
  const whatsappUrl = buildManualServiceWhatsAppLink(
    customer.whatsapp?.trim() || customer.phone?.trim() || "", message,
  );
  return {
    customerId: customer.id,
    customerName: rawName,
    outstandingBalance: customer.outstandingBalance,
    formattedBalance,
    message,
    whatsappUrl,
  };
}

/** Role, branch, contact, and live balance are checked at EACH preview/open. */
export function buildAuthorizedCustomerDuesReminder(customerId: string): ManualCustomerDuesReminder {
  assertPermission("payments.collect");
  if (!customerId.trim()) throw new Error("Customer ID is required");
  const customer = getCustomer(customerId);
  if (!customer) throw new Error("Customer not found or archived");
  const branch = getActiveBranch();
  if (customer.branchId != null && (!branch || customer.branchId !== branch.id)) {
    throw new Error("Customer is outside the active branch");
  }
  const shop = getShopProfile();
  return composeManualCustomerDuesReminder(customer, shop);
}
