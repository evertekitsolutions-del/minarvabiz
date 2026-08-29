import { AppLayoutClient } from "@/components/AppLayoutClient";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return <AppLayoutClient>{children}</AppLayoutClient>;
}
