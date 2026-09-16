import { issueLicense, type LicensePlan } from "../src/issuer";
import type { Edition } from "@minarvabiz/types";

const PLANS = new Set<LicensePlan>(["trial", "basic", "professional", "business", "enterprise"]);
const EDITIONS = new Set<Edition>(["online", "offline", "hybrid"]);

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
}

function usage(): never {
  console.error(
    "Usage: LICENSE_PRIVATE_KEY=<64-hex> pnpm --filter @minarvabiz/licensing issue-license -- --customer=Name --plan=basic --edition=offline [--expires=YYYY-MM-DD] [--device=64-hex]"
  );
  process.exit(2);
}

async function main() {
  const customerName = arg("customer");
  const plan = arg("plan") as LicensePlan | undefined;
  const edition = arg("edition") as Edition | undefined;
  const expires = arg("expires");
  const device = arg("device");
  const privateKeyHex = String(process.env.LICENSE_PRIVATE_KEY || "")
    .replace(/^0x/i, "")
    .replace(/\s/g, "")
    .toLowerCase();

  if (!customerName || !plan || !edition || !PLANS.has(plan) || !EDITIONS.has(edition)) usage();
  if (!/^[0-9a-f]{64}$/.test(privateKeyHex)) {
    throw new Error("LICENSE_PRIVATE_KEY must be a 64-character hexadecimal Ed25519 private key and must never be committed to Git.");
  }
  if (device && !/^[0-9a-f]{64}$/i.test(device)) {
    throw new Error("--device must be a 64-character hexadecimal device fingerprint.");
  }

  const issued = await issueLicense({
    customerName,
    plan,
    edition,
    expiresAt: expires || null,
    activationLimit: device ? 1 : undefined,
    deviceBindings: device ? [device.toLowerCase()] : [],
    privateKeyHex,
  });

  console.log(JSON.stringify({
    customerName: issued.customerName,
    licenseId: issued.payload.licenseId,
    plan: issued.payload.plan,
    edition: issued.payload.edition,
    issuedAt: issued.payload.issuedAt,
    expiresAt: issued.payload.expiresAt,
    token: issued.token,
    deviceBinding: device || null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
