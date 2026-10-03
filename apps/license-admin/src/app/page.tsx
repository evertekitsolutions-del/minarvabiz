import { cookies } from "next/headers";
import AdminPanel from "./AdminPanel";
import {
  listLicenses,
  listSupportRequests,
} from "./actions";
import { ADMIN_COOKIE, readAdminSessionToken } from "../lib/admin-session";

export default async function LicenseAdminHome() {
  const cookieStore = await cookies();
  const claims = readAdminSessionToken(cookieStore.get(ADMIN_COOKIE)?.value || "");
  const emergencySession = claims?.identity.source === "emergency";

  if (!emergencySession) {
    return (
      <AdminPanel
        identity={null}
        initialLicenses={[]}
        initialSupportRequests={[]}
      />
    );
  }

  const [licenses, support] = await Promise.all([
    listLicenses(),
    listSupportRequests(),
  ]);

  return (
    <AdminPanel
      identity={licenses.identity || null}
      initialLicenses={licenses.licenses || []}
      initialSupportRequests={support.requests || []}
    />
  );
}
