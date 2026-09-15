/** Design/reference library with deterministic versioning and approval workflow. */

export type DesignStatus = "draft" | "pending_approval" | "approved" | "rejected" | "archived";

export interface DesignAsset {
  id: string;
  name: string;
  customerId?: string | null;
  orderId?: string | null;
  category?: string | null;
  tags: string[];
  referenceUrl?: string | null;
  notes?: string | null;
  status: DesignStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface DesignRevision {
  id: string;
  designId: string;
  version: number;
  snapshot: Omit<DesignAsset, "updatedAt" | "version"> & { version: number };
  createdAt: string;
  createdBy?: string | null;
}

export function createDesignAsset(input: Omit<DesignAsset, "version" | "status"> & { status?: DesignStatus }): DesignAsset {
  return { ...input, version: 1, status: input.status ?? "draft" };
}

export function createDesignRevision(
  design: DesignAsset,
  revisionId: string,
  createdAt: string,
  createdBy?: string | null,
): DesignRevision {
  return {
    id: revisionId,
    designId: design.id,
    version: design.version,
    snapshot: { ...design, version: design.version, updatedAt: undefined as never },
    createdAt,
    createdBy: createdBy ?? null,
  };
}

export function advanceDesignVersion(
  design: DesignAsset,
  patch: Partial<Omit<DesignAsset, "id" | "version" | "createdAt">>,
  updatedAt: string,
): DesignAsset {
  return { ...design, ...patch, version: design.version + 1, updatedAt };
}

export function canApproveDesign(design: DesignAsset): boolean {
  return design.status === "pending_approval";
}

export function setDesignApproval(design: DesignAsset, approved: boolean, updatedAt: string): DesignAsset {
  if (!canApproveDesign(design)) return design;
  return { ...design, status: approved ? "approved" : "rejected", updatedAt };
}

export function searchDesignLibrary(
  designs: DesignAsset[],
  query: string,
  category?: string,
): DesignAsset[] {
  const normalized = query.trim().toLowerCase();
  const categoryFilter = category?.trim().toLowerCase();
  return designs.filter((design) => {
    if (design.status === "archived") return false;
    if (categoryFilter && (design.category ?? "").toLowerCase() !== categoryFilter) return false;
    if (!normalized) return true;
    return [design.name, design.category ?? "", design.notes ?? "", ...design.tags]
      .join(" ")
      .toLowerCase()
      .includes(normalized);
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
