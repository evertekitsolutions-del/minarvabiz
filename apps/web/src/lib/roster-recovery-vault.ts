/**
 * HR-004B: credential-free, tenant-partitioned encrypted roster recovery vault.
 *
 * This is a STORAGE PRIMITIVE, not enabled automatic recovery. A caller must
 * resolve a verified user+organization via current_user_authorization, check
 * staff.manage, and explicitly review conflicts before restoring/replaying.
 *
 * IndexedDB stores a non-extractable AES-GCM key alongside each ciphertext.
 * This protects the stored event content from plaintext disk inspection and
 * accidental cross-scope access; it CANNOT defend against same-origin XSS or
 * someone controlling the authenticated browser profile. Never store a JWT,
 * refresh token, login secret or arbitrary user-provided event properties.
 */
export interface RosterRecoveryScope {
  userId: string;
  organizationId: string;
}

export interface RosterRecoveryEvent {
  id: string;
  aggregateType: "staff_shift_rules" | "staff_roster_slots";
  aggregateId: string;
  eventType: "insert" | "update" | "delete";
  payload: Record<string, unknown>;
  occurredAt: string;
  deviceId: string;
  sequence: number;
  status: "pending" | "failed" | "synced" | "discarded";
  attempts: number;
  lastError: null; // Never persist unsanitized server responses or auth headers.
}

export interface SealedRosterRecovery {
  scopeKey: string;
  userId: string;
  organizationId: string;
  key: CryptoKey;
  iv: number[];
  ciphertext: number[];
}

