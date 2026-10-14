/**
 * Discover actual production implementation candidates for EVERY registry ID.
 * This is structural traceability ONLY, not proof of completed functionality.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const prod=fs.readFileSync(path.join(root,"docs/CAPABILITY_REGISTRY.md"),"utf8");
const ai=fs.readFileSync(path.join(root,"docs/AI_CAPABILITY_REGISTRY.md"),"utf8");
const product=[...prod.matchAll(/^\|\s*([A-Z]{2,5}-\d{3})\s*\|\s*([^|]+)\|/gm)].map(m=>({id:m[1],name:m[2].trim(),kind:"product"}));
const aiRows=[...ai.matchAll(/^#{2,4}\s+(AI-[A-Z]+-\d{3})\s+[—–-]\s+(.+)$/gm)].map(m=>({id:m[1],name:m[2].trim(),kind:"ai"}));
const aiIds=[...new Set(ai.match(/\bAI-[A-Z]+-\d{3}\b/g)||[])];
const names=new Map(aiRows.map(x=>[x.id,x.name]));
const all=[...product,...aiIds.map(id=>({id,name:names.get(id)||id,kind:"ai"}))];
if(product.length!==329||aiIds.length!==111||new Set(all.map(x=>x.id)).size!==440)throw Error("Registry scope changed; manually review before reporting");
const files=[];
for(const dir of ["apps","packages"]){
 const walk=(folder)=>{for(const e of fs.readdirSync(folder,{withFileTypes:true})){if(["node_modules",".next","dist","out","coverage"].includes(e.name))continue;const p=path.join(folder,e.name);if(e.isDirectory())walk(p);else if(/\.(?:tsx?|jsx?|mjs)$/.test(e.name)&&!/(?:\.test\.|\.spec\.|__tests__)/.test(p)){files.push(path.relative(root,p).replaceAll(path.sep,"/"));}}};
 walk(path.join(root,dir));
}
const common=new Set(["the","and","for","with","from","into","have","using","multiple","support","business","system","management","custom","customer","user","users","item","items","data","core","module","modules","create","view","settings","service","services","tracking","based","across","integration","report","reports","platform"]);
const tokens=s=>[...new Set(s.toLowerCase().match(/[a-z]{4,}/g)||[])].filter(s=>!common.has(s));
const map=all.map(item=>{
 const words=tokens(item.name);
 // Simple filename-only exact-word matches, not fuzzy content or optimistic completion.
 const matches=files.filter(p=>{
  const stem=path.basename(p).replace(/\.(tsx?|jsx?|mjs)$/,"").toLowerCase().split(/[-_.]/);
  return words.some(w=>stem.includes(w)||stem.includes(w.replace(/s$/,"")));
 }).slice(0,12);
 return {...item,sourceFilenameCandidates:matches,sourceFilenameCandidateCount:matches.length,assessment:"manual_review_required"};
});
const matched=map.filter(x=>x.sourceFilenameCandidateCount>0).length;
const report={auditedMainCommit:process.env.GITHUB_SHA||"local",method:"Filename token candidate discovery only. Not code implementation, test passing, deployment or UAT.",total:440,productionFilesScanned:files.length,withFilenameCandidates:matched,noFilenameCandidates:440-matched,filenameCandidateCoveragePercent:Number((100*matched/440).toFixed(2)),actualCompletionPercent:null,capabilities:map};
if(process.argv.includes("--summary"))process.stdout.write(JSON.stringify({...report,capabilities:undefined},null,2)+"\n");
else process.stdout.write(JSON.stringify(report,null,2)+"\n");
