import { Button, Card, CardContent, CardHeader, CardTitle } from "@minarvabiz/ui";
export default function LicenseAdminHome() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Minarva Biz — License Admin</h1>
          <p className="mt-2 text-sm text-slate-500">Create, activate, revoke, and manage commercial licenses</p>
        </div>
        <Card>
          <CardHeader><CardTitle>Phase 1 — Admin Shell Ready</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">
              Licensing package (Ed25519 signing, validation, fingerprinting) and admin shell are in place.
              Full CRUD arrives in Phase 9.
            </p>
            <div className="flex gap-3"><Button>Manage Licenses</Button><Button variant="outline">Generate Keys</Button></div>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-slate-400">Restricted access · Port 3001 · v0.1.0</p>
      </div>
    </main>
  );
}
