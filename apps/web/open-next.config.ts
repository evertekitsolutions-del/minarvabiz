import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Keep hosting optional: standard `next build` / `next start` remain available.
// Dynamic tenant pages use no persistent Cloudflare cache or paid storage.
export default defineCloudflareConfig();
