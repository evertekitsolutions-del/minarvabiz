import AdminPanel from "./AdminPanel";
import { listLicenses } from "./actions";

export default async function LicenseAdminHome() {
  const result = await listLicenses();
  return <AdminPanel authenticated={result.ok} initialLicenses={result.licenses || []} />;
}
