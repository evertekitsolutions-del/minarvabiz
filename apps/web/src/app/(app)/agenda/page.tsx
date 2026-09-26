"use client";

import { useRouter } from "next/navigation";
import { BusinessAgenda } from "@minarvabiz/ui";
import { ordersStore } from "@minarvabiz/business-logic";

export default function BusinessAgendaPage() {
  const router = useRouter();
  return <BusinessAgenda orders={ordersStore.listOrders()} onOpenOrders={() => router.push("/services")} />;
}
