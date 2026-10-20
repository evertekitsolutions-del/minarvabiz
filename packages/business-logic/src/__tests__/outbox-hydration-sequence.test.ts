import assert from "node:assert/strict";
import { test } from "node:test";
import {
  enqueueOutbox,
  exportOutbox,
  hydrateOutbox,
  setOutboxScope,
} from "../outbox-bridge";

test("hydration ignores corrupt sequences without modifying audit records", () => {
  const corrupted = [
    { ...enqueueOutbox("customers", "first", "insert", {}), sequence: Number.NaN },
    { ...enqueueOutbox("customers", "second", "insert", {}), sequence: Number.POSITIVE_INFINITY },
    { ...enqueueOutbox("customers", "third", "insert", {}), sequence: 17 },
  ];
  try {
    hydrateOutbox(corrupted);
    const next = enqueueOutbox("customers", "fourth", "insert", {});
    assert.equal(next.sequence, 18);
    assert.equal(exportOutbox()[0].sequence, Number.NaN);
    assert.equal(exportOutbox()[1].sequence, Number.POSITIVE_INFINITY);
  } finally {
    hydrateOutbox([]);
    setOutboxScope(null);
  }
});

test("hydration of a large queue does not overflow argument limits", () => {
  const entry = enqueueOutbox("customers", "first", "insert", {});
  try {
    hydrateOutbox(Array.from({ length: 100_000 }, (_, index) => ({
      ...entry,
      id: String(index),
      sequence: index + 1,
    })));
    assert.equal(enqueueOutbox("customers", "next", "insert", {}).sequence, 100_001);
  } finally {
    hydrateOutbox([]);
  }
});
