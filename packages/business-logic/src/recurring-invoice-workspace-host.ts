/**
 * SAL-007 shared Web/Desktop workflow coordinator for a TRUSTED host.
 *
 * Must execute in Electron main/other trusted server context only. A renderer
 * can call its methods through a scoped IPC/API bridge but MUST NOT instantiate
 * this facade with customer-supplied `scope`, `allow` or service credentials.
 * The pilot intentionally stays OFF until one commercial host is wired.
 */
import type { RecurringInvoiceFrequency, RecurringInvoiceOccurrence,
  RecurringInvoiceSchedule, RecurringInvoiceStatus } from "./recurring-invoice";
import type { RecurringInvoiceCartPreview } from "./recurring-invoice-checkout-preview";
import type { RecurringInvoiceAuthoritativeSource } from "./recurring-invoice-source";
import { createRecurringInvoiceScheduleFromSource } from "./recurring-invoice-source";
import {
  saveRecurringInvoicePilotSqlite, listRecurringInvoiceSchedulesPilotSqlite,
  listRecurringInvoiceDraftsPilotSqlite, changeRecurringInvoicePilotStatusSqlite,
  stageRecurringInvoiceDraftsPilotSqlite, previewRecurringInvoiceDraftPilotSqlite,
  postRecurringInvoiceDraftPilotSqlite,
  type RecurringInvoiceSqliteDb, type RecurringInvoiceScope,
  type RecurringInvoicePostPilotInput,
} from "./recurring-invoice-sqlite-pilot";

export type RecurringInvoiceWorkflowAction = "read" | "create" | "manage" | "stage" | "approve";
export interface RecurringInvoiceWorkspaceHost {
  readonly db: RecurringInvoiceSqliteDb;
  /** Host-owned commercial feature activation. Must default to FALSE. */
  isFeatureEnabled: () => boolean;
  /** Host-owned signed-in org/company/branch (not renderer request state). */
  getAuthorizedScope: () => RecurringInvoiceScope;
  /** Permission checked on EVERY operation. */
  authorize: (action: RecurringInvoiceWorkflowAction, scope: RecurringInvoiceScope) => void;
  getBusinessDate: () => string;
  getCurrency: () => string;
  createScheduleId: () => string;
  readonly source: Pick<RecurringInvoiceAuthoritativeSource,
    "getSale" | "getCustomer" | "getProduct">;
  /** Optional. Without ALL callbacks, the approve action is unavailable. */
  readonly posting?: Pick<RecurringInvoicePostPilotInput,
    "getAuthenticatedApproverId" | "postFinancialInvoice" | "verifyPostedInvoice">;
}

export interface RecurringInvoiceScheduleForm {
  readonly sourceSaleId: string;
  readonly firstDueDate: string;
  readonly frequency: RecurringInvoiceFrequency;
  readonly interval: number;
}
export interface RecurringInvoiceWorkspaceHostAdapter {
  readonly refresh: () => Promise<{
    schedules: readonly RecurringInvoiceSchedule[];
    pending: readonly RecurringInvoiceOccurrence[];
  }>;
  readonly create: (draft: RecurringInvoiceScheduleForm) => Promise<void>;
  readonly setStatus: (
    scheduleId: string, expectedVersion: number, status: RecurringInvoiceStatus,
  ) => Promise<void>;
  readonly stageDue: (scheduleId: string, asOfDate: string) => Promise<void>;
  readonly preview: (
    pendingDraftId: string, asOfDate: string,
  ) => Promise<RecurringInvoiceCartPreview>;
  readonly approveAndPost?: (
    pendingDraftId: string, asOfDate: string,
  ) => Promise<{ invoiceId: string }>;
}

