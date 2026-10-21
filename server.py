"""
server.py — Isomer local server
Serves the app with COOP + COEP headers required for SharedArrayBuffer
(needed by multi-threaded FFmpeg.wasm).

Usage:  python server.py
        python server.py 3000   (custom port)
"""
import sys
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
ROOT = os.path.dirname(os.path.abspath(__file__))


class COEPHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # Required for SharedArrayBuffer (FFmpeg.wasm multi-threaded core)
        self.send_header("Cross-Origin-Opener-Policy",  "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Suppress noisy request logs; only print errors
        if args and len(args) >= 2 and not str(args[1]).startswith("2"):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    os.chdir(ROOT)
    httpd = HTTPServer(("", PORT), COEPHandler)
    print("  ╚══════════════════════════════════════╝")
    print(f"\n  Isomer server running at http://localhost:{PORT}")
    print("  COOP / COEP headers enabled. (SharedArrayBuffer: available)")
    print("  Press Ctrl+C to stop.\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server stopped.")
