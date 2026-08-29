import * as ed from "@noble/ed25519";
import { bytesToHex } from "../src/token";
async function main() {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  console.log("PUBLIC KEY:\n" + bytesToHex(publicKey));
  console.log("\nPRIVATE KEY (KEEP SECRET):\n" + bytesToHex(privateKey));
}
main().catch(console.error);
