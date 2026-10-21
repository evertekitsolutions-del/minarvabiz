import {execFileSync} from "node:child_process";
const status=JSON.parse(execFileSync("supabase",["status","-o","json"],{encoding:"utf8",stdio:["ignore","pipe","inherit"]}));
function find(o,k){if(!o||typeof o!=="object")return; if(k in o)return o[k];for(const x of Object.values(o)){const v=find(x,k);if(v!==undefined)return v;}}
const url=new URL(String(find(status,"DB_URL")));
if(!["localhost","127.0.0.1","::1","[::1]"].includes(url.hostname))
  throw new Error("PLT-005 Postgres authority tests refuse nonlocal database");
execFileSync("psql",[url.href,"-X","-v","ON_ERROR_STOP=1","-f","scripts/plt005-financial-device-authority-e2e.sql"],{stdio:"inherit"});
