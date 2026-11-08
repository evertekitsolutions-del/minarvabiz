import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";

const MAX_INSTALLER_BYTES = 500 * 1024 * 1024;
const MAX_ATTEMPTS = 5;
const IDLE_TIMEOUT_MS = 90_000;
const CONNECT_TIMEOUT_MS = 45_000;
const TOTAL_TIMEOUT_MS = 35 * 60_000;

async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function matchesExpectedHash(file: string, digest: string): Promise<boolean> {
  try {
    const stat = await fs.promises.stat(file);
    return stat.isFile() && stat.size > 0 && stat.size <= MAX_INSTALLER_BYTES &&
      (await sha256File(file)) === digest;
  } catch {
    return false;
  }
}

async function writeResponseBody(
  response: Response,
  partial: string,
  offset: number,
  declaredTotal: number | null,
  deadline: number,
  controller: AbortController,
): Promise<void> {
  const file = await fs.promises.open(partial, offset > 0 ? "a" : "w");
  const reader = response.body!.getReader();
  let written = offset;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const armTimeout = () => {
    if (timer) clearTimeout(timer);
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Installer download exceeded its total time budget.");
    timer = setTimeout(() => controller.abort(), Math.min(remaining, IDLE_TIMEOUT_MS));
  };
  try {
    while (true) {
      armTimeout();
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      written += value.byteLength;
      if (written > MAX_INSTALLER_BYTES || (declaredTotal !== null && written > declaredTotal)) {
        throw new Error("Installer exceeds the allowed or declared download size.");
      }
      let position = 0;
      while (position < value.byteLength) {
        const result = await file.write(value, position, value.byteLength - position);
        if (result.bytesWritten <= 0) throw new Error("Installer could not be written to disk.");
        position += result.bytesWritten;
      }
    }
    if (declaredTotal !== null && written !== declaredTotal) {
      throw new Error("Installer connection ended before the complete download.");
    }
    await file.sync();
  } finally {
    if (timer) clearTimeout(timer);
    try { await reader.cancel(); } catch {}
    reader.releaseLock();
    await file.close();
  }
}

async function downloadAttempt(url: string, partial: string, expected: string, deadline: number) {
  let offset = 0;
  try {
    offset = (await fs.promises.stat(partial)).size;
  } catch {}
  if (offset > MAX_INSTALLER_BYTES) {
    await fs.promises.truncate(partial, 0);
    offset = 0;
  }

  const controller = new AbortController();
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("Installer download timed out.");
  const connectTimer = setTimeout(() => controller.abort(), Math.min(remaining, CONNECT_TIMEOUT_MS));

  let response: Response;
  try {
    response = await fetch(url, {
      headers: offset ? { Range: "bytes=" + offset + "-" } : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(connectTimer);
  }

  if (response.status === 416 && offset > 0) {
    if (await matchesExpectedHash(partial, expected)) return;
    await fs.promises.truncate(partial, 0);
    throw new Error("Download server refused an incomplete resume; restarting.");
  }
  if (!response.ok || !response.body || (response.status !== 200 && response.status !== 206)) {
    throw new Error("Installer download failed with HTTP " + response.status + ".");
  }

  let total: number | null = null;
  if (response.status === 206) {
    if (offset <= 0) throw new Error("Unexpected partial installer response.");
    const header = response.headers.get("content-range") || "";
    const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(header);
    if (!match) throw new Error("Resume response has no trusted byte range.");
    const start = Number(match[1]), end = Number(match[2]), size = Number(match[3]);
    if (!Number.isSafeInteger(size) || size <= offset || size > MAX_INSTALLER_BYTES ||
        start !== offset || end < start || end >= size) {
      throw new Error("Resume response has an invalid byte range.");
    }
    total = size;
  } else {
    // Some CDNs ignore Range requests. Never append their entire response.
    offset = 0;
    const header = response.headers.get("content-length");
    if (header !== null) {
      const size = Number(header);
      if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_INSTALLER_BYTES) {
        throw new Error("Installer has an invalid content length.");
      }
      total = size;
    }
  }
  const lengthHeader = response.headers.get("content-length");
  if (response.status === 206 && lengthHeader !== null) {
    const declared = Number(lengthHeader);
    if (!Number.isSafeInteger(declared) || declared !== total! - offset) {
      throw new Error("Resumed response length does not match its byte range.");
    }
  }
  await writeResponseBody(response, partial, offset, total, deadline, controller);
}

/**
 * Only call after the Ed25519-signed update manifest and its trusted URL
 * have passed verification. Download and resume to a private .partial file;
 * no file is executable until its full SHA-256 matches the signed manifest.
 */
export async function fetchVerifiedInstaller(
  url: string,
  target: string,
  expectedSha256: string,
): Promise<string> {
  const digest = expectedSha256.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error("Invalid installer SHA-256.");
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  if (await matchesExpectedHash(target, digest)) return target;

  const partial = target + "." + digest.slice(0, 16) + ".partial";
  if (await matchesExpectedHash(partial, digest)) {
    await fs.promises.rm(target, { force: true });
    await fs.promises.rename(partial, target);
    return target;
  }

  const deadline = Date.now() + TOTAL_TIMEOUT_MS;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await downloadAttempt(url, partial, digest, deadline);
      if (await matchesExpectedHash(partial, digest)) {
        await fs.promises.rm(target, { force: true });
        await fs.promises.rename(partial, target);
        return target;
      }
      // The remote payload ended cleanly but did not match the signed digest.
      // No byte from this payload is trusted or preserved for the next attempt.
      await fs.promises.rm(partial, { force: true });
      lastError = new Error("Downloaded installer failed SHA-256 verification.");
    } catch (error) {
      lastError = error;
      if (Date.now() >= deadline) break;
      // Network failures retain partial bytes for an authenticated Range retry.
      // Every resumed payload is still checked against the signed full digest.
    }
    if (attempt < MAX_ATTEMPTS && Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** (attempt - 1), 8000)));
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError || "Unknown error");
  throw new Error("Installer download could not complete after automatic retries: " + detail);
}
