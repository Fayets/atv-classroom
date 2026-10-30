"""El cerebro aprende cómo Mauri arma los updates de #updates, para después proponerlos y, más adelante, hacerlos
solo. Sin IA: los updates tienen un formato fijo y se leen con reglas.

    @Juan
    ⚠️ ⏳ 1d 9h vicente-dicapore Contenidos: CTA baja o nula conversión
    📓 jesus-lopez Asesoría: Estrategia de contenidos

Cada renglón queda en cerebro_updates con quién, qué cliente, qué tipo, qué urgencia y qué mensaje del cliente
lo originó. Si se resolvió sale del tilde (mensajes_tildes, misma clave)."""

import logging
import re
from datetime import datetime, timedelta

from pony.orm import db_session

from src.db import DB_SCHEMA, db
from src.models import UpdateRenglon

logger = logging.getLogger(__name__)

# Lo que va adelante del cliente: íconos, "--" y el contador ("1d 9h", "20h"). Igual que en el chat (TextoMensaje).
_MARCAS = re.compile(r"^(?:\s*(?:[^\w\s#@]+|\d+\s*[dhm](?!\w)))+\s*")
_SLUG = re.compile(r"^#?([a-z0-9][a-z0-9-]*[a-z0-9])(?:\s+|$)(.*)$", re.I | re.S)
_TIPO = re.compile(r"^([^:]{2,30}):\s*(.+)$", re.S)
_TIEMPO = re.compile(r"(\d+)\s*([dhm])(?!\w)")
_REVISAR_DIAS = 3  # los updates de estos días se releen en cada ciclo (Mauri los edita)


def nucleo(renglon: str) -> str:
    return _MARCAS.sub("", renglon.strip(), count=1).lstrip("#").strip()


def _horas(marca: str) -> float | None:
    partes = _TIEMPO.findall(marca or "")
    if not partes:
        return None
    return round(sum(int(n) * {"d": 24, "h": 1, "m": 1 / 60}[u] for n, u in partes), 2)


def desarmar(texto: str) -> list[dict]:
    """Los renglones de un update, en orden, con su responsable."""
    salida = []
    for parrafo in re.split(r"\n{2,}", texto or ""):
        cabeza, *renglones = parrafo.strip().split("\n")
        if not cabeza.strip().startswith("@"):
            continue
        responsable = cabeza.strip().lstrip("@").strip()
        for renglon in renglones:
            clave = nucleo(renglon)
            if not clave:
                continue
            marca = renglon.strip()[: len(renglon.strip()) - len(_MARCAS.sub("", renglon.strip(), count=1))].strip()
            slug, resto = None, clave
            hallado = _SLUG.match(clave)
            if hallado:
                slug, resto = hallado.group(1).lower(), hallado.group(2).strip()
            tipo, tarea = None, resto
            t = _TIPO.match(resto)
            if t:
                tipo, tarea = t.group(1).strip(), t.group(2).strip()
            salida.append({
                "responsable": responsable, "slug": slug, "tipo": tipo, "tarea": tarea or clave, "clave": clave,
                "marca": marca or None, "alerta": "⚠" in marca, "reloj": "⏳" in marca or "⌛" in marca, "espera_horas": _horas(marca),
            })
    return salida


def _clientes_por_slug() -> dict[str, tuple[int, int]]:
    filas = db.select(
        f'SELECT lower(trim(both \'#\' from trim(k.canal_discord))), k.id, c.id FROM clients.clientes k '
        f'JOIN "{DB_SCHEMA}"."canales" c ON c.cliente_id = k.id AND c.tipo = \'cliente\' WHERE coalesce(k.canal_discord, \'\') <> \'\''
    )
    return {s: (int(k), int(c)) for s, k, c in filas if s}


# Cómo nombra Mauri a alguien cuando no coincide con su nombre en el classroom.
_ALIAS = {"juan pablo": "juampi"}


