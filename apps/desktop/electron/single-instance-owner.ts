/**
 * OFFLINE-NATIVE-03: prevent two cooperating Electron main processes from
 * opening the same Windows customer SQLite database under one userData scope.
 *
 * This is a process-ownership fence, not an OS file lock against other apps,
 * hostile processes, another profile directory, or network-share writers.
 */
export interface FocusableWindow {
  isDestroyed(): boolean;
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
}

/**
 * Must run BEFORE app.whenReady() and before creating any BrowserWindow.
 * A second process cannot reach any customer DB bootstrapping path.
 */
export function claimPrimaryDesktopInstance(
  requestLock: () => boolean,
  quit: () => void,
  onSecondInstance: (callback: () => void) => void,
  windows: () => readonly FocusableWindow[],
): boolean {
  let ownsLock = false;
  try {
    ownsLock = requestLock() === true;
  } catch {
    // Failing to determine ownership must never start a second SQLite writer.
    ownsLock = false;
  }
  if (!ownsLock) {
    quit();
    return false;
  }
  onSecondInstance(() => {
    // The second Electron process is asked to quit by Electron itself.
    // Only the owner may foreground the existing customer application window.
    try {
      const live = windows().find(win => !win.isDestroyed());
      if (!live) return; // Main process may still be starting.
      if (live.isMinimized()) live.restore();
      live.show();
      live.focus();
    } catch {
      // Window activation failure cannot give a new process DB ownership.
    }
  });
  return true;
}
