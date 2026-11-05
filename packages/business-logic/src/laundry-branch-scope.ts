/** Active-branch scope shared by Laundry tickets and their local supporting records.
 * Null branch on historical records belongs to the headquarters only.
 * This is a UI/domain boundary; database RLS remains independently authoritative.
 */
import type { LaundryOrder } from "@minarvabiz/types";
import { getActiveBranch, listBranches } from "./phase9-store";

export function activeLaundryBranchId(): string | null {
  return getActiveBranch()?.id ?? null;
}

export function laundryRecordInActiveBranch(
  record: Pick<LaundryOrder, "branchId">,
): boolean {
  const activeId = activeLaundryBranchId();
  if (!activeId) return false;
  const headOfficeId = listBranches().find((branch) => branch.isHeadquarters)?.id;
  return (record.branchId ?? headOfficeId) === activeId;
}
