/**
 * PRJ-006 offline persistence for an authenticated Windows/Web host.
 * Original Minarva source; no donor code. IndexedDB is a device-local draft,
 * NOT server authority, a substitute for RLS, or evidence of Hybrid sync.
 * Host must bind the database to the signed-in principal and clear access on logout.
 */
import type {
  ProjectEstimateInput, ProjectEstimateStore, ProjectEstimateReader,
} from "@minarvabiz/business-logic";

type SaveCommand = Parameters<ProjectEstimateStore["saveAtomically"]>[0];
interface StoredEstimate {
  id: string;
  worksheet: ProjectEstimateInput;
}
interface AuditRecord {
  id: string;
  estimateId: string;
  actorId: string;
  revision: number;
  action: "project.estimate.saved";
  idempotencyKey: string;
  createdAt: string;
}
const databaseVersion = 1;
function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}
function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Estimate transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("Estimate transaction failed"));
  });
}
function scopedKey(ids: Pick<ProjectEstimateInput, "tenantId" | "companyId" | "branchId" | "projectId">): string {
  const values = [ids.tenantId, ids.companyId, ids.branchId, ids.projectId];
  if (values.some(value => typeof value !== "string" || !value.trim() || value.length > 128)) {
    throw new Error("Invalid project estimate scope");
  }
  return JSON.stringify(values);
}
function openDatabase(name: string): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Offline storage unavailable"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, databaseVersion);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("estimates")) db.createObjectStore("estimates", { keyPath: "id" });
      if (!db.objectStoreNames.contains("receipts")) db.createObjectStore("receipts", { keyPath: "id" });
      if (!db.objectStoreNames.contains("audit")) db.createObjectStore("audit", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline database open failed"));
    request.onblocked = () => reject(new Error("Offline database upgrade blocked"));
  });
}
/**
 * Instantiate only after authenticating the current device user. A unique
 * per-principal database name prevents accidental local cross-user visibility.
 * Offline grants must be issued/validated by the host, never by this adapter.
 */
export function createOfflineProjectEstimateStore(databaseName: string): ProjectEstimateStore & ProjectEstimateReader {
  if (!/^minarvabiz-project-estimates:[a-zA-Z0-9_-]{8,128}$/.test(databaseName)) {
    throw new Error("Invalid principal-scoped offline database name");
  }
  return {
    async loadScoped(scope) {
      const id = scopedKey(scope);
      const db = await openDatabase(databaseName);
      try {
        const tx = db.transaction("estimates", "readonly");
        const done = transactionDone(tx);
        const record = await requestResult(tx.objectStore("estimates").get(id)) as StoredEstimate | undefined;
        await done;
        return record ? structuredClone(record.worksheet) : null;
      } finally { db.close(); }
    },
    async saveAtomically(command: SaveCommand) {
      const id = scopedKey(command.scope);
      if (scopedKey(command.worksheet) !== id) throw new Error("Project estimate scope mismatch");
      if (!Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0 ||
          command.nextRevision !== command.expectedRevision + 1 ||
          command.worksheet.revision !== command.expectedRevision ||
          command.audit.revision !== command.nextRevision ||
          command.audit.action !== "project.estimate.saved" ||
          !command.audit.actorId.trim() || !command.idempotencyKey.trim()) {
        throw new Error("Invalid estimate storage command");
      }
      const db = await openDatabase(databaseName);
      try {
        const tx = db.transaction(["estimates", "receipts", "audit"], "readwrite");
        const done = transactionDone(tx);
        // Keep the transaction alive by queuing dependent operations from IDB
        // callbacks; no unrelated asynchronous work may occur before commit.
        const receipts = tx.objectStore("receipts");
        const estimates = tx.objectStore("estimates");
        const audit = tx.objectStore("audit");
        const receiptId = JSON.stringify([id, command.idempotencyKey]);
        const result = await new Promise<"saved" | "replayed" | "conflict">((resolve, reject) => {
          const receiptRequest = receipts.get(receiptId);
          receiptRequest.onerror = () => reject(receiptRequest.error);
          receiptRequest.onsuccess = () => {
            if (receiptRequest.result) {
              const previous = receiptRequest.result as { revision: number };
              resolve(previous.revision === command.nextRevision ? "replayed" : "conflict");
              return;
            }
            const currentRequest = estimates.get(id);
            currentRequest.onerror = () => reject(currentRequest.error);
            currentRequest.onsuccess = () => {
              const current = currentRequest.result as StoredEstimate | undefined;
              if ((current?.worksheet.revision ?? 0) !== command.expectedRevision) {
                resolve("conflict");
                return;
              }
              const worksheet = structuredClone({ ...command.worksheet, revision: command.nextRevision });
              estimates.put({ id, worksheet } satisfies StoredEstimate);
              receipts.put({ id: receiptId, revision: command.nextRevision });
              audit.add({
                id: receiptId, estimateId: id, actorId: command.audit.actorId,
                revision: command.nextRevision, action: command.audit.action,
                idempotencyKey: command.idempotencyKey, createdAt: new Date().toISOString(),
              } satisfies AuditRecord);
              resolve("saved");
            };
          };
        });
        await done;
        return result;
      } finally { db.close(); }
    },
  };
}
