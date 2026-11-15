/*
 * FlowZone service worker: the core only.
 *
 *   - App pages: network first, with the last good copy as the offline fallback.
 *   - Built assets (/_next/static, icons): cache first. Their names change with every build.
 *   - /api/*: never touched here. Data is read and written by the app, which keeps its own
 *     offline copy (the capture queue and the Today snapshot, in IndexedDB).
 *   - Push and notification behaviour: NOT in this file. Modules listed in
 *     /sw/modules/index.js add their own listeners. See docs/contracts/design-system.md
 *     (extension point "service-worker-push-module").
 *
 * Classic script (no imports or exports), so it works on every browser that supports
 * service workers, including Chrome on iPhone.
 */

const VERSION = "v1";
const STATIC_CACHE = `flowzone-static-${VERSION}`;
const PAGE_CACHE = `flowzone-pages-${VERSION}`;
const OWN_CACHES = [STATIC_CACHE, PAGE_CACHE];
/** How long a page request may take before the saved copy is shown instead. */
const NETWORK_TIMEOUT_MS = 3000;

// Push-handler and other modules. Must run at the top level, during script evaluation.
importScripts("/sw/modules/index.js");

const OFFLINE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offline · FlowZone</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 24px 16px;
    background: #edf2ee; color: #17292b; font: 17px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 26rem; display: grid; gap: 14px; }
  h1 { font: 500 1.75rem/1.2 Georgia, serif; margin: 0; color: #1f6266; }
  a { color: #1f6266; font-weight: 700; }
  @media (prefers-color-scheme: dark) {
    body { background: #0f1a1c; color: #e3ece8; }
    h1, a { color: #7fc4c1; }
  }
</style>
</head>
<body>
<main>
  <h1>You're offline for now.</h1>
  <p>Anything you add will wait on this device and arrive once you're back online. Pages you opened before still work.</p>
  <p><a href="/today">Go to Today</a></p>
</main>
</body>
</html>`;

self.addEventListener("install", () => {
  // Take over quickly, so a new build is not stuck behind an old worker.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("flowzone-") && !OWN_CACHES.includes(name))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

// The app asks for this when someone signs out, so the next person on the device sees nothing.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "FLOWZONE_CLEAR_PAGES") {
    event.waitUntil(caches.delete(PAGE_CACHE));
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirstPage(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    // Only keep plain successful pages. Redirects (for example to sign-in) are never saved.
    if (response.ok && !response.redirected) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const saved = await cache.match(request);
    if (saved) return saved;
    return new Response(OFFLINE_HTML, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
