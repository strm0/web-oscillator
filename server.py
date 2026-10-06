#!/usr/bin/env python3
"""Dev server for the scope: static files plus preset save/delete.

    python3 server.py [port]

Serves this folder on http://127.0.0.1:8000 like `python3 -m http.server`,
and additionally lets the page write presets into presets/:

    PUT    /presets/<id>.json   save a preset
    DELETE /presets/<id>.json   delete a preset

presets/index.json lists what is in the folder. It is rebuilt whenever it is
requested, so files added by hand or pulled from git show up on reload.
"""

import json
import os
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PRESET_DIR = os.path.join(ROOT, 'presets')
INDEX_PATH = os.path.join(PRESET_DIR, 'index.json')
PRESET_URL = re.compile(r'^/presets/([a-z0-9][a-z0-9_-]{0,63})\.json$')
MAX_BYTES = 1 << 20


def write_index():
    os.makedirs(PRESET_DIR, exist_ok=True)
    entries = []
    for filename in sorted(os.listdir(PRESET_DIR)):
        if not filename.endswith('.json') or filename == 'index.json':
            continue
        preset_id = filename[:-len('.json')]
        try:
            with open(os.path.join(PRESET_DIR, filename), encoding='utf-8') as f:
                name = json.load(f).get('name') or preset_id
        except (OSError, ValueError, AttributeError):
            continue  # unreadable or not a preset object; leave it out of the list
        entries.append({'id': preset_id, 'name': name})

    text = json.dumps(entries, indent=2, ensure_ascii=False) + '\n'
    try:
        with open(INDEX_PATH, encoding='utf-8') as f:
            if f.read() == text:
                return
    except OSError:
        pass
    with open(INDEX_PATH, 'w', encoding='utf-8') as f:
        f.write(text)


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # No caching, so edited modules and presets are always picked up.
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        if self.path.split('?')[0] == '/presets/index.json':
            write_index()
        super().do_GET()

    def do_PUT(self):
        path = self._preset_path()
        if not path:
            return
        try:
            length = int(self.headers.get('Content-Length', ''))
        except ValueError:
            return self._reply(411, 'Content-Length required')
        if length > MAX_BYTES:
            return self._reply(413, 'Preset too large')
        body = self.rfile.read(length)
        try:
            if not isinstance(json.loads(body.decode('utf-8')), dict):
                raise ValueError
        except ValueError:
            return self._reply(400, 'Body must be a JSON object')

        os.makedirs(PRESET_DIR, exist_ok=True)
        with open(path, 'wb') as f:
            f.write(body)
        write_index()
        self._reply(200, 'saved')

    def do_DELETE(self):
        path = self._preset_path()
        if not path:
            return
        try:
            os.remove(path)
        except FileNotFoundError:
            pass
        write_index()
        self._reply(200, 'deleted')

    def _preset_path(self):
        match = PRESET_URL.match(self.path)
        if not match or match.group(1) == 'index':
            self._reply(403, 'Only presets/<id>.json can be written')
            return None
        return os.path.join(PRESET_DIR, match.group(1) + '.json')

    def _reply(self, status, message):
        body = (message + '\n').encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(('127.0.0.1', port), partial(Handler, directory=ROOT))
    print(f'Scope running at http://localhost:{port}  (Ctrl+C to stop)')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
