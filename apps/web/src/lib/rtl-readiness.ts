/**
 * P1 Arabic RTL readiness. Locale selection is explicit and feature gated.
 * Do not infer a business's locale from currency, IP address or account role.
 */
export type MinarvaUiLocale = "en" | "ar";
export interface UiLocaleContext {
  readonly locale: MinarvaUiLocale;
  readonly lang: MinarvaUiLocale;
  readonly dir: "ltr" | "rtl";
  readonly numberLocale: "en-IN" | "ar-OM";
}
const EN = Object.freeze({
  locale: "en", lang: "en", dir: "ltr", numberLocale: "en-IN",
} as const);
const AR = Object.freeze({
  locale: "ar", lang: "ar", dir: "rtl", numberLocale: "ar-OM",
} as const);

/**
 * Explicit beta opt-in. If the global rollout flag is false, no user-supplied
 * locale value can change the application's direction or language.
 */
export function resolveUiLocale(
  requested: string | null | undefined,
  arabicRtlEnabled = false,
): Readonly<UiLocaleContext> {
  return arabicRtlEnabled === true && requested === "ar" ? AR : EN;
}
