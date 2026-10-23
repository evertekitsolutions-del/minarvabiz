import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText,
  filename,
);
const { createCheckoutSubmitGate } = require("../../../ui/src/components/sales/checkout-submit-gate.ts");

test("immediate double click submits one sale, before React can commit cart reset", () => {
  const gate = createCheckoutSubmitGate();
  let persistedSales = 0;
  function submitCart() {
    if (!gate.tryStart()) return false;
    persistedSales++;
    // React setCart([]) is queued, but old button handlers can still run.
    return true;
  }
  assert.equal(submitCart(), true);
  assert.equal(submitCart(), false);
  assert.equal(submitCart(), false);
  assert.equal(persistedSales, 1);
  assert.equal(gate.isClaimed(), true);
  // The committed empty cart permits the next distinct transaction.
  gate.release();
  assert.equal(submitCart(), true);
  assert.equal(persistedSales, 2);
});

test("validation failures, rejected checkout and thrown handlers permit corrected retry", () => {
  const gate = createCheckoutSubmitGate();
  assert.equal(gate.tryStart(), true);
  gate.release();
  assert.equal(gate.tryStart(), true);
  gate.release();
  assert.equal(gate.tryStart(), true);
  assert.equal(gate.tryStart(), false);
});

test("separate checkout surfaces and re-opened carts are independent", () => {
  const pos = createCheckoutSubmitGate();
  const normal = createCheckoutSubmitGate();
  assert.equal(pos.tryStart(), true);
  assert.equal(pos.tryStart(), false);
  assert.equal(normal.tryStart(), true);
  assert.equal(normal.tryStart(), false);
  pos.release();
  assert.equal(pos.tryStart(), true);
  assert.equal(normal.tryStart(), false);
});

for (const [name, file, cartState, submitCall, reset] of [
  ["POS", "PosBilling.tsx", "cart", "submit({", "resetCheckout();"],
  ["Normal Billing", "NormalBilling.tsx", "lines", "onCompleteSale({", "setLines([]);"],
]) {
  test(`${name} uses a synchronous latch BEFORE executing a sale, releases only on failure or cleared cart`, () => {
    const source = fs.readFileSync(
      new URL(`../../../ui/src/components/sales/${file}`, import.meta.url),
      "utf8",
    );
    assert.match(source, /React\.useRef\(createCheckoutSubmitGate\(\)\)/);
    assert.match(source, new RegExp(`if \\(\\b${cartState}\\.length === 0\\) checkoutSubmitGate\\.current\\.release\\(\\)`));
    const start = source.search(/  (?:async )?function complete\(\) \{/);
    const end = source.indexOf("\n  }", start);
    assert.ok(start >= 0 && end > start, "complete handler must be present");
    const handler = source.slice(start, end);
    const claim = handler.indexOf("checkoutSubmitGate.current.tryStart()");
    const submit = handler.indexOf(submitCall);
    assert.ok(claim >= 0 && submit > claim, "guard must claim synchronously before checkout side effects");
    const firstAwait = handler.indexOf("await ");
    assert.ok(firstAwait < 0 || claim < firstAwait, "latch must be claimed before the first asynchronous suspension");
    const unlocks = [...handler.matchAll(/checkoutSubmitGate\.current\.release\(\)/g)];
    assert.ok(unlocks.length >= 2, "failure return and throw must both release the latch");
    assert.ok(handler.includes(reset), "successful checkout must clear the cart");
    const successBlock = handler.slice(handler.indexOf("if (result.success)") >= 0
      ? handler.indexOf("if (result.success)")
      : handler.indexOf("if (!result.success)"));
    assert.match(successBlock, /setMessage\(/);
  });
}
