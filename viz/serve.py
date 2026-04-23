"""Tiny HTTP server for the viz.

d3.json() uses fetch(), which many browsers refuse to run against a
file:// URL for security reasons. Use this to serve the viz over
http://127.0.0.1:PORT/dag.html instead.

    python viz/serve.py            # default port 8765
    python viz/serve.py 9000       # custom port
"""
from __future__ import annotations

import http.server
import socketserver
import sys
from pathlib import Path


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    viz_dir = Path(__file__).parent

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(viz_dir), **kwargs)

    with socketserver.TCPServer(("127.0.0.1", port), Handler) as httpd:
        print(f"serving {viz_dir} at http://127.0.0.1:{port}/dag.html")
        print("Ctrl-C to stop")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
