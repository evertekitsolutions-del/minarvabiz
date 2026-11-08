import { persistDomainToSqlite } from "./sqlite-bootstrap";

type Refresh = () => void;
type ReportError = (message: string) => void;

export function createDesktopPersistence(refreshAll: Refresh, reportError: ReportError) {
  const persist = async (context: string): Promise<boolean> => {
    refreshAll();
    try {
      if (!await persistDomainToSqlite()) throw new Error("The native SQLite write was rejected");
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      reportError(`SQLite ${context} save failed. Keep Minarva Biz open and retry: ${detail}`);
      console.error(`[minarvabiz] SQLite ${context} save failed`, error);
      return false;
    }
  };
  return {
    persistAndRefresh: (): Promise<boolean> => persist("domain"),
    persistCustomerCollection: (): Promise<boolean> => persist("customer payment"),
  };
}
