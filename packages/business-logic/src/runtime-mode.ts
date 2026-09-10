/**
 * Runtime mode — production never uses silent demo seed.
 */

export type RuntimeMode = "production" | "demo" | "development";

function readMode(): RuntimeMode {
  const env =
    (typeof process !== "undefined" && process.env?.MINARVA_MODE) ||
    (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_MINARVA_MODE) ||
    (typeof process !== "undefined" && process.env?.NODE_ENV === "production"
      ? "production"
      : undefined);

  if (env === "demo") return "demo";
  if (env === "production") return "production";

  // Browser/Electron renderer defaults to production unless demo/development is explicit.
  // This prevents module initialization from silently seeding demo data before the app
  // finishes its authenticated SQLite bootstrap.
  if (typeof window !== "undefined") {
    try {
      const m = window.localStorage.getItem("minarva_mode");
      if (m === "demo" || m === "production" || m === "development") return m;
    } catch {
      /* */
    }
    return "production";
  }

  return "development";
}

let mode: RuntimeMode = readMode();

export function getRuntimeMode(): RuntimeMode {
  return mode;
}

export function setRuntimeMode(m: RuntimeMode) {
  mode = m;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem("minarva_mode", m);
    } catch {
      /* */
    }
  }
}

export function isDemoMode(): boolean {
  return mode === "demo";
}

export function isProductionMode(): boolean {
  return mode === "production";
}

/** Allow seed only in explicit demo/development mode */
export function allowDemoSeed(): boolean {
  return mode === "demo" || mode === "development";
}
