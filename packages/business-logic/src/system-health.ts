/** System health snapshot for status page */
import * as store from "./store";
import * as ordersStore from "./orders-store";
import { getTaxConfig } from "./tax-config";
import { getShopProfile } from "./shop-profile";
import { getStoredLicense } from "@minarvabiz/licensing";

export function getSystemHealth() {
  const license = getStoredLicense();
  return {
    version: "1.0.0-rc",
    edition: "hybrid",
    timestamp: new Date().toISOString(),
    products: store.listProducts().length,
    customers: store.listCustomers().length,
    sales: store.listSales().length,
    orders: ordersStore.listOrders().length,
    shopName: getShopProfile().shopName,
    taxEnabled: getTaxConfig().enableGst,
    license: license
      ? {
          plan: license.plan,
          edition: license.edition,
          activatedAt: license.activatedAt,
        }
      : null,
    memoryHint: typeof performance !== "undefined" ? "browser" : "server",
  };
}
