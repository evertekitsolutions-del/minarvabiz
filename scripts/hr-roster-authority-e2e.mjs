import { execFileSync } from "node:child_process";
const out=JSON.parse(execFileSync("supabase",["status","-o","json"],{encoding:"utf8",stdio:["ignore","pipe","inherit"]}));
function find(object,key){if(!object||typeof object!=="object")return; if(key in object)return object[key]; for(const value of Object.values(object)){const nested=find(value,key);if(nested!==undefined)return nested;}}
const db=new URL(String(find(out,"DB_URL")));
if(!["localhost","127.0.0.1","::1","[::1]"].includes(db.hostname))throw new Error("Roster tenant E2E is restricted to an isolated local Supabase database");
execFileSync("psql",[db.href,"-X","-v","ON_ERROR_STOP=1","-f","scripts/hr-roster-authority-e2e.sql"],{stdio:"inherit"});
