import { addMinorUnits } from "@minarvabiz/utils";

export function laundryAllocationMinorFromPayment(notes: string, orderNumber: string): number | null {
  const segment = notes.split(" · ").find((part) => part.startsWith("Laundry: "));
  if (!segment) return 0;
  const entries = segment.slice("Laundry: ".length).split(", ").filter(Boolean);
  let totalMinor = 0;
  for (const entry of entries) {
    const splitAt = entry.lastIndexOf(" ");
    if (splitAt <= 0) return null;
    const label = entry.slice(0, splitAt);
    const rawAmount = entry.slice(splitAt + 1);
    const match = /^(\d+)\.(\d{2})$/.exec(rawAmount);
    if (!match) return null;
    try {
      const parsed = BigInt(match[1] || "0") * 100n + BigInt(match[2] || "0");
      if (parsed <= 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      if (label === orderNumber) {
        totalMinor = addMinorUnits(totalMinor, Number(parsed));
      }
    } catch {
      return null;
    }
  }
  return totalMinor;
}
