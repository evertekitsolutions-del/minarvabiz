import AdminPanel from "./AdminPanel";
import { listLicenses } from "./actions";

export default async function LicenseAdminHome() {
  const result = await listLicenses();
  return <AdminPanel identity={result.identity || null} initialLicenses={result.licenses || []} />;
}