export function createRecurringInvoiceWorkspaceHostAdapter(
  host: RecurringInvoiceWorkspaceHost,
): RecurringInvoiceWorkspaceHostAdapter {
  if (!host || !host.db || !host.source ||
      typeof host.isFeatureEnabled !== "function" ||
      typeof host.getAuthorizedScope !== "function" ||
      typeof host.authorize !== "function" ||
      typeof host.getBusinessDate !== "function" ||
      typeof host.getCurrency !== "function" ||
      typeof host.createScheduleId !== "function" ||
      typeof host.source.getSale !== "function" ||
      typeof host.source.getCustomer !== "function" ||
      typeof host.source.getProduct !== "function") {
    throw new Error("Recurring invoice workspace must be constructed by a trusted host");
  }
  function permit(action: RecurringInvoiceWorkflowAction): RecurringInvoiceScope {
    if (host.isFeatureEnabled() !== true) {
      throw new Error("Recurring invoice capability is disabled on this host");
    }
    const scope = host.getAuthorizedScope();
    if (!scope || !scope.organizationId || !scope.companyId || !scope.branchId) {
      throw new Error("Missing authenticated recurring invoice company/branch scope");
    }
    host.authorize(action, scope);
    return scope;
  }
  function checkScope(required: RecurringInvoiceWorkflowAction, scope: RecurringInvoiceScope) {
    // Inner SQLite functions invoke this again during the same DB transaction.
    host.authorize(required, scope);
  }
  const adapter: RecurringInvoiceWorkspaceHostAdapter = {
    async refresh() {
      const scope = permit("read");
      return {
        schedules: listRecurringInvoiceSchedulesPilotSqlite(
          host.db, scope, (org, company, branch) => checkScope("read", {
            organizationId: org, companyId: company, branchId: branch,
          })),
        pending: listRecurringInvoiceDraftsPilotSqlite(
          host.db, scope, (org, company, branch) => checkScope("read", {
            organizationId: org, companyId: company, branchId: branch,
          })),
      };
    },
    async create(draft) {
      const scope = permit("create");
      if (!draft || typeof draft.sourceSaleId !== "string") {
        throw new Error("Invalid recurring invoice schedule request");
      }
      const schedule = createRecurringInvoiceScheduleFromSource({
        ...scope, id: host.createScheduleId(), sourceSaleId: draft.sourceSaleId,
        currency: host.getCurrency(), firstDueDate: draft.firstDueDate,
        frequency: draft.frequency, interval: draft.interval,
      }, {
        ...host.source,
        authorizeScheduleCreation: (org, company, branch) => checkScope(
          "create", { organizationId: org, companyId: company, branchId: branch },
        ),
      });
      saveRecurringInvoicePilotSqlite(host.db, schedule,
        (org, company, branch) => checkScope("create", {
          organizationId: org, companyId: company, branchId: branch,
        }));
    },
    async setStatus(scheduleId, expectedVersion, status) {
      const scope = permit("manage");
      changeRecurringInvoicePilotStatusSqlite(host.db, scope,
        scheduleId, expectedVersion, status,
        (org, company, branch) => checkScope("manage", {
          organizationId: org, companyId: company, branchId: branch,
        }));
    },
    async stageDue(scheduleId, _asOfDate) {
      const scope = permit("stage");
      stageRecurringInvoiceDraftsPilotSqlite(
        host.db, scope, scheduleId, host.getBusinessDate(),
        (org, company, branch) => checkScope("stage", {
          organizationId: org, companyId: company, branchId: branch,
        }));
    },
    async preview(pendingDraftId, _asOfDate) {
      const scope = permit("read");
      return previewRecurringInvoiceDraftPilotSqlite(
        host.db, scope, pendingDraftId, host.getBusinessDate(),
        (org, company, branch) => checkScope("read", {
          organizationId: org, companyId: company, branchId: branch,
        }), host.source);
    },
  };
  if (host.posting) {
    if (typeof host.posting.getAuthenticatedApproverId !== "function" ||
        typeof host.posting.postFinancialInvoice !== "function" ||
        typeof host.posting.verifyPostedInvoice !== "function") {
      throw new Error("Partial recurring invoice financial writer configuration");
    }
    adapter.approveAndPost = async (draftId, _asOfDate) => {
      const scope = permit("approve");
      const result = postRecurringInvoiceDraftPilotSqlite(host.db, {
        ...scope, draftId, businessDate: host.getBusinessDate(),
        live: host.source,
        authorizeApproval: (org, company, branch) => checkScope("approve", {
          organizationId: org, companyId: company, branchId: branch,
        }),
        getAuthenticatedApproverId: host.posting!.getAuthenticatedApproverId,
        postFinancialInvoice: host.posting!.postFinancialInvoice,
        verifyPostedInvoice: host.posting!.verifyPostedInvoice,
      });
      return { invoiceId: result.invoiceId };
    };
  }
  return adapter;
}
