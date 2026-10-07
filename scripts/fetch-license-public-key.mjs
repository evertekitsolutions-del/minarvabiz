import { appendFileSync } from "node:fs";

const baseUrl = String(process.env.VITE_LICENSE_API_URL || "").replace(/\/$/, "");
if (!/^https:\/\//i.test(baseUrl)) {
  throw new Error("VITE_LICENSE_API_URL must be a valid HTTPS URL.");
}
if (!process.env.GITHUB_ENV) {
  throw new Error("GITHUB_ENV is required.");
}

const endpoint = baseUrl + "/api/public-key";
let publicKeyHex = "";

for (let attempt = 1; attempt <= 12; attempt += 1) {
  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) {
      const data = await response.json();
      const candidate = String(data?.publicKeyHex || "").trim().toLowerCase();
      if (/^[0-9a-f]{64}$/.test(candidate)) {
        publicKeyHex = candidate;
        break;
      }
    }
  } catch {
    // The provider-neutral HTTPS authority may be redeploying. Retry below.
  }
  console.log(`Public-key endpoint not ready (attempt ${attempt}/12).`);
  await new Promise((resolve) => setTimeout(resolve, 5_000));
}

if (!/^[0-9a-f]{64}$/.test(publicKeyHex)) {
  throw new Error(`Could not obtain a valid production license public key from ${endpoint}.`);
}

appendFileSync(process.env.GITHUB_ENV, `MINARVA_LICENSE_PUBLIC_KEY_HEX=${publicKeyHex}\n`, "utf8");
console.log("PRODUCTION_LICENSE_KEY FETCH PASS: received 64-hex verification key.");
