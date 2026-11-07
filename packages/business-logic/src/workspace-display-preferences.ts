/**
 * PLT-012/013: industry-neutral display preferences for a business profile.
 * Display formatting only: never changes accounting amounts, fiscal periods,
 * tax jurisdiction, document numbering, or persisted UTC timestamps.
 * Original Minarva Biz implementation; no external donor source.
 */
export interface WorkspaceDisplayPreferences {
  locale: string;
  timeZone: string;
  currency: string;
}

const CURRENCY = /^[A-Z]{3}$/;
const LOCALE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/;
const MAX_ZONE_LENGTH = 128;

export function validateWorkspaceDisplayPreferences(
  input: WorkspaceDisplayPreferences,
): WorkspaceDisplayPreferences {
  if (!input || typeof input.locale !== "string" || typeof input.timeZone !== "string" || typeof input.currency !== "string") {
    throw new Error("Display preferences must contain string locale, time zone and currency.");
  }
  const locale = input.locale.trim();
  const timeZone = input.timeZone.trim();
  const currency = input.currency.trim().toUpperCase();
  if (!LOCALE.test(locale)) throw new Error("Enter a valid BCP 47 locale (for example en-IN).");
  if (!CURRENCY.test(currency)) throw new Error("Enter a three-letter ISO currency code.");
  // Intl.NumberFormat accepts arbitrary three-letter placeholders (e.g. ZZZ).
  // Reject them rather than persisting a non-ISO business currency.
  if (typeof Intl.supportedValuesOf === "function" &&
      !Intl.supportedValuesOf("currency").includes(currency)) {
    throw new Error("Unsupported ISO 4217 currency code.");
  }
  if (!timeZone || timeZone.length > MAX_ZONE_LENGTH) {
    throw new Error("Select a valid IANA time zone.");
  }
  try {
    // Intl canonicalizes aliases and rejects unknown locales and IANA zones.
    const canonicalLocale = Intl.getCanonicalLocales(locale)[0];
    const formatter = new Intl.DateTimeFormat(canonicalLocale, { timeZone });
    const canonicalZone = formatter.resolvedOptions().timeZone;
    new Intl.NumberFormat(canonicalLocale, { style: "currency", currency });
    return { locale: canonicalLocale, timeZone: canonicalZone, currency };
  } catch {
    throw new Error("Unsupported locale, time zone or currency.");
  }
}

export function formatWorkspaceMoney(
  amount: number,
  preferences: WorkspaceDisplayPreferences,
): string {
  if (!Number.isFinite(amount)) throw new Error("Amount must be finite.");
  const settings = validateWorkspaceDisplayPreferences(preferences);
  return new Intl.NumberFormat(settings.locale, {
    style: "currency",
    currency: settings.currency,
  }).format(amount);
}

export function formatWorkspaceDateTime(
  timestamp: string | number | Date,
  preferences: WorkspaceDisplayPreferences,
): string {
  const settings = validateWorkspaceDisplayPreferences(preferences);
  // Reject missing/blank legacy values rather than displaying Unix epoch.
  if (timestamp == null || (typeof timestamp === "string" && !timestamp.trim())) {
    throw new Error("Invalid date/time.");
  }
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid date/time.");
  return new Intl.DateTimeFormat(settings.locale, {
    timeZone: settings.timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Restore legacy/offline preferences independently. A corrupt time zone must
 * not silently reset a valid business currency or locale.
 */
export function restoreWorkspaceDisplayPreferences(
  input: Partial<WorkspaceDisplayPreferences>,
  defaults: WorkspaceDisplayPreferences,
): WorkspaceDisplayPreferences {
  const result = validateWorkspaceDisplayPreferences(defaults);
  if (!input || typeof input !== "object" || Array.isArray(input)) return result;
  for (const field of ["locale", "timeZone", "currency"] as const) {
    const value = input[field];
    if (typeof value !== "string" || !value.trim()) continue;
    try {
      const validated = validateWorkspaceDisplayPreferences({ ...result, [field]: value });
      result[field] = validated[field];
    } catch {
      // Keep only the invalid field at its safe default.
    }
  }
  return result;
}
