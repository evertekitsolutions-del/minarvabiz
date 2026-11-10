import assert from "node:assert/strict";
import test from "node:test";
import { signupDisposition, signupErrorMessage } from "../registration-status.ts";

test("repeated verified signup with obfuscated identities is not treated as an email sent", () => {
  assert.equal(signupDisposition({user:{identities:[]},session:null}),"possible_existing_account");
});
test("new signup without session requires verification", () => {
  assert.equal(signupDisposition({user:{identities:[{id:"provider"}]},session:null}),"awaiting_verification");
});
test("session-present signup is authenticated", () => {
  assert.equal(signupDisposition({user:null,session:{access_token:"example"}}),"signed_in");
});
test("restricted email provider surfaces an actionable error", () => {
  assert.match(signupErrorMessage({code:"email_address_not_authorized"}), /cannot be delivered/i);
  assert.match(signupErrorMessage({code:"over_email_send_rate_limit"}), /rate limit/i);
});

test("duplicate signup error points to password recovery", () => {
  assert.match(signupErrorMessage({message:"User already registered"}), /original password/i);
});
test("unknown auth errors retain their message", () => {
  assert.equal(signupErrorMessage({message:"Network timeout"}),"Network timeout");
});
