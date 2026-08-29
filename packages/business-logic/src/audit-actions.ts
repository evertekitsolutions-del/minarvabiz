/** Record audit events — dynamic import avoids circular deps with store/phase7 */
export function auditAction(
  action: string,
  tableName?: string,
  recordId?: string,
  oldValue?: unknown,
  newValue?: unknown
) {
  try {
    void import("./phase7-store").then((m) => {
      m.recordAudit(action, tableName, recordId, oldValue, newValue);
    });
  } catch {
    /* ignore */
  }
}
