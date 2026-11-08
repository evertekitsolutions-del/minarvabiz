import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { fetchVerifiedInstaller } from "../apps/desktop/electron/resumable-download.ts";

const sha = (data) => createHash("sha256").update(data).digest("hex");
const url = "https://github.com/evertekitsolutions-del/minarvabiz/releases/download/v1.0.27/MinarvaBiz-Setup-1.0.27.exe";
const bytes = Buffer.from("minarva-resume-regression-".repeat(100));

function mockFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => { globalThis.fetch = original; };
}

async function withTarget(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "minarva-update-"));
  try { await fn(path.join(dir, "MinarvaBiz-Setup-1.0.27.exe")); }
  finally { await fs.rm(dir, { recursive: true, force: true }); }
}

test("streams signed installer to disk instead of a large arrayBuffer", async () => {
  await withTarget(async (target) => {
    const restore = mockFetch(async (_url, init) => {
      assert.equal(init.headers, undefined);
      return new Response(bytes, { status: 200, headers: { "content-length": String(bytes.length) } });
    });
    try {
      assert.equal(await fetchVerifiedInstaller(url, target, sha(bytes)), target);
      assert.deepEqual(await fs.readFile(target), bytes);
    } finally { restore(); }
  });
});

test("resumes interrupted installer with byte-exact Range and verifies the full digest", async () => {
  await withTarget(async (target) => {
    const first = bytes.subarray(0, 127);
    const rest = bytes.subarray(127);
    let calls = 0;
    const restore = mockFetch(async (_url, init) => {
      calls++;
      if (calls === 1) {
        assert.equal(init.headers, undefined);
        let step = 0;
        return new Response(new ReadableStream({
          pull(controller) {
            if (step++ === 0) controller.enqueue(first);
            else controller.error(new Error("CDN connection interrupted"));
          },
        }), { status: 200, headers: { "content-length": String(bytes.length) } });
      }
      assert.equal(init.headers?.Range, "bytes=127-");
      return new Response(rest, {
        status: 206,
        headers: {
          "content-range": "bytes 127-" + (bytes.length - 1) + "/" + bytes.length,
          "content-length": String(rest.length),
        },
      });
    });
    try {
      assert.equal(await fetchVerifiedInstaller(url, target, sha(bytes)), target);
      assert.equal(calls, 2);
      assert.deepEqual(await fs.readFile(target), bytes);
      // A verified installer is reused on subsequent clicks without a new download.
      assert.equal(await fetchVerifiedInstaller(url, target, sha(bytes)), target);
      assert.equal(calls, 2);
    } finally { restore(); }
  });
});

test("a CDN that ignores Range must restart rather than append corrupted bytes", async () => {
  await withTarget(async (target) => {
    const part = target + "." + sha(bytes).slice(0, 16) + ".partial";
    await fs.writeFile(part, Buffer.from("partial old bytes"));
    const restore = mockFetch(async (_url, init) => {
      assert.equal(init.headers.Range, "bytes=17-");
      return new Response(bytes, { status: 200, headers: { "content-length": String(bytes.length) } });
    });
    try {
      assert.equal(await fetchVerifiedInstaller(url, target, sha(bytes)), target);
      assert.deepEqual(await fs.readFile(target), bytes);
    } finally { restore(); }
  });
});

test("unverified payload is never installed or renamed", async () => {
  await withTarget(async (target) => {
    const restore = mockFetch(async () =>
      new Response(Buffer.from("incorrect"), { status: 200, headers: { "content-length": "9" } }));
    try {
      await assert.rejects(
        fetchVerifiedInstaller(url, target, sha(bytes)),
        /SHA-256 verification/,
      );
      await assert.rejects(fs.stat(target), { code: "ENOENT" });
    } finally { restore(); }
  });
});

test("reject invalid manifest digest before any HTTP request", async () => {
  await withTarget(async (target) => {
    const restore = mockFetch(async () => { throw new Error("Unexpected fetch"); });
    try {
      await assert.rejects(fetchVerifiedInstaller(url, target, "deadbeef"), /Invalid installer SHA-256/);
    } finally { restore(); }
  });
});
