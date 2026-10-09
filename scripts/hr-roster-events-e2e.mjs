import { execFileSync } from "node:child_process";
const status=JSON.parse(execFileSync("supabase",["status","-o","json"],{encoding:"utf8",stdio:["ignore","pipe","inherit"]}));
function find(value,key){if(!value||typeof value!=="object")return undefined;if(key in value)return value[key];for(const child of Object.values(value)){const nested=find(child,key);if(nested!==undefined)return nested;}}
const db=new URL(String(find(status,"DB_URL")));
if(!["127.0.0.1","localhost","::1","[::1]"].includes(db.hostname))throw new Error("Roster events E2E requires an isolated local Supabase database");
execFileSync("psql",[db.href,"-X","-v","ON_ERROR_STOP=1","-f","scripts/hr-roster-events-e2e.sql"],{stdio:"inherit"});
