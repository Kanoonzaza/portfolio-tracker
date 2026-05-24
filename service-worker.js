/* Portfolio Tracker — Service Worker
 *
 * Cache strategy:
 *   - App shell (HTML, manifest): network-first with cache fallback.
 *     Lets the user open the app offline against last-loaded version.
 *   - Yahoo / Stooq price + news requests: pass-through (network-only).
 *     We don't cache live market data — stale prices are misleading.
 *   - Firebase / Google APIs: pass-through (auth + Firestore handle their own caching).
 *
 * On version bump, the old cache is purged in 'activate'.
 */
const VERSION='ptv3-sw-2026-05-24-news-feed';
const SHELL_CACHE='shell-'+VERSION;
const SHELL_URLS=[
  './portfolio-tracker.html',
  './manifest.json',
];

self.addEventListener('install', event=>{
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache=>cache.addAll(SHELL_URLS).catch(()=>{}))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate', event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k!==SHELL_CACHE).map(k=>caches.delete(k))
    )).then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch', event=>{
  const url=new URL(event.request.url);

  // Only handle GET
  if(event.request.method!=='GET') return;

  // Skip cross-origin (Yahoo, Firebase, etc.) — these are live data
  if(url.origin!==self.location.origin) return;

  // Skip the local CORS proxy endpoint — also live data
  if(url.pathname.startsWith('/proxy')) return;

  // Network-first for shell files; fall back to cache on failure
  event.respondWith(
    fetch(event.request).then(response=>{
      // Only cache OK + basic responses
      if(response && response.status===200 && response.type==='basic'){
        const clone=response.clone();
        caches.open(SHELL_CACHE).then(cache=>cache.put(event.request, clone));
      }
      return response;
    }).catch(()=>caches.match(event.request).then(r=>r||new Response('Offline', {status:503})))
  );
});
