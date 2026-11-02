"""Capturas del Loom en el diagnóstico de cuello de botella (Franco, 02-11-2026): que se vea real.

Jeremy marca, debajo de lo que se habla o se prueba, una línea "[captura 03:12]" con el minuto del Loom del cliente.
El texto guarda solo esa marca; la imagen la saca el servidor del video (Loom entrega el MP4 público) y queda en
uploads/cuellos. Se piden por una dirección con el token del diagnóstico, así la hoja y el PDF las cargan sin sesión.
"""

import logging
import re
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path

import httpx

from src.storage.recursos import UPLOADS_DIR

logger = logging.getLogger(__name__)

CAPTURAS_DIR = UPLOADS_DIR / "cuellos"
MARCA = re.compile(r"^\s*\[captura\s+(\d{1,3}):(\d{2})\]\s*$", re.IGNORECASE)
TOPE_POR_DOCUMENTO = 8
_candados: dict[str, threading.Lock] = {}
_candado_general = threading.Lock()


def segundos(linea: str) -> int | None:
    m = MARCA.match(linea or "")
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None


def marcas(texto: str) -> list[int]:
    """Los minutos marcados en el documento, en orden y sin repetir."""
    vistos: list[int] = []
    for linea in (texto or "").splitlines():
        s = segundos(linea)
        if s is not None and s not in vistos:
            vistos.append(s)
    return vistos[:TOPE_POR_DOCUMENTO]


def sin_marcas(texto: str) -> str:
    """El texto sin las líneas de captura: para medir a Jeremy y al cerebro contra Juan, una foto no es redacción."""
    return "\n".join(l for l in (texto or "").splitlines() if segundos(l) is None)


def _ffmpeg() -> str:
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001 — en la Mac alcanza con el de Homebrew
        return shutil.which("ffmpeg") or "ffmpeg"


def url_video(id_loom: str) -> str:
    r = httpx.post(f"https://www.loom.com/api/campaigns/sessions/{id_loom}/transcoded-url", json={}, timeout=20)
    r.raise_for_status()
    url = (r.json() or {}).get("url")
    if not url:
        raise ValueError("Loom no devolvió el video.")
    return url


def _cuadro(video: str, segundo: float, destino: Path) -> int:
    subprocess.run([_ffmpeg(), "-loglevel", "error", "-y", "-ss", f"{max(segundo, 0):.1f}", "-i", video, "-frames:v", "1",
                    "-vf", "scale=1280:-2", "-q:v", "4", str(destino)], check=True, timeout=60, capture_output=True)
    return destino.stat().st_size if destino.exists() else 0


def sacar(id_loom: str, token: str, segundo: int, video: str | None = None) -> Path:
    """El cuadro de ese minuto. Saca tres alrededor y se queda con el de más detalle: un cuadro con la página todavía
    cargando o en blanco pesa mucho menos que uno con contenido."""
    destino = CAPTURAS_DIR / f"{token}-{segundo}.jpg"
    if destino.exists():
        return destino
    with _candado_general:
        candado = _candados.setdefault(destino.name, threading.Lock())
    with candado:
        if destino.exists():
            return destino
        CAPTURAS_DIR.mkdir(parents=True, exist_ok=True)
        video = video or url_video(id_loom)
        with tempfile.TemporaryDirectory() as tmp:
            mejor, peso = None, -1
            for i, s in enumerate((segundo, segundo - 1.5, segundo + 2)):
                p = Path(tmp) / f"{i}.jpg"
                try:
                    tam = _cuadro(video, s, p)
                except Exception:  # noqa: BLE001 — si un cuadro falla, valen los otros
                    continue
                if tam > peso:
                    mejor, peso = p, tam
            if mejor is None:
                raise ValueError("No se pudo sacar la captura del Loom.")
            shutil.move(str(mejor), destino)
    return destino


def preparar(id_loom: str | None, token: str, texto: str) -> None:
    """Saca de antemano las capturas que marcó Jeremy, así la hoja abre con las imágenes listas."""
    if not id_loom:
        return
    try:
        video = None
        for s in marcas(texto):
            if not (CAPTURAS_DIR / f"{token}-{s}.jpg").exists():
                video = video or url_video(id_loom)
                sacar(id_loom, token, s, video)
    except Exception:  # noqa: BLE001 — la hoja las vuelve a pedir al abrir
        logger.exception("Cuello %s: no se pudieron preparar las capturas", token[:6])
