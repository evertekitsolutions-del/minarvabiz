/** Backup operations report cancellation separately from committed success. */
export function backupActionMessage(
  outcome: void | string | null,
  success: string,
): string {
  if (outcome === null) return "Operation cancelled.";
  return typeof outcome === "string" ? outcome : success;
}
