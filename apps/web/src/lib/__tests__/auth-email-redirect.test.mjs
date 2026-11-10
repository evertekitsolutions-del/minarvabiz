import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {authEmailRedirectUrl, PRODUCTION_AUTH_ORIGIN} from "../auth-email-redirect.ts";

test("production recovery can never redirect to localhost",()=>{
  assert.equal(authEmailRedirectUrl("/reset-password","http://localhost:3000",true),"https://minarvabiz.com/reset-password");
  assert.equal(authEmailRedirectUrl("/reset-password","https://preview.workers.dev",true),"https://minarvabiz.com/reset-password");
});
test("production signup callback canonicalizes the www domain",()=>{
  assert.equal(authEmailRedirectUrl("/register/complete","https://www.minarvabiz.com",true),"https://minarvabiz.com/register/complete");
});
test("local development still supports localhost without changing production rules",()=>{
  assert.equal(authEmailRedirectUrl("/reset-password","http://localhost:3000",false),"http://localhost:3000/reset-password");
});
test("both registration and recovery forms use the production-safe helper",()=>{
  const register=fs.readFileSync(new URL("../../app/register/page.tsx",import.meta.url),"utf8");
  const recovery=fs.readFileSync(new URL("../../app/forgot-password/page.tsx",import.meta.url),"utf8");
  assert.match(register,/authEmailRedirectUrl\("\/register\/complete"/);
  assert.match(recovery,/authEmailRedirectUrl\("\/reset-password"/);
  assert.equal(PRODUCTION_AUTH_ORIGIN,"https://minarvabiz.com");
});