export interface RosterRecoveryDriver {
  read(scopeKey: string): Promise<SealedRosterRecovery | null>;
  write(record: SealedRosterRecovery): Promise<void>;
  erase(scopeKey: string): Promise<void>;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHIFT_FIELDS = ["id","name","startTime","endTime","unpaidBreakMinutes","branchId","active","version"];
const SLOT_FIELDS = ["id","staffId","shiftRuleId","branchId","workDate","status","version"];
const EVENT_FIELDS = ["id","aggregateType","aggregateId","eventType","payload","occurredAt","deviceId","sequence","status","attempts","lastError"];
const textEncoder = new TextEncoder();

function requireScope(scope: RosterRecoveryScope): string {
  if (!scope || !uuid.test(scope.userId) || !uuid.test(scope.organizationId)) {
    throw new Error("A verified user UUID and organization UUID are required for roster recovery");
  }
  return `hr004:v1:${scope.userId.toLowerCase()}:${scope.organizationId.toLowerCase()}`;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid roster recovery record");
  return value as Record<string, unknown>;
}
function exactFields(value: Record<string, unknown>, names: readonly string[]) {
  if (Object.keys(value).some(name => !names.includes(name))) {
    throw new Error("Unexpected roster recovery fields; credentials and arbitrary data are prohibited");
  }
}
function safePayload(kind: RosterRecoveryEvent["aggregateType"], unknownPayload: unknown, id: string) {
  const payload = object(unknownPayload);
  const names = kind === "staff_shift_rules" ? SHIFT_FIELDS : SLOT_FIELDS;
  exactFields(payload,names);
  if (payload.id !== id || typeof payload.version !== "number" ||
      !Number.isSafeInteger(payload.version) || payload.version < 1) {
    throw new Error("Invalid roster event identity or revision");
  }
  if (kind === "staff_shift_rules") {
    if (typeof payload.name !== "string" || !payload.name.trim() ||
        typeof payload.startTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(payload.startTime) ||
        typeof payload.endTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(payload.endTime) ||
        typeof payload.active !== "boolean" ||
        !Number.isSafeInteger(payload.unpaidBreakMinutes) ||
        (payload.unpaidBreakMinutes as number) < 0 || (payload.unpaidBreakMinutes as number) > 1440) {
      throw new Error("Invalid roster shift recovery payload");
    }
  } else if (typeof payload.staffId !== "string" || !payload.staffId ||
             typeof payload.shiftRuleId !== "string" || !payload.shiftRuleId ||
             typeof payload.workDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(payload.workDate) ||
             !["scheduled","cancelled"].includes(String(payload.status))) {
    throw new Error("Invalid roster slot recovery payload");
  }
  if (payload.branchId !== null && (typeof payload.branchId !== "string" || !payload.branchId)) {
    throw new Error("Invalid roster recovery branch identity");
  }
  return { ...payload };
}

/** Validate BEFORE encryption; returned objects have only the allowed fields. */
export function sanitizeRosterRecoveryEvents(events: readonly unknown[]): RosterRecoveryEvent[] {
  if (!Array.isArray(events) || events.length > 2000) throw new Error("Invalid roster recovery event count");
  const ids = new Set<string>();
  return events.map(unknownEvent => {
    const event = object(unknownEvent);
    exactFields(event,EVENT_FIELDS);
    if (event.aggregateType !== "staff_shift_rules" && event.aggregateType !== "staff_roster_slots")
      throw new Error("Non-roster event cannot enter the HR recovery vault");
    if (!uuid.test(String(event.id)) || !uuid.test(String(event.aggregateId)) ||
        !uuid.test(String(event.deviceId)) || !["insert","update","delete"].includes(String(event.eventType)) ||
        !["pending","failed","synced","discarded"].includes(String(event.status)) ||
        typeof event.occurredAt !== "string" || !Number.isFinite(Date.parse(event.occurredAt)) ||
        !Number.isSafeInteger(event.sequence) || (event.sequence as number) < 1 ||
        !Number.isSafeInteger(event.attempts) || (event.attempts as number) < 0 ||
        ids.has(String(event.id))) throw new Error("Invalid or duplicate roster recovery event");
    ids.add(String(event.id));
    const kind = event.aggregateType as RosterRecoveryEvent["aggregateType"];
    return {
      id: event.id as string,
      aggregateType: kind,
      aggregateId: event.aggregateId as string,
      eventType: event.eventType as RosterRecoveryEvent["eventType"],
      payload: safePayload(kind,event.payload,String(event.aggregateId)),
      occurredAt: event.occurredAt as string,
      deviceId: event.deviceId as string,
      sequence: event.sequence as number,
      status: event.status as RosterRecoveryEvent["status"],
      attempts: event.attempts as number,
      lastError: null,
    };
  }).sort((a,b)=>a.sequence-b.sequence);
}
function subtle(): SubtleCrypto {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues)
    throw new Error("Secure browser WebCrypto is required for workforce recovery");
  return globalThis.crypto.subtle;
}

/** Writes must finish before the network RPC is attempted. */
export async function saveSealedRosterRecovery(
  driver: RosterRecoveryDriver, scope: RosterRecoveryScope, events: readonly unknown[],
): Promise<void> {
  const scopeKey = requireScope(scope);
  const sanitized = sanitizeRosterRecoveryEvents(events);
  const existing = await driver.read(scopeKey);
  if (existing && (existing.scopeKey !== scopeKey || existing.userId !== scope.userId ||
      existing.organizationId !== scope.organizationId ||
      existing.key?.extractable !== false || existing.key.algorithm.name !== "AES-GCM")) {
    throw new Error("Roster recovery key/scope is corrupted; keep existing data for manual recovery");
  }
  const key = existing?.key ?? await subtle().generateKey(
    {name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
  const iv = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(12)));
  const payload = textEncoder.encode(JSON.stringify({version:1,scopeKey,events:sanitized}));
  const ciphertext = await subtle().encrypt({name:"AES-GCM",iv:new Uint8Array(iv),
    additionalData:textEncoder.encode(scopeKey)},key,payload);
  await driver.write({scopeKey,userId:scope.userId,organizationId:scope.organizationId,
    key,iv,ciphertext:Array.from(new Uint8Array(ciphertext))});
}

