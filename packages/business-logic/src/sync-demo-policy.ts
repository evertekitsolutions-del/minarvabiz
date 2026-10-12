/**
 * The bundled in-memory adapter is a demonstration, not a cloud transport.
 * Never acknowledge business events as remotely synchronized in real editions.
 */
export function assertMemorySyncDemoMode(mode: string | undefined): void {
  if (mode !== "demo") {
    throw new Error("In-memory sync is demo-only; no cloud transport is configured");
  }
}
