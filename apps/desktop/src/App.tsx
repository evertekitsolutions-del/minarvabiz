import { Button, Card, CardContent, CardHeader, CardTitle } from "@minarvabiz/ui";
export function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-8">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">MINARVA BIZ</h1>
          <p className="mt-2 text-slate-500">Offline / Hybrid Desktop Edition</p>
        </div>
        <Card>
          <CardHeader><CardTitle>Phase 1 — Desktop Shell Ready</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">Electron shell foundation, secure preload, and shared packages are in place.</p>
            <div className="flex gap-3"><Button>Continue</Button><Button variant="outline">Settings</Button></div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
