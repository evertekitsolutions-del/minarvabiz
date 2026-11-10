import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(p)=>readFileSync(p,"utf8");

test("M23 standalone PWA is online-only, secure, never caches authoritative data",()=>{
 const manifest=read("apps/web/src/app/manifest.ts");
 const boot=read("apps/web/src/components/SaaSPwaBoot.tsx");
 const sw=read("apps/web/public/sw.js");
 const layout=read("apps/web/src/app/layout.tsx");
 assert.match(manifest,/display: "standalone"/);
 assert.match(manifest,/start_url: "\/login"/);
 assert.match(layout,/manifest: "\/manifest\.webmanifest"/);
 assert.match(boot,/isSecureContext/);
 assert.match(boot,/serviceWorker\.register\("\/sw\.js"/);
 const executable=sw.replace(/\/\*[\s\S]*?\*\//g,"").replace(/^\s*\/\/.*$/gm,"");
 assert.doesNotMatch(executable,/caches\.open|cache\.put|CacheStorage|respondWith\(|indexedDB\.|localStorage\./);
});
test("M23 camera scanner requires HTTPS/user grant, never caches a frame and releases MediaStream",()=>{
 const s=read("apps/web/src/components/SaasCameraBarcodeScanner.tsx");
 for(const x of [
 /window\.isSecureContext/,/navigator\.mediaDevices\.getUserMedia/,
 /facingMode:\{ideal:"environment"\}/,/BarcodeDetector/,
 /qr_code/,/code_128/,/ean_13/,/media\.getTracks\(\)\.forEach/,
 /stream\.current\?\.getTracks\(\)\.forEach/,/cancelAnimationFrame/,
 /onDetected/,/manual/i,/min-h-\[44px\]/,
 ])assert.match(s,x);
 assert.doesNotMatch(s,/indexedDB|localStorage|caches\.open|upload|fetch\(|Supabase|Blob|canvas\.toDataURL/);
});
test("M23 cloud POS and laundry tag counter have mobile touch targets and camera wiring",()=>{
 const pos=read("apps/web/src/app/(app)/sales/saas-cloud-pos.tsx");
 const garment=read("apps/web/src/app/(app)/laundry/saas-garment-workflow.tsx");
 for(const s of [pos,garment]){
  assert.match(s,/SaasCameraBarcodeScanner/);
  assert.match(s,/min-h-\[44px\]/);
  assert.match(s,/grid gap-2 sm:grid-cols-/);
 }
 assert.match(pos,/setProductId\(match\.id\)/);
 assert.match(pos,/p\.barcode,p\.sku,p\.id/);
 assert.match(garment,/setTagFilter/);
 assert.match(garment,/j\.tag_code\.toLowerCase\(\)\.includes/);
});
