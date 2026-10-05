import fs from "node:fs";

const path = "supabase/config.toml";
const source = fs.readFileSync(path, "utf8");

function setSectionValue(input, section, key, value) {
  const header = "[" + section + "]";
  const start = input.indexOf(header);
  if (start < 0) throw new Error("Missing Supabase config section: " + section);
  const nextSection = input.indexOf("\n[", start + header.length);
  const end = nextSection < 0 ? input.length : nextSection;
  const block = input.slice(start, end);
  const pattern = new RegExp("^(" + key + "\\s*=\\s*).*$", "m");
  if (!pattern.test(block)) {
    throw new Error("Missing Supabase config key " + section + "." + key);
  }
  const replaced = block.replace(pattern, "$1" + value);
  return input.slice(0, start) + replaced + input.slice(end);
}

let next = source;
next = setSectionValue(next, "realtime", "enabled", "false");
next = setSectionValue(next, "studio", "enabled", "false");
next = setSectionValue(next, "storage", "enabled", "false");
next = setSectionValue(next, "edge_runtime", "enabled", "false");
next = setSectionValue(next, "analytics", "enabled", "false");
next = setSectionValue(next, "auth", "site_url", '"http://127.0.0.1:3000"');
next = setSectionValue(
  next,
  "auth",
  "additional_redirect_urls",
  '["http://127.0.0.1:3000/**"]',
);
next = setSectionValue(next, "auth", "minimum_password_length", "8");
next = setSectionValue(next, "auth.email", "enable_confirmations", "true");
next = setSectionValue(next, "auth.rate_limit", "email_sent", "20");
next = setSectionValue(next, "auth.mfa.totp", "enroll_enabled", "true");
next = setSectionValue(next, "auth.mfa.totp", "verify_enabled", "true");

fs.writeFileSync(path, next);
console.log(
  "Supabase fresh-instance E2E config prepared: email confirmation + TOTP enabled; nonessential services disabled.",
);
