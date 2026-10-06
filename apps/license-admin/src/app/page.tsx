import AdminPanel from "./AdminPanel";

export const dynamic = "force-dynamic";

export default function LicenseAdminHome() {
  return (
    <AdminPanel
      identity={null}
      initialLicenses={[]}
      initialSupportRequests={[]}
    />
  );
}
