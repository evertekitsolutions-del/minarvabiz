'use client';
import * as React from 'react';
import { onlineRosterPolicyReviews } from '@/lib/roster-policy-review-online';
import { validateReviewRequest, type ReviewDecision, type PolicyReview, type PolicyResolution, type ResolutionAction } from '@/lib/roster-policy-review-client';
import type { PolicyDraft } from '@/lib/roster-policy-client';

/** Admin review is an auditable decision, never enforcement activation. */
export function RosterPolicyReviews({branches}:{branches:ReadonlyArray<{id:string;name:string}>}){
  const [drafts,setDrafts]=React.useState<PolicyDraft[]>([]);
  const [history,setHistory]=React.useState<PolicyReview[]>([]);
  const [resolutions,setResolutions]=React.useState<PolicyResolution[]>([]);
  const [lifecycleReady,setLifecycleReady]=React.useState(false);
  const [resolveId,setResolveId]=React.useState('');
  const [resolutionAction,setResolutionAction]=React.useState<ResolutionAction>('revoked');
  const [resolutionReason,setResolutionReason]=React.useState('');
  const [resolutionConfirmed,setResolutionConfirmed]=React.useState(false);
  const [previewBranch,setPreviewBranch]=React.useState('');
  const [previewDate,setPreviewDate]=React.useState('');
  const [preview,setPreview]=React.useState<{accepted:true;review:PolicyReview}|{accepted:false;reason:string}|null>(null);
  const [loaded,setLoaded]=React.useState(false);
  const [selectedId,setSelectedId]=React.useState('');
  const [decision,setDecision]=React.useState<ReviewDecision>('approved_pending_activation');
  const [note,setNote]=React.useState('');
  const [confirmed,setConfirmed]=React.useState(false);
  const [busy,setBusy]=React.useState(false);
  const [message,setMessage]=React.useState('');
  const [error,setError]=React.useState('');
  const alive=React.useRef(true),inFlight=React.useRef(false);
  React.useEffect(()=>{alive.current=true;return()=>{alive.current=false;}},[]);
  const selected=drafts.find(d=>d.id===selectedId)||null;
  const latestForSelected=selected?history
    .filter(row=>row.policy_id===selected.id)
    .sort((a,b)=>b.policy_version-a.policy_version)[0]:undefined;
  const reviewed=!!selected&&!!latestForSelected&&latestForSelected.policy_version>=selected.version;
  const reviewToResolve=history.find(r=>r.id===resolveId)||null;
  const clearResolution=()=>{setResolveId('');setResolutionReason('');setResolutionConfirmed(false);setResolutionAction('revoked');};
  const label=(branchId:string)=>branches.find(b=>b.id===branchId)?.name||'Unavailable branch';
  const clearChoice=()=>{setSelectedId('');setNote('');setConfirmed(false);setDecision('approved_pending_activation');};
  async function load(){
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');setMessage('');
    setLoaded(false);setDrafts([]);setHistory([]);setResolutions([]);setLifecycleReady(false);setPreview(null);clearChoice();clearResolution();
    try{
      const result=await onlineRosterPolicyReviews().list();
      if(!alive.current)return;
      setDrafts(result.drafts);setHistory(result.reviews);setResolutions(result.resolutions);setLifecycleReady(result.lifecycleReady);setLoaded(true);
      setMessage('Authorized policy drafts and immutable review history loaded.');
    }catch(e){
      if(alive.current)setError(e instanceof Error?e.message:String(e));
    }finally{inFlight.current=false;if(alive.current)setBusy(false);}
  }
  async function submit(event:React.FormEvent){
    event.preventDefault();
    if(!loaded||!selected||!confirmed||reviewed||inFlight.current)return;
    try{validateReviewRequest({policy:selected,decision,note});}
    catch(e){setError(e instanceof Error?e.message:String(e));return;}
    inFlight.current=true;setBusy(true);setError('');setMessage('');
    try{
      const result=await onlineRosterPolicyReviews().review({policy:selected,decision,note});
      if(!alive.current)return;
      // A rejected request may be stale; reload before making any next decision.
      // Also reload after success to confirm independent RLS-scoped history.
      setLoaded(false);clearChoice();setDrafts([]);setHistory([]);
      if(!result.accepted){
        setError('Policy review was not recorded ('+result.reason+'). Reload the current Cloud draft and review history.');
      }else{
        setMessage('Review decision recorded as '+result.review.decision+'. Policy remains inactive and is not enforced on shifts. Reload to inspect immutable history.');
      }
    }catch(e){
      if(alive.current){setLoaded(false);clearChoice();setDrafts([]);setHistory([]);
        setError('Review outcome is unconfirmed. Reload before another decision. '+(e instanceof Error?e.message:String(e)));}
    }finally{inFlight.current=false;if(alive.current)setBusy(false);}
  }
  async function submitResolution(event:React.FormEvent){
    event.preventDefault();
    if(!loaded||!lifecycleReady||!reviewToResolve||!resolutionConfirmed||inFlight.current||
       resolutionReason.trim().length<5||resolutions.some(r=>r.review_id===reviewToResolve.id))return;
    inFlight.current=true;setBusy(true);setError('');setMessage('');
    try{
      const result=await onlineRosterPolicyReviews().resolve({
        review:reviewToResolve,resolution:resolutionAction,reason:resolutionReason
      });
      if(!alive.current)return;
      setLoaded(false);setDrafts([]);setHistory([]);setResolutions([]);setPreview(null);clearChoice();clearResolution();
      if(!result.accepted)setError('Resolution not recorded ('+result.reason+'). Reload before making another decision.');
      else setMessage('Immutable '+result.resolution.resolution+' event recorded. Scheduling remains inactive. Reload to verify history.');
    }catch(e){
      if(alive.current){setLoaded(false);setDrafts([]);setHistory([]);setResolutions([]);setPreview(null);clearResolution();
        setError('Resolution unconfirmed; reload before retrying. '+(e instanceof Error?e.message:String(e)));}
    }finally{inFlight.current=false;if(alive.current)setBusy(false);}
  }
  async function inspectCandidate(event:React.FormEvent){
    event.preventDefault();
    if(!loaded||!lifecycleReady||!previewBranch||!previewDate||inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');setPreview(null);setMessage('');
    try{
      const result=await onlineRosterPolicyReviews().candidate(previewBranch,previewDate);
      if(alive.current)setPreview(result);
    }catch(e){
      if(alive.current)setError('Read-only candidate preview unavailable. '+(e instanceof Error?e.message:String(e)));
    }finally{inFlight.current=false;if(alive.current)setBusy(false);}
  }
  const input='rounded border bg-transparent px-3 py-2';
  return <section aria-label="Administrator roster policy approvals" className="space-y-3 rounded border p-4">
    <h2 className="font-semibold">Administrator roster policy reviews</h2>
    <p>Admin or super admin only. Approved pending activation is an immutable review decision, <strong>not an active rule</strong>. It does not enforce timezone, rest, or overlap on schedules.</p>
    <button type="button" className={input} disabled={busy} onClick={()=>void load()}>
      Load / reload policy review queue
    </button>
    {error&&<p role="alert">{error}</p>}
    {message&&<p role="status">{message}</p>}
    {loaded&&!lifecycleReady&&<p>Reviewed-policy revocation and date preview are disabled until the verified database migration is deployed. Existing approvals remain inactive.</p>}
    {loaded&&drafts.length===0&&<p>No draft policies available for review.</p>}
    {loaded&&<div className="space-y-2">
      <h3 className="font-medium">Drafts awaiting administrator review</h3>
      <ul className="space-y-2">{drafts.map(draft=>{
        const last=history.filter(r=>r.policy_id===draft.id)
          .sort((a,b)=>b.policy_version-a.policy_version)[0];
        const done=!!last&&last.policy_version>=draft.version;
        return <li key={draft.id} className="rounded border p-2">
          <p>{label(draft.branch_id)} · {draft.effective_from} to {draft.effective_until||'open-ended'} · {draft.iana_zone} · DST fold {draft.dst_fold_policy} · rest {draft.minimum_rest_minutes} min · revision {draft.version}</p>
          <p>{done?'This exact revision was already reviewed.':last?'Draft updated since last review.':'Not reviewed yet.'}</p>
          <button type="button" className={input} disabled={busy||done||!branches.some(b=>b.id===draft.branch_id)}
            onClick={()=>{setSelectedId(draft.id);setDecision('approved_pending_activation');setNote('');setConfirmed(false);setError('');}}>
            Review draft revision {draft.version}
          </button>
        </li>;
      })}</ul>
    </div>}
    {loaded&&selected&&!reviewed&&<form className="space-y-3 rounded border p-3" onSubmit={event=>void submit(event)}>
      <h3 className="font-medium">Review selected draft — revision {selected.version}</h3>
      <p>{label(selected.branch_id)} · {selected.iana_zone}, {selected.effective_from} through {selected.effective_until||'no end date'} · rest {selected.minimum_rest_minutes} minutes · fold {selected.dst_fold_policy}</p>
      <fieldset disabled={busy} className="space-y-3">
        <legend>Review decision</legend>
        <label className="flex items-center gap-2"><input type="radio" name="roster-review-decision" value="approved_pending_activation" checked={decision==='approved_pending_activation'} onChange={()=>{setDecision('approved_pending_activation');setConfirmed(false);}}/>Approve for future activation only</label>
        <label className="flex items-center gap-2"><input type="radio" name="roster-review-decision" value="rejected" checked={decision==='rejected'} onChange={()=>{setDecision('rejected');setConfirmed(false);}}/>Reject draft</label>
        <label className="grid gap-1">Review explanation {decision==='rejected'?'(required)':'(optional)'}
          <textarea className={input} maxLength={1000} required={decision==='rejected'} value={note} onChange={e=>{setNote(e.target.value);setConfirmed(false);}}/>
        </label>
        <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
          I have checked the branch, dates, DST and minimum-rest values. I understand this review does not activate scheduling enforcement.
        </label>
        <button type="submit" className={input} disabled={!confirmed||(decision==='rejected'&&!note.trim())||busy}>Record immutable review decision</button>
      </fieldset>
    </form>}
    {loaded&&<div className="space-y-2">
      <h3 className="font-medium">Immutable review history (inactive)</h3>
      {history.length===0?<p>No previous policy reviews.</p>:<ul className="space-y-1">{history.map(row=>{
        const ended=resolutions.find(r=>r.review_id===row.id);
        const superseded=history.some(r=>r.policy_id===row.policy_id&&r.policy_version>row.policy_version);
        return <li key={row.id} className="rounded border p-2 text-sm">
        {label(row.branch_id)} · {row.effective_from} · policy revision {row.policy_version} · {row.decision} · {row.activation_state}
        {row.review_note&&<p>Explanation: {row.review_note}</p>}
        {ended&&<p>Immutable {ended.resolution}: {ended.reason}</p>}
        {superseded&&!ended&&<p>Superseded by a later draft review.</p>}
        {lifecycleReady&&row.decision==='approved_pending_activation'&&!ended&&!superseded&&
          <button type="button" className={input} disabled={busy}
            onClick={()=>{setResolveId(row.id);setResolutionReason('');setResolutionAction('revoked');setResolutionConfirmed(false);setError('');}}>
            Revoke or cancel pending review {row.policy_version}
          </button>}
      </li>})}</ul>}
    </div>}
    {loaded&&lifecycleReady&&reviewToResolve&&<form className="space-y-2 rounded border p-3" onSubmit={event=>void submitResolution(event)}>
      <h3 className="font-medium">Resolve pending approval — immutable event</h3>
      <p>{label(reviewToResolve.branch_id)} · {reviewToResolve.effective_from} to {reviewToResolve.effective_until||'open-ended'} · revision {reviewToResolve.policy_version}</p>
      <fieldset disabled={busy} className="space-y-2">
        <label className="flex items-center gap-2"><input type="radio" name="policy-resolution" checked={resolutionAction==='revoked'}
          onChange={()=>{setResolutionAction('revoked');setResolutionConfirmed(false);}}/>Revoke pending approval</label>
        <label className="flex items-center gap-2"><input type="radio" name="policy-resolution" checked={resolutionAction==='cancelled'}
          onChange={()=>{setResolutionAction('cancelled');setResolutionConfirmed(false);}}/>Cancel pending approval</label>
        <label className="grid gap-1">Mandatory resolution reason (5–1000 characters)
          <textarea className={input} maxLength={1000} minLength={5} required value={resolutionReason}
            onChange={e=>{setResolutionReason(e.target.value);setResolutionConfirmed(false);}}/>
        </label>
        <label className="flex items-start gap-2"><input type="checkbox" checked={resolutionConfirmed}
          onChange={e=>setResolutionConfirmed(e.target.checked)}/>
          I understand this action creates permanent audit history and does not activate or delete scheduling rules.
        </label>
        <button type="submit" className={input} disabled={busy||!resolutionConfirmed||resolutionReason.trim().length<5}>
          Record immutable revocation / cancellation
        </button>
      </fieldset>
    </form>}
    {loaded&&lifecycleReady&&<form className="space-y-2 rounded border p-3" onSubmit={event=>void inspectCandidate(event)}>
      <h3 className="font-medium">Effective-date policy preview — read only</h3>
      <p>This is a reviewed candidate for future activation only. It cannot enforce shifts, rest or DST yet.</p>
      <label className="grid gap-1">Branch
        <select className={input} required value={previewBranch}
          onChange={e=>{setPreviewBranch(e.target.value);setPreview(null);}}>
          <option value="">Choose a branch</option>
          {branches.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </label>
      <label className="grid gap-1">Effective business date
        <input className={input} type="date" required value={previewDate}
          onChange={e=>{setPreviewDate(e.target.value);setPreview(null);}}/>
      </label>
      <button type="submit" className={input} disabled={busy||!previewBranch||!previewDate}>Preview pending candidate (no changes)</button>
      {preview&&(preview.accepted
        ? <p role="status">Pending-only review revision {preview.review.policy_version}: {preview.review.iana_zone}, minimum rest {preview.review.minimum_rest_minutes} min. NOT ENFORCED.</p>
        : <p role="status">No valid pending reviewed policy for this branch and date.</p>)}
    </form>}
  </section>;
}
