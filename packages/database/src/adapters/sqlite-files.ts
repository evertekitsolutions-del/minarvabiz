/** Node-only SQLite file backup helpers. Keep out of the shared/browser entrypoint. */

export function backupSqliteFile(sourcePath: string, destinationPath: string): boolean {
  const fs = require("fs") as typeof import("fs");
  try {
    fs.mkdirSync(require("path").dirname(destinationPath), { recursive: true });
    fs.copyFileSync(sourcePath, destinationPath);
    return true;
  } catch {
    return false;
  }
}

export function restoreSqliteFile(sourcePath: string, destinationPath: string): boolean {
  const fs = require("fs") as typeof import("fs");
  try {
    fs.mkdirSync(require("path").dirname(destinationPath), { recursive: true });
    fs.copyFileSync(sourcePath, destinationPath);
    return true;
  } catch {
    return false;
  }
}
