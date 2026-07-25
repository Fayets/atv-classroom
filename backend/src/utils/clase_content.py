from src.models import ClaseRecurso
from src.storage.recursos import es_ruta_subida, eliminar_archivo_subido


def _tipo_recurso(url: str) -> str:
    if es_ruta_subida(url) or url.lower().endswith(".pdf"):
        return "pdf"
    return "link"


def serializar_recursos(clase) -> list[dict]:
    recursos = sorted(list(clase.recursos), key=lambda recurso: recurso.orden)
    return [
        {
            "id": recurso.id,
            "titulo": recurso.titulo,
            "url": recurso.url,
            "orden": recurso.orden,
            "tipo": _tipo_recurso(recurso.url),
        }
        for recurso in recursos
    ]


def sincronizar_recursos(clase, recursos_data: list[dict] | None) -> None:
    if recursos_data is None:
        return

    urls_viejas = {
        recurso.url for recurso in clase.recursos if es_ruta_subida(recurso.url)
    }

    for recurso in list(clase.recursos):
        recurso.delete()

    urls_nuevas: set[str] = set()
    for indice, item in enumerate(recursos_data):
        if not isinstance(item, dict):
            item = dict(item)
        titulo = (item.get("titulo") or "").strip()
        url = (item.get("url") or "").strip()
        if not titulo or not url:
            continue
        if not url.startswith(("http://", "https://", "/uploads/")):
            url = f"https://{url}"
        ClaseRecurso(
            clase=clase,
            titulo=titulo,
            url=url,
            orden=item.get("orden", indice),
        )
        if es_ruta_subida(url):
            urls_nuevas.add(url)

    for url in urls_viejas - urls_nuevas:
        eliminar_archivo_subido(url)
