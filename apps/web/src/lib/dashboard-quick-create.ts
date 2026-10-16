/**
 * Dashboard shortcut intents use an explicit exact action; ordinary page visits
 * and unexpected/double action parameters must never create a record.
 * The caller only opens an existing form; this helper does not write data.
 */
export function isDashboardCreateIntent(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.getAll("action").length === 1 && params.get("action") === "new";
}
