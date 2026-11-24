# 開發用：不讓瀏覽器快取的靜態伺服器（改了 js 重新整理就生效）。用法：python tools/nocache_server.py 5196
import http.server, sys, functools, os
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
port = int(sys.argv[1]) if len(sys.argv) > 1 else 5196
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(H, directory=root)).serve_forever()
