import { holidayDeviceReceipt } from "@minarvabiz/business-logic";
import type { SqliteDatabase } from "../../../../packages/database/src/adapters/sqlite";

/**
 * HR-005L: durable SQLite signed receipt STAGING, not authorized hydration.
 * Host must independently supply tenant/device enrollment, a pinned key,
 * trusted clock and protected last APPLIED sequence (not stored here).
 */
type ReceiptTrust = Parameters<typeof holidayDeviceReceipt.verifyHolidayDeviceSnapshot>[0];
type Sql = Pick<SqliteDatabase,"exec"|"query"|"transaction">;
const CREATE_LEDGER = [
  `CREATE TABLE IF NOT EXISTS hr005_signed_receipt_staging (
    snapshot_id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK(sequence>0),
    fingerprint_sha256 TEXT NOT NULL CHECK(length(fingerprint_sha256)=64),
    expires_at INTEGER NOT NULL,
    staged_at INTEGER NOT NULL,
    UNIQUE(org_id,device_id,sequence)
  )`,
  `CREATE TRIGGER IF NOT EXISTS hr005_staging_no_update
    BEFORE UPDATE ON hr005_signed_receipt_staging
    BEGIN SELECT RAISE(ABORT,'Signed holiday staging is append-only'); END`,
  `CREATE TRIGGER IF NOT EXISTS hr005_staging_no_delete
    BEFORE DELETE ON hr005_signed_receipt_staging
    BEGIN SELECT RAISE(ABORT,'Signed holiday staging is append-only'); END`,
];
function ensureSchema(sqlite:Sql):void {
  for(const ddl of CREATE_LEDGER) sqlite.exec(ddl);
}

/** Stage only a fingerprint and identities; NEVER holiday rules or pay data.
 * Re-check the max sequence INSIDE SQLite transaction after async WebCrypto.
 * A real host must additionally serialize via a single-writer IPC lock.
 */
export async function stageVerifiedHolidayReceipt(sqlite:Sql,input:ReceiptTrust):
 Promise<{snapshotId:string;orgId:string;deviceId:string;
   stagedSequence:number;canHydrate:false}> {
  if(!sqlite || typeof sqlite.transaction!=="function" ||
    typeof sqlite.exec!=="function" || typeof sqlite.query!=="function" ||
    !input?.packet?.payload || !input.subtle ||
    typeof input.subtle.digest!=="function")
    throw Error("Trusted SQLite, receipt and WebCrypto digest required");

  const verified=await holidayDeviceReceipt.verifyHolidayDeviceSnapshot(input);
  const bytes=holidayDeviceReceipt.holidayDeviceSnapshotSigningBytes(input.packet.payload);
  const signature=Uint8Array.from(
    atob(input.packet.signatureBase64),c=>c.charCodeAt(0));
  const material=new Uint8Array(bytes.byteLength+signature.byteLength);
  material.set(bytes);material.set(signature,bytes.byteLength);
  const hash=await input.subtle.digest("SHA-256",material);
  const fingerprint=Array.from(new Uint8Array(hash),
    b=>b.toString(16).padStart(2,"0")).join("");
  const expiresAt=input.packet.payload.expiresAt;
  if(!Number.isSafeInteger(expiresAt)||!Number.isSafeInteger(input.nowMs)||
     expiresAt<input.nowMs)
    throw Error("Holiday receipt staging requires trusted live clock");

  return sqlite.transaction(()=>{
    ensureSchema(sqlite);
    const foreign=sqlite.query(
      "SELECT 1 FROM hr005_signed_receipt_staging WHERE org_id<>? OR device_id<>? LIMIT 1",
      [verified.orgId,verified.deviceId]);
    if(foreign.length)throw Error("SQLite staging device/tenant identity changed");
    const prior=sqlite.query(
      "SELECT MAX(sequence) AS max_sequence,COUNT(*) AS total "+
      "FROM hr005_signed_receipt_staging WHERE org_id=? AND device_id=?",
      [verified.orgId,verified.deviceId])[0];
    const highest=prior?.max_sequence==null?0:Number(prior.max_sequence);
    if(!Number.isSafeInteger(highest)||highest<0)
      throw Error("Invalid persisted holiday staging sequence");
    if(verified.sequence<=Math.max(highest,input.lastAcceptedSequence))
      throw Error("Signed holiday staging replay or downgrade refused");
    // Never evict unacknowledged records without approved retention authority.
    if(Number(prior?.total??0)>=1024)
      throw Error("Holiday staging ledger full; human review required");
    sqlite.exec(
      "INSERT INTO hr005_signed_receipt_staging "+
      "(snapshot_id,org_id,device_id,sequence,fingerprint_sha256,expires_at,staged_at) "+
      "VALUES(?,?,?,?,?,?,?)",
      [verified.snapshotId,verified.orgId,verified.deviceId,
       verified.sequence,fingerprint,expiresAt,input.nowMs]);
    return {snapshotId:verified.snapshotId,orgId:verified.orgId,
      deviceId:verified.deviceId,stagedSequence:verified.sequence,
      canHydrate:false as const};
  });
}
