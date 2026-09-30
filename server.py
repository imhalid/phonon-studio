#!/usr/bin/env python3
"""Lightweight Web UI and API Proxy Server for Phonon Speech Recognition.
Standard library only (no external dependencies required).
"""

import http.server
import json
import os
import socketserver
import sys
import urllib.error
import urllib.request
from pathlib import Path

UI_DIR = Path(__file__).resolve().parent
PHONON_BACKEND_URL = os.environ.get("PHONON_BACKEND_URL", "http://127.0.0.1:8000")
PHONON_API_KEY = os.environ.get("PHONON_API_KEY", "phonon-local")
PORT = int(os.environ.get("PORT", "3000"))


class PhononStudioHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(UI_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/health":
            self._handle_health()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == "/api/transcribe":
            self._handle_transcribe()
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'{"error": "Not found"}')

    def _handle_health(self):
        target_url = f"{PHONON_BACKEND_URL}/health"
        try:
            req = urllib.request.Request(
                target_url,
                headers={
                    "User-Agent": "Phonon-Studio",
                    "Authorization": f"Bearer {PHONON_API_KEY}"
                }
            )
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = resp.read()
                self.send_response(resp.status)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(data)
        except Exception as e:
            self.send_response(503)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            payload = json.dumps({
                "status": "unavailable",
                "backend_url": PHONON_BACKEND_URL,
                "error": str(e)
            }).encode("utf-8")
            self.wfile.write(payload)

    def _handle_transcribe(self):
        content_type = self.headers.get("Content-Type", "")
        content_length = int(self.headers.get("Content-Length", 0))

        if content_length <= 0:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error": "Empty body"}')
            return

        body = self.rfile.read(content_length)
        target_url = f"{PHONON_BACKEND_URL}/v1/audio/transcriptions"

        try:
            req = urllib.request.Request(
                target_url,
                data=body,
                headers={
                    "Content-Type": content_type,
                    "User-Agent": "Phonon-Studio",
                    "Authorization": f"Bearer {PHONON_API_KEY}"
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                resp_data = resp.read()
                self.send_response(resp.status)
                self.send_header("Content-Type", resp.headers.get("Content-Type", "application/json"))
                self.end_headers()
                self.wfile.write(resp_data)
        except urllib.error.HTTPError as err:
            err_body = err.read()
            self.send_response(err.code)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(err_body)
        except Exception as err:
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            payload = json.dumps({"error": f"Phonon backend error: {err}"}).encode("utf-8")
            self.wfile.write(payload)


def run():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("0.0.0.0", PORT), PhononStudioHandler) as httpd:
        print(f"[*] Phonon Studio Web UI running at http://localhost:{PORT}")
        print(f"[*] Proxying transcription requests to {PHONON_BACKEND_URL}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")


if __name__ == "__main__":
    run()
