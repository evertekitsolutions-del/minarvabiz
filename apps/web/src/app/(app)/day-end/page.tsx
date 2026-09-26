import { redirect } from "next/navigation";

export default function DayEndRoute() {
  redirect("/reports#day-end-close");
}
