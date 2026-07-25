import re
import uuid
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
UPLOADS_DIR = BACKEND_ROOT / "uploads"
RECURSOS_DIR = UPLOADS_DIR / "recursos"


def ensure_upload_dirs() -> None:
    RECURSOS_DIR.mkdir(parents=True, exist_ok=True)


def es_ruta_subida(url: str | None) -> bool:
    return bool(url and url.startswith("/uploads/"))


def ruta_publica(relative: str) -> str:
    return f"/uploads/{relative.lstrip('/')}"


def ruta_absoluta_desde_url(url: str) -> Path | None:
    if not es_ruta_subida(url):
        return None
    relative = url.removeprefix("/uploads/").lstrip("/")
    path = (UPLOADS_DIR / relative).resolve()
    if not str(path).startswith(str(RECURSOS_DIR.resolve())):
        return None
    return path


def eliminar_archivo_subido(url: str | None) -> None:
    path = ruta_absoluta_desde_url(url or "")
    if path is not None and path.is_file():
        path.unlink()


def _slugify(nombre: str) -> str:
    texto = nombre.lower().strip()
    texto = re.sub(r"[^\w\s-]", "", texto, flags=re.UNICODE)
    texto = re.sub(r"[\s_]+", "-", texto)
    return (texto[:80] or "documento").strip("-")


def guardar_pdf_clase(
    *,
    programa_slug: str,
    clase_id: int,
    contenido: bytes,
    titulo: str | None,
    nombre_original: str | None,
) -> tuple[str, str]:
    if not contenido.startswith(b"%PDF"):
        raise ValueError("El archivo debe ser un PDF válido.")

    slug_programa = programa_slug or "programa"
    destino = RECURSOS_DIR / slug_programa / str(clase_id)
    destino.mkdir(parents=True, exist_ok=True)

    base = _slugify(titulo or Path(nombre_original or "documento").stem)
    nombre_archivo = f"{base}.pdf"
    ruta = destino / nombre_archivo

    if ruta.exists():
        nombre_archivo = f"{base}-{uuid.uuid4().hex[:8]}.pdf"
        ruta = destino / nombre_archivo

    ruta.write_bytes(contenido)

    relative = f"recursos/{slug_programa}/{clase_id}/{nombre_archivo}"
    titulo_final = (titulo or Path(nombre_original or "Documento").stem).strip()
    return ruta_publica(relative), titulo_final
