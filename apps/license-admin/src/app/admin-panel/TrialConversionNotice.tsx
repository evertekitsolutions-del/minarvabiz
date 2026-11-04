"use client";

export function TrialConversionNotice({ onCancel }: { onCancel: () => void }) {
  return (
    <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
      Paid conversion mode: the selected trial registration ID will be reused as the license customer ID. No new customer identity will be created.
      <button type="button" className="ml-3 font-semibold underline" onClick={onCancel}>Cancel conversion</button>
    </div>
  );
}
