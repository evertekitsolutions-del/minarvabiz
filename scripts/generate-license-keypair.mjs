import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicDer = publicKey.export({ type: "spki", format: "der" });
const privateDer = privateKey.export({ type: "pkcs8", format: "der" });

// Ed25519 raw keys are the final 32 bytes of the SPKI/PKCS8 encodings.
const publicKeyHex = publicDer.subarray(-32).toString("hex");
const privateKeyHex = privateDer.subarray(-32).toString("hex");

console.log("MINARVA_LICENSE_PUBLIC_KEY_HEX=" + publicKeyHex);
console.log("LICENSE_PRIVATE_KEY=" + privateKeyHex);
console.log("");
console.log("Store LICENSE_PRIVATE_KEY only in the license-admin production secret store.");
console.log("Use MINARVA_LICENSE_PUBLIC_KEY_HEX in the desktop build environment.");
