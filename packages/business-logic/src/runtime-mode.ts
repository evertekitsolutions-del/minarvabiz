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
      : "development");
  if (env === "demo") return "demo";
  if (env === "production") return "production";
  // Browser: check localStorage flag
  if (typeof window !== "undefined") {
    try {
      const m = window.localStorage.getItem("minarva_mode");
      if (m === "demo" || m === "production" || m === "development") return m;
    } catch {
      /* */
    }
  }
  return env as RuntimeMode;
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

/** Allow seed only in explicit demo mode */
export function allowDemoSeed(): boolean {
  // Seed only for explicit demo or local development — never production
  return mode === "demo" || mode === "development";
}
