/**
 * Desktop database bootstrap — file-json via localStorage in renderer,
 * or inject FileIO from preload for userData path persistence.
 */

import { createDatabase, type UnitOfWork } from "@minarvabiz/database";

let dbPromise: Promise<UnitOfWork> | null = null;

export function getDesktopDb(): Promise<UnitOfWork> {
  if (!dbPromise) {
    dbPromise = createDatabase({ edition: "offline" });
  }
  return dbPromise;
}
