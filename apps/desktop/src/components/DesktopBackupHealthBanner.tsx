import * as React from "react";
import { Button } from "@minarvabiz/ui";

export function DesktopBackupHealthBanner({
  error, onOpenBackups,
}: {
  error: string | null;
  onOpenBackups: () => void;
}) {
  if (!error) return null;
  return (
    <section role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
      <div>
        <strong>Recovery backup not confirmed.</strong>
        <p>Product changes may be saved locally, but the separate backup failed: {error}</p>
      </div>
      <Button type="button" variant="outline" onClick={onOpenBackups}>Check backups</Button>
    </section>
  );
}
