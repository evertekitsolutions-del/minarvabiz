import { Button, Card, CardContent, CardHeader, CardTitle } from "@minarvabiz/ui";
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">MINARVA BIZ</h1>
          <p className="mt-2 text-slate-500">Commercial Boutique Billing & Management Software</p>
        </div>
        <Card>
          <CardHeader><CardTitle>Phase 1 — Foundation Ready</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">
              Online · Offline · Hybrid architecture scaffold is in place.
              Shared packages, licensing foundation, and database schemas are ready for Phase 2.
            </p>
            <div className="flex gap-3">
              <Button>Continue</Button>
              <Button variant="outline">Documentation</Button>
            </div>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-slate-400">Edition: Online / Hybrid · v0.1.0</p>
      </div>
    </main>
  );
}
