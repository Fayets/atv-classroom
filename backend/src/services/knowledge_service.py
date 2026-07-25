import logging
import os
import re
from pathlib import Path

import psycopg2

logger = logging.getLogger(__name__)

_BACKEND_DIR = Path(__file__).resolve().parents[2]
_INDEX: list[dict] = []

CASE_STUDIES_MODULO = "10_case_studies"
MIN_MODULOS_EN_RESULTADO = 3

PRIORIDAD_MODULOS = {
    "02_advantage": 2.0,
    "03_business_foundations": 2.0,
    "04_marketing": 2.0,
    "05_sales": 2.0,
    "06_product": 2.0,
    "07_ads": 2.0,
    "08_creator_acquisition": 2.0,
    "09_systems": 2.0,
    "01_start_here": 1.5,
    "10_case_studies": 0.6,
}

MODULO_SLUG_OVERRIDES = {
    "10_case_studies": "case-of-study",
}


def _leer_env(nombre: str) -> str | None:
    valor = os.environ.get(nombre)
    if valor:
        return valor.strip()

    env_path = _BACKEND_DIR / ".env"
    if not env_path.is_file():
        return None

    for linea in env_path.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        clave, _, resto = linea.partition("=")
        if clave.strip() != nombre:
            continue
        return resto.strip().strip('"').strip("'")

    return None


def _modulo_a_slug(modulo: str) -> str:
    if modulo in MODULO_SLUG_OVERRIDES:
        return MODULO_SLUG_OVERRIDES[modulo]

    partes = modulo.split("_", 1)
    if len(partes) == 2 and partes[0].isdigit():
        return partes[1].replace("_", "-")

    return modulo.replace("_", "-")


def _normalizar(texto: str) -> str:
    return re.sub(r"[^a-z0-9]", "_", texto.lower().strip())


def _obtener_clase_ids() -> dict[str, tuple[int, int]]:
    try:
        schema = _leer_env("DB_SCHEMA") or "classroom"
        conn = psycopg2.connect(
            host=_leer_env("DB_HOST"),
            port=int(_leer_env("DB_PORT") or 5432),
            user=_leer_env("DB_USER"),
            password=_leer_env("DB_PASSWORD"),
            dbname=_leer_env("DB_NAME"),
            sslmode="require",
        )
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT c.id, c.titulo, p.id as programa_id
                FROM {schema}.clase c
                JOIN {schema}.seccion s ON c.seccion = s.id
                JOIN {schema}.programa p ON s.programa = p.id
                """
            )
            rows = cur.fetchall()
        conn.close()
        return {_normalizar(titulo): (id_, programa_id) for id_, titulo, programa_id in rows}
    except Exception as exc:
        logger.warning("No se pudieron cargar clase_ids: %s", exc)
        return {}


def _resolver_clase_id(
    clase_stem: str,
    clase_ids: dict[str, tuple[int, int]],
) -> tuple[int | None, int | None]:
    for clave in (_normalizar(_clase_stem_a_busqueda(clase_stem)), _normalizar(clase_stem)):
        resultado = clase_ids.get(clave)
        if resultado:
            return resultado
    return None, None


def _clase_stem_a_busqueda(clase_stem: str) -> str:
    partes = clase_stem.split("_", 1)
    if len(partes) == 2 and partes[0].isdigit():
        nombre = partes[1]
    else:
        nombre = clase_stem
    return nombre.replace("_", " ")


def _tokenizar(texto: str) -> list[str]:
    palabras = re.findall(r"\w+", texto.lower())
    return [p for p in palabras if len(p) >= 3]


def _fragmentar(contenido: str) -> list[str]:
    partes = [p.strip() for p in re.split(r"\n\s*\n", contenido) if p.strip()]
    return partes if partes else [contenido.strip()]


def _puntaje_fragmento(fragmento: str, palabras_clave: list[str]) -> int:
    if not palabras_clave:
        return 0

    texto = fragmento.lower()
    return sum(texto.count(palabra) for palabra in palabras_clave)


def _cargar_transcripts() -> list[dict]:
    base_path = _leer_env("KNOWLEDGE_BASE_PATH")
    if not base_path:
        logger.warning("KNOWLEDGE_BASE_PATH no configurado; knowledge base vacía")
        return []

    raiz = Path(base_path)
    if not raiz.is_dir():
        logger.warning("KNOWLEDGE_BASE_PATH no es un directorio válido: %s", raiz)
        return []

    indice: list[dict] = []
    clase_ids = _obtener_clase_ids()

    for archivo in sorted(raiz.rglob("*.txt")):
        if not archivo.is_file():
            continue

        modulo = archivo.parent.name
        clase = archivo.stem

        try:
            contenido = archivo.read_text(encoding="utf-8")
        except OSError as exc:
            logger.warning("No se pudo leer %s: %s", archivo, exc)
            continue

        clase_id, programa_id = _resolver_clase_id(clase, clase_ids)

        indice.append(
            {
                "modulo": modulo,
                "clase": clase,
                "contenido": contenido,
                "clase_id": clase_id,
                "programa_id": programa_id,
            }
        )

    return indice


def _multiplicador_modulo(modulo: str) -> float:
    return PRIORIDAD_MODULOS.get(modulo, 1.0)


def _clave_fragmento(item: dict) -> tuple[str, str, str]:
    return (item["modulo"], item["clase"], item["contenido"])


def _seleccionar_top_k(
    resultados: list[tuple[float, dict]],
    top_k: int,
) -> list[dict]:
    modulos = [
        (puntaje, item)
        for puntaje, item in resultados
        if item["modulo"] != CASE_STUDIES_MODULO and puntaje > 0
    ]

    seleccionados: list[dict] = []
    claves_usadas: set[tuple[str, str, str]] = set()

    if modulos:
        cuota_modulos = min(MIN_MODULOS_EN_RESULTADO, len(modulos), top_k)
        for _, item in modulos[:cuota_modulos]:
            clave = _clave_fragmento(item)
            if clave in claves_usadas:
                continue
            claves_usadas.add(clave)
            seleccionados.append(item)

    for _, item in resultados:
        if len(seleccionados) >= top_k:
            break
        clave = _clave_fragmento(item)
        if clave in claves_usadas:
            continue
        claves_usadas.add(clave)
        seleccionados.append(item)

    return seleccionados[:top_k]


def buscar(pregunta: str, top_k: int = 5) -> list[dict]:
    palabras_clave = _tokenizar(pregunta)
    if not palabras_clave or not _INDEX:
        return []

    resultados: list[tuple[float, dict]] = []

    for entrada in _INDEX:
        multiplicador = _multiplicador_modulo(entrada["modulo"])
        for fragmento in _fragmentar(entrada["contenido"]):
            puntaje_keywords = _puntaje_fragmento(fragmento, palabras_clave)
            if puntaje_keywords <= 0:
                continue

            puntaje_final = puntaje_keywords * multiplicador
            resultados.append(
                (
                    puntaje_final,
                    {
                        "modulo": entrada["modulo"],
                        "clase": entrada["clase"],
                        "contenido": fragmento,
                        "clase_id": entrada.get("clase_id"),
                        "programa_id": entrada.get("programa_id"),
                    },
                )
            )

    resultados.sort(key=lambda item: item[0], reverse=True)
    return _seleccionar_top_k(resultados, top_k)


_INDEX = _cargar_transcripts()
logger.info("Knowledge base cargada: %d archivos", len(_INDEX))
