/** Offline boutique customer design references, reusing the existing design-library workflow. */
import { generateId, nowISO } from "@minarvabiz/utils";
import {
  advanceDesignVersion, canApproveDesign, createDesignAsset, searchDesignLibrary,
  setDesignApproval, type DesignAsset,
} from "./design-library";
import { assertPermission } from "./permissions";
import { getActiveBranch, listBranches } from "./phase9-store";
import { getCustomer } from "./store";
import { auditAction } from "./audit-actions";
import { touchPersistence } from "./autosave";

export interface BoutiqueDesignRecord extends DesignAsset {
  branchId?: string | null;
}
export type BoutiqueDesignInput = {
  customerId: string;
  name: string;
  category?: string | null;
  tags?: string[];
  referenceUrl: string;
  notes?: string | null;
};

const records: BoutiqueDesignRecord[] = [];
const MAX_ITEMS = 60;
const MAX_IMAGE_URL = 300000;
const allowedStatus = new Set(["draft","pending_approval","approved","rejected","archived"]);
function activeBranch() { return getActiveBranch()?.id || null; }
function inActiveBranch(design: BoutiqueDesignRecord): boolean {
  const hq = listBranches().find(branch=>branch.isHeadquarters)?.id || null;
  return Boolean(activeBranch()) && (design.branchId || hq) === activeBranch();
}
function validReference(value: string): boolean {
  if (typeof value !== "string" || !value || value.length > MAX_IMAGE_URL) return false;
  if (/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.href.length <= 2000;
  } catch { return false; }
}
function validateOne(value: unknown): BoutiqueDesignRecord {
  if (!value || typeof value !== "object") throw new Error("Invalid boutique portfolio record");
  const r=value as BoutiqueDesignRecord;
  if (!r.id || typeof r.id !== "string" || r.id.length > 120 || !r.customerId || typeof r.customerId !== "string"
    || !r.name?.trim() || r.name.length > 120
    || (r.branchId != null && (typeof r.branchId !== "string" || !r.branchId.trim()))
    || !Array.isArray(r.tags) || r.tags.length > 12
    || r.tags.some(t=>typeof t!=="string"||!t.trim()||t.length>50)
    || (r.category != null && (typeof r.category !== "string" || r.category.length > 80))
    || (r.notes != null && (typeof r.notes !== "string" || r.notes.length > 2000))
    || !validReference(r.referenceUrl || "")
    || !allowedStatus.has(r.status) || !Number.isSafeInteger(r.version) || r.version < 1
    || !r.createdAt || !r.updatedAt || !Number.isFinite(Date.parse(r.createdAt))
    || !Number.isFinite(Date.parse(r.updatedAt))) throw new Error("Invalid boutique portfolio fields");
  return { ...r, name:r.name.trim(), tags:[...r.tags] };
}
export function validateBoutiqueDesignPortfolio(raw: unknown): BoutiqueDesignRecord[] {
  if (!Array.isArray(raw) || raw.length > MAX_ITEMS) throw new Error("Invalid boutique portfolio archive");
  const ids=new Set<string>();
  return raw.map(value=>{
    const design=validateOne(value);
    if (ids.has(design.id)) throw new Error("Duplicate design ID");
    ids.add(design.id);
    return design;
  });
}
export function listBoutiqueDesigns(customerId: string, query=""): BoutiqueDesignRecord[] {
  assertPermission("orders.manage");
  return searchDesignLibrary(records.filter(r=>r.customerId===customerId && inActiveBranch(r)),query)
    .map(design=>({...design,tags:[...design.tags]}));
}
export function addBoutiqueDesign(input: BoutiqueDesignInput): BoutiqueDesignRecord {
  assertPermission("orders.manage");
  const branchId=activeBranch();
  const customer=getCustomer(input.customerId);
  if (!branchId || !customer || (customer.branchId && customer.branchId!==branchId)) {
    throw new Error("Customer not available in active branch");
  }
  if(records.length>=MAX_ITEMS)throw new Error("Local portfolio capacity reached");
  const now=nowISO();
  const design=createDesignAsset({
    id:generateId(),customerId:input.customerId,name:input.name.trim(),
    category:input.category?.trim()||null,orderId:null,
    tags:(input.tags||[]).map(tag=>tag.trim()),referenceUrl:input.referenceUrl,
    notes:input.notes?.trim()||null,createdAt:now,updatedAt:now,
  });
  const validated=validateOne({...design,branchId});
  records.push(validated);
  touchPersistence();
  auditAction("boutique.design_add","boutique_designs",validated.id,null,{id:validated.id,customerId:validated.customerId,branchId});
  return {...validated,tags:[...validated.tags]};
}
export function submitBoutiqueDesignForApproval(id:string):BoutiqueDesignRecord {
  assertPermission("orders.manage");
  const design=records.find(x=>x.id===id && inActiveBranch(x));
  if(!design || !["draft","rejected"].includes(design.status))throw new Error("Design not ready for submission");
  const updated=advanceDesignVersion(design,{status:"pending_approval"},nowISO());
  Object.assign(design,updated);
  touchPersistence();
  auditAction("boutique.design_submit","boutique_designs",design.id,null,{id:design.id,version:design.version});
  return {...design,tags:[...design.tags]};
}
export function decideBoutiqueDesign(id:string,approved:boolean):BoutiqueDesignRecord {
  assertPermission("orders.manage");
  const design=records.find(x=>x.id===id && inActiveBranch(x));
  if(!design || !canApproveDesign(design))throw new Error("Design is not awaiting approval");
  const decision=setDesignApproval(design,approved,nowISO());
  const updated=advanceDesignVersion(design,{status:decision.status},decision.updatedAt);
  Object.assign(design,updated);
  touchPersistence();
  auditAction("boutique.design_decide","boutique_designs",design.id,null,{id:design.id,approved,version:design.version});
  return {...design,tags:[...design.tags]};
}
export function archiveBoutiqueDesign(id:string):BoutiqueDesignRecord {
  assertPermission("orders.manage");
  const design=records.find(x=>x.id===id && inActiveBranch(x));
  if(!design || design.status==="archived")throw new Error("Design not available");
  Object.assign(design,advanceDesignVersion(design,{status:"archived"},nowISO()));
  touchPersistence();
  auditAction("boutique.design_archive","boutique_designs",design.id,null,{id:design.id});
  return {...design,tags:[...design.tags]};
}
/** Full archive, not active-branch list; must not silently discard other branches on backup. */
export function exportBoutiqueDesignPortfolio():BoutiqueDesignRecord[] {
  return records.map(record=>({...record,tags:[...record.tags]}));
}
export function hydrateBoutiqueDesignPortfolio(raw:unknown):void {
  const checked=validateBoutiqueDesignPortfolio(raw);
  records.splice(0,records.length,...checked);
}
