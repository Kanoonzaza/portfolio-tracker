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
const VERSION='ptv3-sw-2026-05-24';
const SHELL_CACHE='shell-'+VERSION;
const SHELL_URLS=[
  './portfolio-tracker.html',
  './manifest.json',
];

self.addEventListener('install', event=>{
  // No automatic skipWaiting — the page shows an "Update available" banner
  // and posts {type:'SKIP_WAITING'} only when the user opts in. This avoids
  // the controllerchange/reload race that broke Android.
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache=>cache.addAll(SHELL_URLS).catch(()=>{}))
  );
});

// Activated only after the user taps the update banner (or on first install,
// since first install has no existing controller to wait on).
self.addEventListener('message', event=>{
  if(event.data && event.data.type==='SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k!==SHELL_CACHE).map(k=>caches.delete(k))
    )).then(()=>self.clients.claim())
  );
});

// Bring the app to the foreground when the user clicks a price-alert /
// EMA-cross notification. Focuses an existing tab if one is open, else
// opens a fresh one at the app shell.
self.addEventListener('notificationclick', event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const all=await self.clients.matchAll({type:'window', includeUncontrolled:true});
    for(const c of all){
      if('focus' in c) return c.focus();
    }
    if(self.clients.openWindow){
      return self.clients.openWindow('./portfolio-tracker.html');
    }
  })());
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
