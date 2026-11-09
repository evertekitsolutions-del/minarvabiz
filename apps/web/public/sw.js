/* Minarva Biz ONLINE-ONLY PWA.
 * A service worker enables standalone mobile installation. Business data,
 * authentication tokens, POST bodies and HTML are never cached by this worker.
 * Network behavior is deliberately left to the browser; offline mode is unsupported.
 */
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });
// A fetch listener is required by some PWA installability checks.
// It never calls respondWith or CacheStorage: requests remain network-first.
self.addEventListener("fetch", () => {});
