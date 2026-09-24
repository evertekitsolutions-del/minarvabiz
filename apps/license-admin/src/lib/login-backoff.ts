export const MAX_ADMIN_LOGIN_BACKOFF_SECONDS = 300;

export function adminLoginBackoffSeconds(failureCount: number): number {
  const normalized = Number.isFinite(failureCount) ? Math.max(1, Math.floor(failureCount)) : 1;
  return Math.min(MAX_ADMIN_LOGIN_BACKOFF_SECONDS, 2 ** Math.min(normalized, 9));
}
