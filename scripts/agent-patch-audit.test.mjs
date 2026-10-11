import test from "node:test";
import assert from "node:assert/strict";
import {checkPaths,checkPatch} from "./agent-patch-audit.mjs";
test("safe bounded source edits",()=>assert.deepEqual(checkPaths(["packages/business-logic/src/example.ts","apps/web/src/example.tsx"]),["packages/business-logic/src/example.ts","apps/web/src/example.tsx"]));
test("reject workflow, secrets, migrations, traversal and unsafe extensions",()=>{
 for(const path of [".github/workflows/agent.yml",".env","supabase/migrations/secret.sql","apps/web/src/../../secrets.ts","apps/web/src/file.json"])
 assert.throws(()=>checkPaths([path]),/Unapproved/);
});
test("reject empty, duplicate and oversized edits",()=>{
 assert.throws(()=>checkPaths([]));
 assert.throws(()=>checkPaths(["apps/web/src/a.ts","apps/web/src/a.ts"]));
 assert.throws(()=>checkPaths(Array.from({length:13},(_,i)=>"apps/web/src/"+i+".ts")));
});
test("reject sensitive and binary patch formats",()=>{
 for(const patch of ["GIT binary patch","Binary files /tmp/a differ","+-----BEGIN PRIVATE KEY-----","+export FOO=.env"])
 assert.throws(()=>checkPatch(patch));
 assert.throws(()=>checkPatch("x".repeat(160001)));
 assert.doesNotThrow(()=>checkPatch("diff --git a/apps/web/src/a.ts b/apps/web/src/a.ts\n+const safe=1;"));
});
