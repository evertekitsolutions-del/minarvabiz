import AdminPanel from "./AdminPanel";
import { firstAdminBootstrapStatus, listLicenses, listSupportRequests } from "./actions";

export default async function LicenseAdminHome() {
  const [result, bootstrap, support] = await Promise.all([listLicenses(), firstAdminBootstrapStatus(), listSupportRequests()]);
  return (
    <AdminPanel
      identity={result.identity || null}
      initialLicenses={result.licenses || []}
      bootstrapAvailable={bootstrap.available}
    />
  );
}
