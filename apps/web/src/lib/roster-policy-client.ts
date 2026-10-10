/** Draft policy boundary. Server RLS/RPC remains authoritative; no local outbox. */
export interface PolicyDraftInput {
  branchId: string; effectiveFrom: string; effectiveUntil: string | null;
  ianaZone: string; foldPolicy: 'reject' | 'earlier' | 'later';
  minimumRestMinutes: number; expectedVersion: number;
}
export interface PolicyDraft {
  id: string; org_id: string; branch_id: string; effective_from: string;
  effective_until: string | null; iana_zone: string; dst_gap_policy: 'reject';
  dst_fold_policy: PolicyDraftInput['foldPolicy']; minimum_rest_minutes: number;
  status: 'draft'; version: number;
}
interface Authority { orgId: string; role: string; ensureCurrent(): void }
interface Transport {
  authorize(): Promise<Authority>;
  read(authority: Authority): Promise<unknown>;
  write(args: Record<string, unknown>, authority: Authority): Promise<unknown>;
}
const uuid = (x: unknown): x is string => typeof x === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x);
function date(x: unknown): asserts x is string {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x) ||
      x < '1900-01-01' || x > '9999-12-31' ||
      new Date(x+'T00:00:00Z').toISOString().slice(0,10) !== x) throw Error('Invalid policy date');
}
export function validatePolicyDraft(input: PolicyDraftInput) {
  if (!uuid(input.branchId)) throw Error('Invalid policy branch');
  date(input.effectiveFrom);
  if (input.effectiveUntil !== null) {
    date(input.effectiveUntil);
    if (input.effectiveUntil < input.effectiveFrom) throw Error('Invalid policy date range');
  }
  if (!['reject','earlier','later'].includes(input.foldPolicy)) throw Error('Invalid DST choice');
  if (!Number.isInteger(input.minimumRestMinutes) || input.minimumRestMinutes < 0 || input.minimumRestMinutes > 10080) throw Error('Rest must be 0–10080 whole minutes');
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0 || input.expectedVersion >= 2147483647) throw Error('Invalid policy revision');
  if (typeof input.ianaZone !== 'string' || input.ianaZone.length > 128 ||
      !/^(?:UTC|[A-Za-z][A-Za-z0-9_+.-]*(?:\/[A-Za-z0-9_+.-]+)+)$/.test(input.ianaZone)) throw Error('Use a named IANA timezone');
  // PostgreSQL validates zone existence using its own timezone database.
}
function parse(value: unknown, org: string): PolicyDraft {
  if (!value || typeof value !== 'object') throw Error('Invalid policy response');
  const row = value as PolicyDraft;
  if (row.org_id !== org) throw Error('Policy organization mismatch');
  if (!uuid(row.id) || row.status !== 'draft' || row.dst_gap_policy !== 'reject') throw Error('Invalid draft policy response');
  if (!Number.isInteger(row.version) || row.version < 1 || row.version >= 2147483647) throw Error('Invalid policy revision');
  validatePolicyDraft({branchId:row.branch_id,effectiveFrom:row.effective_from,effectiveUntil:row.effective_until,
    ianaZone:row.iana_zone,foldPolicy:row.dst_fold_policy,minimumRestMinutes:row.minimum_rest_minutes,expectedVersion:row.version});
  return row;
}
export function createRosterPolicyClient(transport: Transport) {
  async function authorize() {
    const authority = await transport.authorize();
    if (!uuid(authority.orgId) || !['super_admin','admin','manager'].includes(authority.role)) throw Error('Authorized manager required');
    authority.ensureCurrent();
    return authority;
  }
  return {
    async list(): Promise<PolicyDraft[]> {
      const authority = await authorize();
      const response = await transport.read(authority);
      authority.ensureCurrent();
      if (!Array.isArray(response)) throw Error('Invalid policy list response');
      const rows = response.map(row => parse(row,authority.orgId));
      if (new Set(rows.map(r=>r.id)).size !== rows.length) throw Error('Duplicate policy response');
      return rows;
    },
    async save(input: PolicyDraftInput): Promise<{accepted:true;record:PolicyDraft}|{accepted:false;remote:PolicyDraft|null}> {
      validatePolicyDraft(input);
      const authority = await authorize();
      const response = await transport.write({p_branch_id:input.branchId,p_effective_from:input.effectiveFrom,
        p_effective_until:input.effectiveUntil,p_iana_zone:input.ianaZone,p_dst_fold_policy:input.foldPolicy,
        p_minimum_rest_minutes:input.minimumRestMinutes,p_expected_version:input.expectedVersion},authority);
      authority.ensureCurrent();
      if (!response || typeof response !== 'object') throw Error('Invalid save response; reload before retrying');
      const result = response as Record<string,unknown>;
      if (result.accepted !== true && result.accepted !== false) throw Error('Invalid save response');
      const raw = result.accepted ? result.record : result.remote;
      const row = raw === null && !result.accepted ? null : parse(raw,authority.orgId);
      if (row && (row.branch_id !== input.branchId || row.effective_from !== input.effectiveFrom)) throw Error('Policy response identity mismatch');
      if (!result.accepted) return {accepted:false,remote:row};
      if (!row || row.version !== input.expectedVersion+1) throw Error('Unexpected saved policy revision');
      if (row.iana_zone !== input.ianaZone || row.effective_until !== input.effectiveUntil ||
          row.dst_fold_policy !== input.foldPolicy || row.minimum_rest_minutes !== input.minimumRestMinutes) throw Error('Saved draft does not match requested values');
      return {accepted:true,record:row};
    },
  };
}
