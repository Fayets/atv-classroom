import logging
import os
import re
import unicodedata
from collections import Counter
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

_DEFAULT_TOP_K = 3

_RE_TIMESTAMP = re.compile(
    r"^[\[\(]?\d{1,2}:\d{2}(:\d{2})?(?:[.,]\d+)?[\]\)]?\s*",
    re.IGNORECASE,
)
_RE_SOLO_TIMESTAMP = re.compile(
    r"^[\[\(]?\d{1,2}:\d{2}(:\d{2})?(?:[.,]\d+)?[\]\)]?\s*$",
    re.IGNORECASE,
)
_RE_MULETILLA = re.compile(
    r"^(?:um+|uh+|eh+|ah+|mm+|hmm+|ehm+|em+)\.?$",
    re.IGNORECASE,
)
_RE_SILENCIO = re.compile(
    r"^\[?(?:silencio|silence|music|música|musica|aplausos|risas)\]?\.?$",
    re.IGNORECASE,
)

# Términos del dominio ATV — no filtrar aunque sean cortos o parezcan comunes
_DOMAIN_TERMS = frozenset(
    {
        "ads",
        "ad",
        "bofu",
        "call",
        "cierre",
        "closer",
        "dm",
        "dms",
        "embudo",
        "icp",
        "lead",
        "leads",
        "meta",
        "mofu",
        "oferta",
        "reel",
        "reels",
        "roi",
        "sales",
        "sop",
        "tofu",
        "venta",
        "ventas",
        "vsl",
        "webinar",
    }
)

# Stopwords gramaticales en español (artículos, preposiciones, pronombres,
# conjunciones, adverbios y formas verbales auxiliares frecuentes)
_STOPWORDS = frozenset(
    {
        "a",
        "aca",
        "acá",
        "ahi",
        "ahí",
        "al",
        "algo",
        "algun",
        "alguna",
        "algunas",
        "alguno",
        "algunos",
        "alli",
        "allí",
        "ambos",
        "ante",
        "antes",
        "aquel",
        "aquella",
        "aquellas",
        "aquello",
        "aquellos",
        "aqui",
        "aquí",
        "arriba",
        "asi",
        "así",
        "aun",
        "aún",
        "aunque",
        "bajo",
        "bastante",
        "bien",
        "cada",
        "casi",
        "cierto",
        "cierta",
        "ciertas",
        "ciertos",
        "como",
        "con",
        "conmigo",
        "conseguir",
        "consigo",
        "contigo",
        "contra",
        "cual",
        "cuales",
        "cualquier",
        "cualquiera",
        "cuan",
        "cuando",
        "cuanta",
        "cuantas",
        "cuanto",
        "cuantos",
        "de",
        "debajo",
        "del",
        "demasiado",
        "demas",
        "despues",
        "detras",
        "dia",
        "dice",
        "dicho",
        "dieron",
        "diferente",
        "dijeron",
        "dijo",
        "dio",
        "donde",
        "dos",
        "durante",
        "e",
        "el",
        "ella",
        "ellas",
        "ello",
        "ellos",
        "en",
        "encima",
        "entre",
        "era",
        "eramos",
        "eran",
        "eras",
        "eres",
        "es",
        "esa",
        "esas",
        "ese",
        "eso",
        "esos",
        "esta",
        "estaba",
        "estaban",
        "estado",
        "estados",
        "estais",
        "estamos",
        "estan",
        "estar",
        "estas",
        "este",
        "esto",
        "estos",
        "estoy",
        "etc",
        "fin",
        "fue",
        "fueron",
        "fui",
        "fuimos",
        "gran",
        "grandes",
        "ha",
        "haber",
        "habia",
        "habian",
        "hace",
        "hacia",
        "haciendo",
        "hago",
        "han",
        "has",
        "hasta",
        "hay",
        "he",
        "hemos",
        "hice",
        "hicieron",
        "hizo",
        "hoy",
        "hubo",
        "incluso",
        "ir",
        "jamás",
        "jamas",
        "la",
        "las",
        "le",
        "les",
        "lo",
        "los",
        "luego",
        "mas",
        "más",
        "me",
        "mediante",
        "menos",
        "mi",
        "mia",
        "mias",
        "mientras",
        "mio",
        "mios",
        "mis",
        "misma",
        "mismas",
        "mismo",
        "mismos",
        "modo",
        "mucha",
        "muchas",
        "mucho",
        "muchos",
        "muy",
        "nada",
        "nadie",
        "ni",
        "ningun",
        "ninguna",
        "ningunas",
        "ninguno",
        "ningunos",
        "no",
        "nos",
        "nosotras",
        "nosotros",
        "nuestra",
        "nuestras",
        "nuestro",
        "nuestros",
        "nunca",
        "o",
        "os",
        "otra",
        "otras",
        "otro",
        "otros",
        "para",
        "parece",
        "parte",
        "partir",
        "paso",
        "pero",
        "poco",
        "pocos",
        "podemos",
        "poder",
        "podria",
        "podriais",
        "podriamos",
        "podrian",
        "podrias",
        "por",
        "porque",
        "primero",
        "puede",
        "pueden",
        "puedo",
        "pues",
        "que",
        "qué",
        "quedó",
        "queremos",
        "quien",
        "quienes",
        "quiza",
        "quizas",
        "sabe",
        "sabeis",
        "sabemos",
        "saben",
        "saber",
        "se",
        "sea",
        "sean",
        "segun",
        "ser",
        "sera",
        "seria",
        "si",
        "sí",
        "sido",
        "siempre",
        "siendo",
        "sin",
        "sino",
        "sobre",
        "sois",
        "solamente",
        "solo",
        "somos",
        "son",
        "soy",
        "su",
        "sus",
        "suya",
        "suyas",
        "suyo",
        "suyos",
        "tal",
        "tambien",
        "tampoco",
        "tan",
        "tanto",
        "te",
        "teneis",
        "tenemos",
        "tener",
        "tengo",
        "tenia",
        "tenian",
        "ti",
        "tiempo",
        "tiene",
        "tienen",
        "tienes",
        "todo",
        "todos",
        "tomar",
        "trabajo",
        "tras",
        "tu",
        "tus",
        "tuya",
        "tuyas",
        "tuyo",
        "tuyos",
        "u",
        "un",
        "una",
        "unas",
        "uno",
        "unos",
        "usa",
        "usais",
        "usamos",
        "usan",
        "usar",
        "usas",
        "uso",
        "usted",
        "ustedes",
        "va",
        "vais",
        "vamos",
        "van",
        "varias",
        "varios",
        "veces",
        "ver",
        "verdadera",
        "verdadero",
        "vez",
        "vos",
        "vosotras",
        "vosotros",
        "voy",
        "vuestra",
        "vuestras",
        "vuestro",
        "vuestros",
        "y",
        "ya",
        "yo",
    }
)


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


