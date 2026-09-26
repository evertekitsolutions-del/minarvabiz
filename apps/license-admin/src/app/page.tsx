import AdminPanel from "./AdminPanel";
import { firstAdminBootstrapStatus, listLicenses } from "./actions";

export default async function LicenseAdminHome() {
  const [result, bootstrap] = await Promise.all([listLicenses(), firstAdminBootstrapStatus()]);
  return (
    <AdminPanel
      identity={result.identity || null}
      initialLicenses={result.licenses || []}
      bootstrapAvailable={bootstrap.available}
    />
  );
}
