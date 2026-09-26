/**
 * Dependency-free business-day lock state.
 *
 * Transaction stores import this module directly so Day-end governance can
 * enforce posting locks without introducing store/report circular imports.
 */

const lockedBusinessDates = new Set<string>();

export function localBusinessDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function isBusinessDayClosed(businessDate = localBusinessDate()): boolean {
  return lockedBusinessDates.has(businessDate);
}

export function assertBusinessDayOpen(businessDate = localBusinessDate()): void {
  if (isBusinessDayClosed(businessDate)) {
    throw new Error(`Business day ${businessDate} is closed. Reopen the day before posting financial changes.`);
  }
}

export function lockBusinessDay(businessDate: string): void {
  lockedBusinessDates.add(businessDate);
}

export function unlockBusinessDay(businessDate: string): void {
  lockedBusinessDates.delete(businessDate);
}

export function hydrateBusinessDayLocks(businessDates: string[]): void {
  lockedBusinessDates.clear();
  for (const businessDate of businessDates) lockedBusinessDates.add(businessDate);
}