/** Reads only the requested verified scope; rejects swaps/corruption without deleting it. */
export async function loadSealedRosterRecovery(
  driver: RosterRecoveryDriver, scope: RosterRecoveryScope,
): Promise<RosterRecoveryEvent[] | null> {
  const scopeKey = requireScope(scope);
  const item = await driver.read(scopeKey);
  if (!item) return null;
  if (item.scopeKey !== scopeKey || item.userId !== scope.userId ||
      item.organizationId !== scope.organizationId || item.key?.extractable !== false ||
      item.key.algorithm.name !== "AES-GCM" ||
      !Array.isArray(item.iv) || item.iv.length !== 12 || !Array.isArray(item.ciphertext)) {
    throw new Error("Roster recovery scope or encrypted record is corrupt");
  }
  let decrypted: unknown;
  try {
    const data = await subtle().decrypt({name:"AES-GCM",iv:new Uint8Array(item.iv),
      additionalData:textEncoder.encode(scopeKey)},item.key,new Uint8Array(item.ciphertext));
    decrypted = JSON.parse(new TextDecoder().decode(data));
  } catch {
    throw new Error("Roster recovery authentication failed; do not erase the retained backup");
  }
  const document = object(decrypted);
  if (document.version !== 1 || document.scopeKey !== scopeKey || !Array.isArray(document.events))
    throw new Error("Roster recovery document version or identity is invalid");
  return sanitizeRosterRecoveryEvents(document.events);
}

/** Only invoke from a separately authorized explicit reconciliation/discard flow. */
export async function eraseSealedRosterRecovery(driver: RosterRecoveryDriver,scope: RosterRecoveryScope) {
  await driver.erase(requireScope(scope));
}

/**
 * Browser-only IndexedDB driver. Key objects are persisted non-extractably by
 * structured clone. No plaintext or session JWT goes into browser storage.
 */
export function createIndexedDbRosterRecoveryDriver(): RosterRecoveryDriver {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB is unavailable; offline recovery is not enabled");
  let opening: Promise<IDBDatabase> | null = null;
  const db = () => {
    if (!opening) opening = new Promise<IDBDatabase>((resolve,reject)=>{
      const request=indexedDB.open("minarvabiz-workforce-recovery",1);
      request.onupgradeneeded=()=>request.result.createObjectStore("vaults",{keyPath:"scopeKey"});
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error ?? new Error("Roster recovery database open failed"));
      request.onblocked=()=>reject(new Error("Roster recovery database upgrade is blocked"));
    });
    return opening;
  };
  return {
    read:async scopeKey=>{
      const opened=await db();
      return new Promise((resolve,reject)=>{
        const req=opened.transaction("vaults","readonly").objectStore("vaults").get(scopeKey);
        req.onsuccess=()=>resolve((req.result as SealedRosterRecovery | undefined)??null);
        req.onerror=()=>reject(req.error??new Error("Roster recovery read failed"));
      });
    },
    write:async record=>{
      const opened=await db();
      await new Promise<void>((resolve,reject)=>{
        const tx=opened.transaction("vaults","readwrite");
        tx.objectStore("vaults").put(record);
        tx.oncomplete=()=>resolve();
        tx.onabort=()=>reject(tx.error??new Error("Roster recovery write rolled back"));
        tx.onerror=()=>reject(tx.error??new Error("Roster recovery write failed"));
      });
    },
    erase:async scopeKey=>{
      const opened=await db();
      await new Promise<void>((resolve,reject)=>{
        const tx=opened.transaction("vaults","readwrite");
        tx.objectStore("vaults").delete(scopeKey);
        tx.oncomplete=()=>resolve();
        tx.onabort=()=>reject(tx.error??new Error("Roster recovery delete rolled back"));
        tx.onerror=()=>reject(tx.error??new Error("Roster recovery delete failed"));
      });
    },
  };
}
