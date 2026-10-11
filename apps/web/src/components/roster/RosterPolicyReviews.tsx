'use client';
import * as React from 'react';
import { onlineRosterPolicyReviews } from '@/lib/roster-policy-review-online';
import { validateReviewRequest, type ReviewDecision, type PolicyReview } from '@/lib/roster-policy-review-client';
import type { PolicyDraft } from '@/lib/roster-policy-client';

/** Admin review is an auditable decision, never enforcement activation. */
export function RosterPolicyReviews({branches}:{branches:ReadonlyArray<{id:string;name:string}>}){
  const [drafts,setDrafts]=React.useState<PolicyDraft[]>([]);
  const [history,setHistory]=React.useState<PolicyReview[]>([]);
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
  const label=(branchId:string)=>branches.find(b=>b.id===branchId)?.name||'Unavailable branch';
  const clearChoice=()=>{setSelectedId('');setNote('');setConfirmed(false);setDecision('approved_pending_activation');};
  async function load(){
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');setMessage('');
    setLoaded(false);setDrafts([]);setHistory([]);clearChoice();
    try{
      const result=await onlineRosterPolicyReviews().list();
      if(!alive.current)return;
      setDrafts(result.drafts);setHistory(result.reviews);setLoaded(true);
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
  const input='rounded border bg-transparent px-3 py-2';
  return <section aria-label="Administrator roster policy approvals" className="space-y-3 rounded border p-4">
    <h2 className="font-semibold">Administrator roster policy reviews</h2>
    <p>Admin or super admin only. Approved pending activation is an immutable review decision, <strong>not an active rule</strong>. It does not enforce timezone, rest, or overlap on schedules.</p>
    <button type="button" className={input} disabled={busy} onClick={()=>void load()}>
      Load / reload policy review queue
    </button>
    {error&&<p role="alert">{error}</p>}
    {message&&<p role="status">{message}</p>}
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
      {history.length===0?<p>No previous policy reviews.</p>:<ul className="space-y-1">{history.map(row=><li key={row.id} className="rounded border p-2 text-sm">
        {label(row.branch_id)} · {row.effective_from} · policy revision {row.policy_version} · {row.decision} · {row.activation_state}
        {row.review_note&&<p>Explanation: {row.review_note}</p>}
      </li>)}</ul>}
    </div>}
  </section>;
}
