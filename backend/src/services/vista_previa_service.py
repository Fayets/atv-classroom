"""Vista previa de los links de Fathom en el chat, como la tarjeta de Discord.

El reproductor de Fathom pesa varios MB y en el chat nadie lo mira ahí: alcanza con el título,
quiénes estuvieron y la portada, que llevan a la grabación. Fathom no deja leer su página desde
el navegador (no manda CORS), así que la lee el servidor, una vez por link.
"""

import html
import re
import time

import httpx
from fastapi import HTTPException

FATHOM = re.compile(r"^https://(?:www\.)?fathom\.video/(?:share|embed)/([\w-]+)")
META = re.compile(r'<meta\s+property="og:(title|description)"\s+content="([^"]*)"', re.I)
DURA = 24 * 3600
MAX_GUARDADAS = 500

_guardadas: dict[str, tuple[float, dict]] = {}


class VistaPreviaServices:
    def fathom(self, url: str) -> dict:
        m = FATHOM.match((url or "").strip())
        if not m:
            raise HTTPException(status_code=400, detail="Solo hay vista previa de links de Fathom.")
        share = f"https://fathom.video/share/{m.group(1)}"
        guardada = _guardadas.get(share)
        if guardada and time.time() - guardada[0] < DURA:
            return guardada[1]

        datos = {"url": share, "titulo": None, "descripcion": None, "imagen": f"{share}/thumbnail"}
        try:
            # Con el agente de Discord Fathom devuelve la página con sus etiquetas og:, sin la app.
            r = httpx.get(share, timeout=5, follow_redirects=True,
                          headers={"User-Agent": "Mozilla/5.0 (compatible; Discordbot/2.0)"})
            if r.status_code == 200:
                for campo, valor in META.findall(r.text):
                    datos["titulo" if campo.lower() == "title" else "descripcion"] = html.unescape(valor).strip() or None
        except httpx.HTTPError:
            # Sin título igual se muestra la tarjeta con el link: no se guarda, se reintenta.
            return datos

        if len(_guardadas) >= MAX_GUARDADAS:
            _guardadas.clear()
        _guardadas[share] = (time.time(), datos)
        return datos
