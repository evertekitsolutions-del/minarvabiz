import fs from "node:fs";
import path from "node:path";

const file = path.resolve(process.argv[2] ?? "artifacts/minarvabiz.cdx.json");
if (!fs.existsSync(file)) throw new Error(`SBOM file not found: ${file}`);

const sbom = JSON.parse(fs.readFileSync(file, "utf8"));
if (sbom.bomFormat !== "CycloneDX") throw new Error("SBOM bomFormat must be CycloneDX.");
if (typeof sbom.specVersion !== "string" || !sbom.specVersion) {
  throw new Error("SBOM specVersion is missing.");
}
if (!Array.isArray(sbom.components) || sbom.components.length === 0) {
  throw new Error("SBOM must contain at least one component.");
}

const identifiable = sbom.components.filter(
  (component) =>
    typeof component?.name === "string" &&
    component.name.length > 0 &&
    (typeof component?.version === "string" || typeof component?.purl === "string"),
);

if (identifiable.length === 0) {
  throw new Error("SBOM components do not contain identifiable package metadata.");
}

console.log(
  `CycloneDX SBOM PASS: spec ${sbom.specVersion}; ${sbom.components.length} components; ${identifiable.length} identifiable.`,
);
