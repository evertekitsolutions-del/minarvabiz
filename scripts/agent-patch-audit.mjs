import fs from "node:fs";
import {execFileSync} from "node:child_process";
const ALLOWED = ["apps/web/src/", "apps/desktop/src/", "packages/business-logic/src/", "packages/utils/src/"];
const maxFiles = 12;
const maxPatchBytes = 160000;
export function checkPaths(paths) {
  if (!Array.isArray(paths) || !paths.length || paths.length > maxFiles)
    throw Error("Expected 1-12 distinct application source edits");
  if (new Set(paths).size !== paths.length) throw Error("Duplicate changed paths");
  for (const p of paths) {
    if (typeof p !== "string" || p.includes("..") || p.startsWith("/") || !ALLOWED.some(a=>p.startsWith(a)) || !/\.(ts|tsx|mjs|js)$/.test(p))
      throw Error("Unapproved source path: " + p);
  }
  return paths;
}
export function checkPatch(patch) {
  if (Buffer.byteLength(patch) > maxPatchBytes || !patch.trim()) throw Error("Patch empty or over size limit");
  if (/GIT binary patch|Binary files |\.env|private.key|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/i.test(patch))
    throw Error("Binary, credential or environment material in patch");
  return true;
}
function git(...args) {return execFileSync("git", args, {encoding:"utf8",maxBuffer:1024*1024});}
export function auditWorkspace() {
  const entries=git("status","--porcelain","--untracked-files=all").split("\n").filter(Boolean);
  if (!entries.length) throw Error("AI generated no changes");
  const paths=entries.map(line=>line.slice(3));
  checkPaths(paths);
  if (entries.some(e=>e.slice(0,2).includes("D") || e.slice(0,2).includes("R")))
    throw Error("Deleted or renamed source is not accepted by unattended patch audit");
  git("diff","--check");
  const patch=git("diff","--binary","--","apps/web/src","apps/desktop/src","packages/business-logic/src","packages/utils/src");
  checkPatch(patch);
  fs.mkdirSync(".agent-artifacts",{recursive:true});
  fs.writeFileSync(".agent-artifacts/minarva-source-review.patch",patch,{flag:"wx"});
  console.log("MINARVA_AGENT_SOURCE_PATCH " + paths.length + " file(s), " + Buffer.byteLength(patch) + " bytes, review required");
}
if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  try{auditWorkspace();}catch(e){console.error("MINARVA_AGENT_PATCH_REJECTED:",e.message);process.exitCode=1;}
}
