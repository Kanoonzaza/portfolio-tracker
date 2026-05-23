#!/usr/bin/env python3
"""
Portfolio Tracker local server with built-in CORS-bypass proxy.

Two endpoints:
  /                     → serves static files from this directory (like python -m http.server)
  /proxy?url=<encoded>  → fetches the URL server-side and returns the response
                          with permissive CORS headers, so the browser can read it.

This solves the "live prices fail" problem permanently:
  - Browser → http://localhost:8000/proxy?url=...   (no CORS issue, same origin)
  - Server  → https://query1.finance.yahoo.com/...  (no CORS issue, server-to-server)

Usage:  python local-server.py [port]
        (default port is 8000)
"""

import http.server
import socketserver
import urllib.parse
import urllib.request
import urllib.error
import sys
import os
import gzip
import io


PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

# Always serve files from the directory this script lives in, regardless of
# where it was launched from. This way the .bat file works even if Python's
# default cwd is something weird.
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class CORSProxyHandler(http.server.SimpleHTTPRequestHandler):

    def do_GET(self):
        if self.path.startswith('/proxy?') or self.path.startswith('/proxy/'):
            self._handle_proxy()
            return
        # Otherwise serve as static file
        super().do_GET()

    def do_OPTIONS(self):
        # CORS preflight
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Max-Age', '86400')
        self.end_headers()

    def end_headers(self):
        # Add CORS header to every response (static files included)
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def _handle_proxy(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        url = params.get('url', [None])[0]
        if not url:
            self._send_proxy_error(400, "Missing 'url' query parameter")
            return

        # Basic safety: only allow http/https
        if not (url.startswith('http://') or url.startswith('https://')):
            self._send_proxy_error(400, "URL must start with http:// or https://")
            return

        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                              'AppleWebKit/537.36 (KHTML, like Gecko) '
                              'Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate',
            })
            with urllib.request.urlopen(req, timeout=12) as resp:
                body = resp.read()
                # Handle gzipped responses (Yahoo sometimes returns gzip)
                if resp.headers.get('Content-Encoding') == 'gzip':
                    body = gzip.decompress(body)
                content_type = resp.headers.get('Content-Type', 'application/octet-stream')
                # Strip charset for cleanness
                self._send_proxy_response(200, body, content_type)

        except urllib.error.HTTPError as e:
            try:
                body = e.read()
            except Exception:
                body = str(e).encode()
            self._send_proxy_response(e.code, body, 'text/plain')

        except urllib.error.URLError as e:
            self._send_proxy_error(502, f"Upstream connection failed: {e.reason}")

        except Exception as e:
            self._send_proxy_error(502, f"Proxy error: {type(e).__name__}: {e}")

    def _send_proxy_response(self, status, body, content_type):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        # CORS header is added automatically by end_headers()
        self.end_headers()
        self.wfile.write(body)

    def _send_proxy_error(self, status, message):
        body = message.encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        # Less noisy logging — only show requests, not boilerplate
        sys.stderr.write(f"  {self.command} {self.path[:100]}{'…' if len(self.path)>100 else ''}\n")


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    """Multi-threaded TCP server so the browser's parallel requests don't queue.
    Without this, the default single-threaded TCPServer processes ONE request at
    a time — and since browsers fire many price/news fetches in parallel, that
    made the whole pipeline ~Nx slower than necessary."""
    daemon_threads = True
    allow_reuse_address = True


def main():
    try:
        with ThreadedTCPServer(("", PORT), CORSProxyHandler) as httpd:
            print()
            print("=" * 60)
            print(f"  Portfolio Tracker server running")
            print("=" * 60)
            print()
            print(f"  Open in browser:  http://localhost:{PORT}/portfolio-tracker.html")
            print()
            print(f"  Proxy endpoint:   http://localhost:{PORT}/proxy?url=<encoded-url>")
            print(f"  CORS:             Enabled for all origins")
            print()
            print(f"  Press Ctrl+C to stop")
            print("=" * 60)
            print()
            httpd.serve_forever()
    except OSError as e:
        if e.errno == 10048 or 'in use' in str(e).lower():
            print(f"ERROR: Port {PORT} is already in use.")
            print(f"Either close the other server, or pass a different port: python local-server.py 8001")
        else:
            raise
    except KeyboardInterrupt:
        print("\nServer stopped.")


if __name__ == '__main__':
    main()
