import {execFileSync} from 'node:child_process';
const status=JSON.parse(execFileSync('supabase',['status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','inherit']}));
function find(o,k){if(!o||typeof o!=='object')return; if(k in o)return o[k];for(const c of Object.values(o)){const v=find(c,k);if(v!==undefined)return v;}}
const db=new URL(String(find(status,'DB_URL')));
if(!['localhost','127.0.0.1','::1','[::1]'].includes(db.hostname))throw new Error('Attendance E2E is restricted to an isolated local database');
execFileSync('psql',[db.href,'-X','-v','ON_ERROR_STOP=1','-f','scripts/attendance-authority-e2e.sql'],{stdio:'inherit'});