def get_top_k() -> int:
    raw = _leer_env("TOP_K")
    if not raw:
        return _DEFAULT_TOP_K
    try:
        valor = int(raw)
    except ValueError:
        logger.warning("TOP_K inválido (%s); usando default %d", raw, _DEFAULT_TOP_K)
        return _DEFAULT_TOP_K
    return max(1, valor)


def _limpiar_linea(linea: str) -> str | None:
    linea = linea.strip()
    if not linea:
        return None

    if _RE_SOLO_TIMESTAMP.match(linea) or _RE_SILENCIO.match(linea):
        return None

    if _RE_MULETILLA.match(linea):
        return None

    linea = _RE_TIMESTAMP.sub("", linea).strip()
    if not linea or _RE_MULETILLA.match(linea):
        return None

    return linea


def limpiar_transcript(contenido: str) -> str:
    lineas_limpias: list[str] = []
    vistas: set[str] = set()

    for linea in contenido.splitlines():
        limpia = _limpiar_linea(linea)
        if not limpia:
            continue

        clave = limpia.lower()
        if clave in vistas:
            continue

        vistas.add(clave)
        lineas_limpias.append(limpia)

    return "\n\n".join(lineas_limpias)


def _sin_acentos(texto: str) -> str:
    normalizado = unicodedata.normalize("NFD", texto.lower())
    return "".join(c for c in normalizado if unicodedata.category(c) != "Mn")


def _es_token_valido(palabra: str) -> bool:
    if palabra in _DOMAIN_TERMS:
        return True
    if len(palabra) < 3:
        return False
    return palabra not in _STOPWORDS


