/** Confirm attendance disk writes while retaining the existing autosave recovery path. */
export async function persistAttendanceChange(
  refresh: () => void,
  persist: () => Promise<boolean>,
  retry: (delay: number) => void,
): Promise<void> {
  refresh();
  try {
    if (!await persist()) throw new Error("Attendance changes are not yet saved to SQLite. Keep the app open and retry.");
  } catch (error) {
    retry(250);
    throw error;
  }
}

/** Existing general business save behavior; attendance uses the stricter helper above. */
export async function persistBusinessChange(refresh:()=>void,persist:()=>Promise<boolean>,retry:(delay:number)=>void):Promise<void> {
  refresh();
  try { if (!await persist()) retry(250); }
  catch { retry(250); }
}

export function createPersistenceHandlers(refresh:()=>void,persist:()=>Promise<boolean>,retry:(delay:number)=>void) {
  return {
    persistAndRefresh:()=>persistBusinessChange(refresh,persist,retry),
    persistAttendanceAndRefresh:()=>persistAttendanceChange(refresh,persist,retry),
  };
}
