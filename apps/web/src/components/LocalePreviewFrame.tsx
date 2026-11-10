import type { ReactNode } from "react";
import { resolveUiLocale } from "@/lib/rtl-readiness";

/**
 * Opt-in Arabic direction boundary for a future locale-aware route.
 * It does not translate English labels or enable Arabic globally.
 */
export function LocalePreviewFrame({
  requestedLocale,
  enabled = false,
  children,
}: {
  readonly requestedLocale: string | null | undefined;
  readonly enabled?: boolean;
  readonly children: ReactNode;
}) {
  const context = resolveUiLocale(requestedLocale, enabled);
  return (
    <section
      lang={context.lang}
      dir={context.dir}
      data-minarva-ui-locale={context.locale}
      className="min-w-0 text-start"
    >
      {children}
    </section>
  );
}

/** Use for SKUs, emails, invoice codes and other intentionally LTR values. */
export function LtrIdentifier({ children }: { readonly children: ReactNode }) {
  return <bdi lang="en" dir="ltr" className="inline-block">{children}</bdi>;
}