def _equipo_por_nombre() -> dict[str, int]:
    nombres = {}
    for i, n in db.select(f'SELECT id, nombre FROM "{DB_SCHEMA}"."admins" WHERE activo AND NOT coalesce(borrado, false)'):
        n = (n or "").strip().lower()
        if n:
            nombres.setdefault(n, int(i))
            nombres.setdefault(n.split(" ")[0], int(i))
    for alias, nombre in _ALIAS.items():
        if nombre in nombres:
            nombres[alias] = nombres[nombre]
    return nombres


def _tipo(t: str | None) -> str | None:
    """'CONSULTA' y 'Consulta' son lo mismo."""
    t = (t or "").strip()
    return (t[:1].upper() + t[1:].lower())[:60] if t else None


def _origen(canal_id: int, antes_de: datetime) -> tuple[int | None, datetime | None]:
    """El último mensaje del cliente en su chat antes del update: lo que probablemente lo originó."""
    fila = db.select(
        f'SELECT id, creado_en FROM "{DB_SCHEMA}"."mensajes_canal" WHERE canal = $canal_id AND autor_tipo = \'cliente\' '
        "AND NOT borrado AND creado_en < $antes_de ORDER BY creado_en DESC LIMIT 1"
    )
    return (int(fila[0][0]), fila[0][1]) if fila else (None, None)


def aprender() -> dict:
    """Relee los updates nuevos o de los últimos días (por si se editaron) y rearma sus renglones."""
    with db_session:
        canales = [int(i) for i in db.select(f'SELECT id FROM "{DB_SCHEMA}"."canales" WHERE tipo = \'grupo\' AND nombre ILIKE \'%updates%\'')]
        if not canales:
            return {"updates": 0, "renglones": 0}
        lista = ",".join(str(i) for i in canales)
        desde = datetime.utcnow() - timedelta(days=_REVISAR_DIAS)
        mensajes = db.select(
            f'SELECT m.id, m.autor_id, m.creado_en, m.texto, m.borrado FROM "{DB_SCHEMA}"."mensajes_canal" m '
            f"WHERE m.canal IN ({lista}) AND m.autor_tipo = 'admin' AND (m.creado_en > $desde OR NOT EXISTS "
            f'(SELECT 1 FROM "{DB_SCHEMA}"."cerebro_updates" u WHERE u.mensaje_id = m.id)) ORDER BY m.creado_en'
        )
        clientes, equipo = _clientes_por_slug(), _equipo_por_nombre()
        # El origen se busca solo la primera vez que aparece cada cliente + tarea (los updates se repiten a diario).
        vistos = {(s, c) for s, c in db.select(f'SELECT slug, clave FROM "{DB_SCHEMA}"."cerebro_updates" WHERE publicado_en < $desde')}
        updates = renglones = 0
        for mid, autor_id, creado_en, texto, borrado in mensajes:
            db.execute(f'DELETE FROM "{DB_SCHEMA}"."cerebro_updates" WHERE mensaje_id = $mid')
            if borrado:
                continue
            partes = desarmar(texto)
            if not partes:
                continue
            updates += 1
            for orden, r in enumerate(partes):
                cliente_id, canal_cliente = clientes.get(r["slug"] or "", (None, None))
                origen_id = origen_en = None
                if canal_cliente and (r["slug"], r["clave"]) not in vistos:
                    origen_id, origen_en = _origen(canal_cliente, creado_en)
                vistos.add((r["slug"], r["clave"]))
                UpdateRenglon(
                    mensaje_id=int(mid), autor_id=autor_id, publicado_en=creado_en, orden=orden,
                    responsable=r["responsable"][:80], responsable_id=equipo.get(r["responsable"].lower()) or equipo.get(r["responsable"].lower().split(" ")[0]),
                    slug=r["slug"], cliente_id=cliente_id, tipo=_tipo(r["tipo"]), tarea=r["tarea"][:600], clave=r["clave"][:600],
                    marca=r["marca"], alerta=r["alerta"], reloj=r["reloj"], espera_horas=r["espera_horas"],
                    origen_mensaje_id=origen_id, origen_en=origen_en,
                )
                renglones += 1
        return {"updates": updates, "renglones": renglones}