def _tokenizar(texto: str) -> list[str]:
    palabras = re.findall(r"\w+", texto.lower())
    tokens: list[str] = []
    for palabra in palabras:
        normalizada = _sin_acentos(palabra)
        if _es_token_valido(normalizada):
            tokens.append(normalizada)
    return tokens


def _fragmentar(contenido: str) -> list[str]:
    partes = [p.strip() for p in re.split(r"\n\s*\n", contenido) if p.strip()]
    return partes if partes else [contenido.strip()]


def _puntaje_fragmento(fragmento: str, palabras_clave: list[str]) -> int:
    if not palabras_clave:
        return 0

    conteo = Counter(_tokenizar(fragmento))
    return sum(conteo.get(palabra, 0) for palabra in palabras_clave)


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
            contenido = limpiar_transcript(archivo.read_text(encoding="utf-8"))
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


def _archivo_candidato(modulo: str, clase: str) -> str:
    return f"{modulo}/{clase}"


def _score_final(score_keyword: int, peso_modulo: float) -> float:
    """Keyword domina; peso de módulo solo desempata entre scores parejos."""
    return score_keyword + peso_modulo * 0.001


def _log_candidatos(
    pregunta: str,
    candidatos: list[dict],
    seleccionados: list[dict],
    top_k: int,
) -> None:
    logger.info("ranking pregunta=%r", pregunta)

    por_keyword = sorted(
        candidatos,
        key=lambda c: c["score_keyword"],
        reverse=True,
    )[:10]
    logger.info("ranking top 10 ANTES de peso de módulo (solo keyword):")
    for c in por_keyword:
        logger.info(
            "candidato=%s score_keyword=%d peso_modulo=%.1f score_final=%.4f",
            _archivo_candidato(c["modulo"], c["clase"]),
            c["score_keyword"],
            c["peso_modulo"],
            _score_final(c["score_keyword"], c["peso_modulo"]),
        )

    logger.info("ranking top %d DESPUÉS de ranking (keyword + desempate módulo):", top_k)
    for item in seleccionados:
        logger.info(
            "candidato=%s score_keyword=%d peso_modulo=%.1f score_final=%.4f",
            _archivo_candidato(item["modulo"], item["clase"]),
            item.get("_score_keyword", 0),
            item.get("_peso_modulo", 1.0),
            _score_final(item.get("_score_keyword", 0), item.get("_peso_modulo", 1.0)),
        )


def buscar(pregunta: str, top_k: int | None = None) -> list[dict]:
    if top_k is None:
        top_k = get_top_k()

    palabras_clave = _tokenizar(pregunta)
    if not palabras_clave or not _INDEX:
        return []

    candidatos: list[dict] = []

    for entrada in _INDEX:
        peso_modulo = _multiplicador_modulo(entrada["modulo"])
        for fragmento in _fragmentar(entrada["contenido"]):
            score_keyword = _puntaje_fragmento(fragmento, palabras_clave)
            if score_keyword <= 0:
                continue

            candidatos.append(
                {
                    "modulo": entrada["modulo"],
                    "clase": entrada["clase"],
                    "contenido": fragmento,
                    "clase_id": entrada.get("clase_id"),
                    "programa_id": entrada.get("programa_id"),
                    "score_keyword": score_keyword,
                    "peso_modulo": peso_modulo,
                }
            )

    candidatos.sort(
        key=lambda c: (c["score_keyword"], c["peso_modulo"]),
        reverse=True,
    )

    resultados: list[tuple[float, dict]] = []
    for c in candidatos:
        item = {
            "modulo": c["modulo"],
            "clase": c["clase"],
            "contenido": c["contenido"],
            "clase_id": c["clase_id"],
            "programa_id": c["programa_id"],
            "_score_keyword": c["score_keyword"],
            "_peso_modulo": c["peso_modulo"],
        }
        resultados.append((_score_final(c["score_keyword"], c["peso_modulo"]), item))

    seleccionados = _seleccionar_top_k(resultados, top_k)
    _log_candidatos(pregunta, candidatos, seleccionados, top_k)

    for item in seleccionados:
        item.pop("_score_keyword", None)
        item.pop("_peso_modulo", None)

    return seleccionados


_INDEX = _cargar_transcripts()
logger.info("Knowledge base cargada: %d archivos", len(_INDEX))
