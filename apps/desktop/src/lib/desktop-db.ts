/**
 * Desktop primary database — SQLite file under userData.
 * All business operations go through this UoW in production desktop mode.
 */

import type { UnitOfWork } from "@minarvabiz/database";
import {
  openSqliteDatabase,
  createSqliteUnitOfWork,
  nodeFileIO,
  type SqliteDatabase,
} from "@minarvabiz/database/adapters/sqlite";
import { backupSqliteFile, restoreSqliteFile } from "@minarvabiz/database/adapters/sqlite-files";

let sqlite: SqliteDatabase | null = null;
let uow: UnitOfWork | null = null;

export async function initDesktopDb(dbPath: string): Promise<UnitOfWork> {
  sqlite = await openSqliteDatabase(dbPath, nodeFileIO());
  uow = createSqliteUnitOfWork(sqlite);
  return uow;
}

export function getDesktopUow(): UnitOfWork {
  if (!uow) throw new Error("Desktop DB not initialized — call initDesktopDb first");
  return uow;
}

export function getSqlitePath(): string | null {
  return sqlite?.path ?? null;
}

export function backupDesktopDb(destPath: string): boolean {
  if (!sqlite) return false;
  sqlite.save();
  return backupSqliteFile(sqlite.path, destPath);
}

export function restoreDesktopDb(backupPath: string, dbPath: string): boolean {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    uow = null;
  }
  return restoreSqliteFile(backupPath, dbPath);
}

export async function reopenAfterRestore(dbPath: string): Promise<UnitOfWork> {
  return initDesktopDb(dbPath);
}
