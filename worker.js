/**
 * Portfolio Tracker — Cloudflare Worker CORS-bypass proxy.
 *
 * Mirrors the local Python proxy at /proxy?url=<encoded-target>. Forwards the
 * request to the target server with a realistic User-Agent, returns the body
 * with permissive CORS headers so the browser-side React app can read it.
 *
 * Deploy:
 *   npx wrangler deploy worker.js --name portfolio-proxy
 * Or paste into the Cloudflare dashboard (Workers & Pages → Create → paste code).
 *
 * After deploy, update PROXY_BASE in portfolio-tracker.html with the resulting
 * URL (e.g. https://portfolio-proxy.<your-subdomain>.workers.dev).
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

function corsResponse(body, init = {}) {
  const headers = new Headers(init.headers || {});
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(body, { ...init, headers });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'GET') {
      return corsResponse('Method not allowed', { status: 405 });
    }

    if (url.pathname !== '/proxy' && url.pathname !== '/proxy/') {
      return corsResponse(
        'Portfolio Tracker proxy — usage: /proxy?url=<encoded-target>',
        { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
      );
    }

    const target = url.searchParams.get('url');
    if (!target) {
      return corsResponse("Missing 'url' query parameter", { status: 400 });
    }
    if (!/^https?:\/\//i.test(target)) {
      return corsResponse('URL must start with http:// or https://', { status: 400 });
    }

    try {
      const upstream = await fetch(target, {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
            'AppleWebKit/537.36 (KHTML, like Gecko) ' +
            'Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        cf: { cacheTtl: 0, cacheEverything: false },
      });

      const body = await upstream.arrayBuffer();
      const contentType = upstream.headers.get('Content-Type') || 'application/octet-stream';
      return corsResponse(body, {
        status: upstream.status,
        headers: { 'Content-Type': contentType },
      });
    } catch (e) {
      return corsResponse(`Proxy error: ${e && e.message ? e.message : String(e)}`, {
        status: 502,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  },
};
