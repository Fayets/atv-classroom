"""Autoriza una sola vez a la cuenta de Google de ATV para que el classroom cree Docs. Se corre en la Mac:

    python3 scripts/google_docs_autorizar.py <client_id> <client_secret>

Abre el navegador, entrás con la cuenta de ATV y aceptás. Imprime las tres líneas para el .env del VPS."""

import sys
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer

import requests

PUERTO = 8765
REDIRECT = f"http://localhost:{PUERTO}"
ALCANCE = "https://www.googleapis.com/auth/drive.file"


class Vuelta(BaseHTTPRequestHandler):
    codigo = None

    def do_GET(self):
        Vuelta.codigo = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get("code", [None])[0]
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write("Listo, ya podés cerrar esta pestaña.".encode())

    def log_message(self, *_):
        pass


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    cliente, secreto = sys.argv[1:]
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id": cliente, "redirect_uri": REDIRECT, "response_type": "code", "scope": ALCANCE,
        "access_type": "offline", "prompt": "consent",
    })
    print("Abrí esto si no se abre solo:\n", url)
    webbrowser.open(url)
    servidor = HTTPServer(("localhost", PUERTO), Vuelta)
    while not Vuelta.codigo:
        servidor.handle_request()
    r = requests.post("https://oauth2.googleapis.com/token", data={
        "client_id": cliente, "client_secret": secreto, "code": Vuelta.codigo, "redirect_uri": REDIRECT, "grant_type": "authorization_code",
    }, timeout=20)
    r.raise_for_status()
    print(f"\nAgregá esto a /opt/atv-classroom/backend/.env:\n\nGOOGLE_DOCS_CLIENT_ID={cliente}\nGOOGLE_DOCS_CLIENT_SECRET={secreto}\nGOOGLE_DOCS_REFRESH_TOKEN={r.json()['refresh_token']}\n")


if __name__ == "__main__":
    main()
