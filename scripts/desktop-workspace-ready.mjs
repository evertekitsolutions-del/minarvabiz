/** Renderer mount precedes asynchronous SQLite, trial and license hydration. */
export async function waitForDesktopWorkspace(readState, {
  timeoutMs = 30000,
  intervalMs = 250,
  now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  const deadline = now() + timeoutMs;
  while (true) {
    const state = await readState();
    if (state.rendererError) throw new Error(`Renderer startup error: ${state.text}`);
    if (state.rendererReady && state.hasContent && state.hasNavigation) return;
    if (now() >= deadline) {
      throw new Error(`Desktop workspace unavailable after ${timeoutMs}ms: ${JSON.stringify(state)}`);
    }
    await sleep(Math.min(intervalMs, deadline - now()));
  }
}

// Read DOM state only: never bypass licensing, inject app state or click while polling.
export const desktopWorkspaceSnapshot = `JSON.stringify((()=>{
  const visible = element => {
    if (!element || element.disabled) return false;
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  };
  return {
    rendererReady: document.documentElement.dataset.minarvaRendererReady === 'true',
    rendererError: document.documentElement.dataset.minarvaRendererError === 'true',
    hasContent: visible(document.querySelector('[data-testid="app-content"]')),
    hasNavigation: [...document.querySelectorAll('aside button, aside a, aside [role="button"]')].some(visible),
    text: (document.body?.innerText || '').slice(0, 1400)
  };
})())`;
