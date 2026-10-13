"""El cerebro del classroom, para el admin: todo lo que sabe ATV y todo lo que va pasando con
cada cliente, como un grafo de neuronas (nodos) y conexiones (enlaces), al estilo Obsidian.

Dos capas, ambas con datos reales:
- Conocimiento: módulos → clases → conceptos (src/data/conceptos.json), frentes y coaches.
- Personas: clientes con acceso, su plan, y lo que hacen: mensajes en su canal, clases que
  completaron, lo que le preguntaron a la guía, pedidos de ayuda, solicitudes de SOP. Cada
  enlace de esta capa lleva la fecha en que apareció: así el cerebro se ve crecer.

Los ids de nodo son "<tipo>:<clave>" (clase:17, concepto:avatar, cliente:146).
Pony en Python 3.13 no soporta lambdas ni comprensiones dentro de select: se lee todo y se
filtra en Python (son cientos de filas)."""

from __future__ import annotations

import json
import re
import time
import unicodedata
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

from fastapi import HTTPException
from pony.orm import db_session

from src.models import (
    Admin,
    Canal,
    Clase,
    ClienteExterno,
    ConsultaCoach,
    ConsultaGuia,
    Frente,
    Mencion,
    MensajeCanal,
    Programa,
    Progreso,
    SolicitudSop,
)
from src.services.auth_service import _tiene_acceso
from src.services.bloqueos import programa_bloqueado
from src.services.frente_service import BRIEFS, CATALOGO, COACHES, coach_de_clase

_DATA = Path(__file__).resolve().parent.parent / "data"
CONCEPTOS = json.loads((_DATA / "conceptos.json").read_text(encoding="utf-8"))
_CONCEPTO = {c["id"]: c for c in CONCEPTOS["conceptos"]}
_TTL = 5
_cache: dict = {"t": 0.0, "grafo": None}


def _iso(momento) -> str | None:
    if momento is None:
        return None
    if isinstance(momento, datetime):
        return momento.isoformat(timespec="seconds") + "Z"
    if isinstance(momento, date):
        return momento.isoformat()
    return str(momento)


_SIGLAS = {"SOP", "SOPS", "MVP", "KPI", "KPIS", "VSL", "ABO", "CBO", "B2B", "B2C", "ATV", "CRM", "IA", "AI", "USD", "YT", "CSM", "1-1", "VS"}


def _bonito(titulo: str) -> str:
    """Los títulos de clase vienen EN MAYÚSCULAS: como etiqueta de neurona van como frase normal,
    respetando siglas (SOP, MVP, KPI…)."""
    if not titulo or not titulo.isupper():
        return titulo
    palabras = titulo.lower().split(" ")
    salida = []
    for i, p in enumerate(palabras):
        limpia = p.strip("¿?¡!,.:;()").upper()
        if limpia in _SIGLAS:
            salida.append(p.upper())
        elif i == 0 or (salida and salida[-1].endswith(("¿", "?", ".", ":"))):
            salida.append(p[:1].upper() + p[1:] if p[:1] != "¿" else "¿" + p[1:2].upper() + p[2:])
        else:
            salida.append(p)
    return " ".join(salida)


def _norm(texto: str) -> str:
    sin_tildes = unicodedata.normalize("NFD", (texto or "").lower())
    return "".join(c for c in sin_tildes if unicodedata.category(c) != "Mn")


def _patrones_conceptos() -> list[tuple[str, re.Pattern]]:
    """Para reconocer conceptos en lo que escriben los clientes: el nombre y sus partes largas."""
    patrones = []
    for c in CONCEPTOS["conceptos"]:
        variantes = {_norm(c["nombre"])}
        variantes |= {_norm(p) for p in c["id"].split("-") if len(p) > 5}
        # Cómo lo dice un cliente sin el término técnico (scripts/palabras_conceptos.py).
        variantes |= {_norm(p) for p in c.get("palabras", []) if len(p) > 3}
        expresion = "|".join(re.escape(v) for v in sorted(variantes, key=len, reverse=True) if v)
        if expresion:
            patrones.append((c["id"], re.compile(r"\b(" + expresion + r")s?\b")))
    return patrones


_PATRONES = _patrones_conceptos()


def conceptos_en(texto: str) -> list[str]:
    t = _norm(texto)
    return [cid for cid, patron in _PATRONES if patron.search(t)]


def _clave_coach_de_admin(admin: Admin) -> str | None:
    """El miembro del equipo que corresponde a un coach del catálogo (por primer nombre)."""
    primero = _norm((admin.nombre or "").split(" ")[0]) if admin.nombre else ""
    if not primero:
        return None
    for clave, c in COACHES["coaches"].items():
        if _norm(c["nombre"].split(" ")[0]) == primero:
            return clave
    return None


class _Grafo:
    def __init__(self) -> None:
        self.nodos: dict[str, dict] = {}
        self.enlaces: dict[tuple, dict] = {}

    def nodo(self, nid: str, tipo: str, nombre: str, creado: str | None = None, **extra) -> None:
        if nid not in self.nodos:
            self.nodos[nid] = {"id": nid, "tipo": tipo, "nombre": nombre, "creado_en": creado, **extra}

    def enlace(self, a: str, b: str, tipo: str, creado: str | None = None) -> None:
        if a not in self.nodos or b not in self.nodos or a == b:
            return
        clave = (min(a, b), max(a, b), tipo)
        previo = self.enlaces.get(clave)
        if previo is None:
            self.enlaces[clave] = {"a": a, "b": b, "tipo": tipo, "creado_en": creado, "veces": 1}
        else:
            previo["veces"] += 1
            if creado and (previo["creado_en"] is None or creado < previo["creado_en"]):
                previo["creado_en"] = creado


def _construir() -> dict:
    g = _Grafo()
    with db_session:
        # ---------- conocimiento ----------
        programas = sorted(list(Programa.select()), key=lambda p: p.orden)
        for p in programas:
            g.nodo(f"modulo:{p.id}", "modulo", _bonito(p.titulo), bloqueado=programa_bloqueado(p))
        for c in list(Clase.select()):
            if not c.titulo or c.titulo.strip().lower() == "próximamente":
                continue
            g.nodo(f"clase:{c.id}", "clase", _bonito(c.titulo))
            g.enlace(f"modulo:{c.seccion.programa.id}", f"clase:{c.id}", "contiene")
            coach = coach_de_clase(c)
            if coach:
                g.nodo(f"coach:{coach['clave']}", "coach", coach["nombre"], area=coach["area"])
                g.enlace(f"coach:{coach['clave']}", f"clase:{c.id}", "enseña")
        for concepto in CONCEPTOS["conceptos"]:
            g.nodo(f"concepto:{concepto['id']}", "concepto", concepto["nombre"])
        for clase_id, ids in CONCEPTOS["clases"].items():
            for cid in ids:
                g.enlace(f"clase:{clase_id}", f"concepto:{cid}", "trata")
        for p in CATALOGO["problemas"]:
            g.nodo(f"frente:{p['slug']}", "frente", p["titulo"])
            for clase_id in dict.fromkeys([*p["resolver"], p["sop"]["clase_id"]]):
                g.enlace(f"frente:{p['slug']}", f"clase:{clase_id}", "se resuelve con")
        for clave, c in COACHES["coaches"].items():
            g.nodo(f"coach:{clave}", "coach", c["nombre"], area=c["area"])

        # ---------- equipo ----------
        coach_de_admin: dict[int, str] = {}
        for a in list(Admin.select()):
            if not a.activo:
                continue
            clave = _clave_coach_de_admin(a)
            if clave:
                coach_de_admin[a.id] = f"coach:{clave}"
            else:
                coach_de_admin[a.id] = f"equipo:{a.id}"
                g.nodo(f"equipo:{a.id}", "coach", a.nombre or a.email, area=a.area)

        # ---------- clientes ----------
        clientes: dict[int, ClienteExterno] = {}
        for c in list(ClienteExterno.select()):
            if _tiene_acceso(c):
                clientes[c.id] = c
                plan = (c.plan_actual or "sin plan").lower()
                g.nodo(f"plan:{plan}", "plan", plan.capitalize())
                g.nodo(f"cliente:{c.id}", "cliente", c.nombre or c.email)
                g.enlace(f"cliente:{c.id}", f"plan:{plan}", "tiene el plan")

        def cliente_id(usuario_id: int, tipo: str) -> str | None:
            return f"cliente:{usuario_id}" if tipo == "cliente" and usuario_id in clientes else None

        # ---------- lo que pasa (con fecha) ----------
        canal_de: dict[int, int] = {}
        for canal in list(Canal.select()):
            if canal.tipo == "cliente" and canal.cliente_id:
                canal_de[canal.id] = canal.cliente_id
        for m in list(MensajeCanal.select()):
            if m.borrado:
                continue
            dueno = canal_de.get(m.canal.id)
            if dueno not in clientes:
                continue
            cnodo = f"cliente:{dueno}"
            cuando = _iso(m.creado_en)
            if m.autor_tipo == "admin" and m.autor_id in coach_de_admin:
                g.enlace(cnodo, coach_de_admin[m.autor_id], "conversó con", cuando)
            if m.autor_tipo == "cliente":
                for cid in conceptos_en(m.texto or ""):
                    g.enlace(cnodo, f"concepto:{cid}", "habló de", cuando)
        for men in list(Mencion.select()):
            dueno = canal_de.get(men.canal_id)
            if dueno in clientes and men.admin_id in coach_de_admin:
                g.enlace(f"cliente:{dueno}", coach_de_admin[men.admin_id], "etiquetó a", _iso(men.creado_en))
        for p in list(Progreso.select()):
            if p.completado and p.cliente_id in clientes:
                g.enlace(f"cliente:{p.cliente_id}", f"clase:{p.clase_id}", "completó", _iso(p.completado_en))
        for q in list(ConsultaGuia.select()):
            cnodo = cliente_id(q.usuario_id, q.tipo_usuario)
            if not cnodo:
                continue
            cuando = _iso(q.creado_en)
            for clase_id in json.loads(q.clases_json or "[]"):
                g.enlace(cnodo, f"clase:{clase_id}", "le recomendó la guía", cuando)
            for cid in conceptos_en(q.texto):
                g.enlace(cnodo, f"concepto:{cid}", "preguntó por", cuando)
            if q.frente:
                g.enlace(cnodo, f"frente:{q.frente}", "tiene el frente", cuando)
        for f in list(Frente.select()):
            cnodo = cliente_id(f.usuario_id, f.tipo_usuario)
            if cnodo:
                g.enlace(cnodo, f"frente:{f.slug}", "trabaja el frente", _iso(f.creado_en))
        for c in list(ConsultaCoach.select()):
            cnodo = cliente_id(c.usuario_id, c.tipo_usuario)
            if cnodo and c.slug:
                g.enlace(cnodo, f"frente:{c.slug}", "pidió ayuda en", _iso(c.creado_en))
        for s in list(SolicitudSop.select()):
            cnodo = cliente_id(s.usuario_id, s.tipo_usuario)
            if not cnodo:
                continue
            nid = f"solicitud:{s.id}"
            g.nodo(nid, "solicitud", (s.problema or "Solicitud de SOP")[:60], _iso(s.creado_en))
            g.enlace(cnodo, nid, "pidió un SOP", _iso(s.creado_en))
            for cid in conceptos_en(f"{s.problema} {s.consulta or ''}"):
                g.enlace(nid, f"concepto:{cid}", "trata", _iso(s.creado_en))

    # Se ignoran neuronas sueltas que no aportan (un coach del catálogo sin nada, etc.)
    conectados = set()
    for e in g.enlaces.values():
        conectados.add(e["a"])
        conectados.add(e["b"])
    nodos = [n for n in g.nodos.values() if n["id"] in conectados or n["tipo"] in ("cliente", "modulo")]
    enlaces = list(g.enlaces.values())
    fechas = [e["creado_en"] for e in enlaces if e["creado_en"]]
    por_tipo: dict[str, int] = defaultdict(int)
    for n in nodos:
        por_tipo[n["tipo"]] += 1
    return {
        "nodos": nodos,
        "enlaces": enlaces,
        "resumen": {
            "neuronas": len(nodos),
            "conexiones": len(enlaces),
            "aprendidas": len(fechas),
            "ultima": max(fechas) if fechas else None,
            "por_tipo": dict(por_tipo),
        },
        "generado_en": _iso(datetime.utcnow()),
    }


class CerebroServices:
    def grafo(self) -> dict:
        if _cache["grafo"] is None or time.time() - _cache["t"] > _TTL:
            _cache["grafo"] = _construir()
            _cache["t"] = time.time()
        return _cache["grafo"]

    def nodo(self, nid: str) -> dict:
        """Lo que hay adentro de una neurona: su contenido y sus vecinas con el tipo de vínculo."""
        grafo = self.grafo()
        base = next((n for n in grafo["nodos"] if n["id"] == nid), None)
        if base is None:
            raise HTTPException(status_code=404, detail="Esa neurona no existe.")
        vecinos = []
        nombres = {n["id"]: n for n in grafo["nodos"]}
        for e in grafo["enlaces"]:
            if nid in (e["a"], e["b"]):
                otro = e["b"] if e["a"] == nid else e["a"]
                if otro in nombres:
                    vecinos.append(
                        {
                            "id": otro,
                            "tipo": nombres[otro]["tipo"],
                            "nombre": nombres[otro]["nombre"],
                            "vinculo": e["tipo"],
                            "veces": e["veces"],
                            "creado_en": e["creado_en"],
                        }
                    )
        vecinos.sort(key=lambda v: (v["creado_en"] is None, v["creado_en"] or "", v["nombre"]), reverse=False)
        tipo, clave = nid.split(":", 1)
        detalle = getattr(self, f"_detalle_{tipo}", lambda _c: {})(clave)
        return {**base, "detalle": detalle, "vecinos": vecinos}

    # ---------- detalle por tipo ----------
    @staticmethod
    def _detalle_clase(clave: str) -> dict:
        with db_session:
            c = Clase.get(id=int(clave))
            if c is None:
                return {}
            brief = BRIEFS.get(clave) or {}
            recursos = []
            for r in sorted(list(c.recursos), key=lambda r: r.orden):
                recursos.append({"titulo": r.titulo, "url": r.url})
            return {
                "modulo": _bonito(c.seccion.programa.titulo),
                "seccion": _bonito(c.seccion.titulo),
                "resumen": brief.get("resumen"),
                "claves": brief.get("claves", []),
                "sintomas": brief.get("sintomas", []),
                "recursos": recursos,
                "enlace": f"/classroom/{c.seccion.programa.id}?clase={c.id}",
            }

    @staticmethod
    def _detalle_concepto(clave: str) -> dict:
        c = _CONCEPTO.get(clave) or {}
        return {"definicion": c.get("definicion")}

    @staticmethod
    def _detalle_modulo(clave: str) -> dict:
        with db_session:
            p = Programa.get(id=int(clave))
            if p is None:
                return {}
            return {
                "descripcion": p.descripcion,
                "bloqueado": programa_bloqueado(p),
                "enlace": f"/classroom/{p.id}",
            }

    @staticmethod
    def _detalle_frente(clave: str) -> dict:
        p = next((x for x in CATALOGO["problemas"] if x["slug"] == clave), None)
        if p is None:
            return {}
        return {"sintoma": p.get("sintoma"), "senales": p.get("senales", []), "area": p.get("area"), "enlace": f"/frentes/{clave}"}

    @staticmethod
    def _detalle_coach(clave: str) -> dict:
        c = COACHES["coaches"].get(clave)
        return {"area": c["area"]} if c else {}

    @staticmethod
    def _detalle_equipo(clave: str) -> dict:
        with db_session:
            a = Admin.get(id=int(clave))
            return {"area": a.area, "email": a.email} if a else {}

    @staticmethod
    def _detalle_plan(_clave: str) -> dict:
        return {}

    @staticmethod
    def _detalle_solicitud(clave: str) -> dict:
        with db_session:
            s = SolicitudSop.get(id=int(clave))
            if s is None:
                return {}
            return {"area": s.area, "consulta": s.consulta, "estado": s.estado, "creado_en": _iso(s.creado_en)}

    @staticmethod
    def _detalle_cliente(clave: str) -> dict:
        cliente_id = int(clave)
        with db_session:
            c = ClienteExterno.get(id=cliente_id)
            if c is None:
                return {}
            canal = Canal.get(cliente_id=cliente_id)
            mensajes = []
            if canal is not None:
                todos = sorted([m for m in list(canal.mensajes) if not m.borrado], key=lambda m: m.id)[-6:]
                for m in todos:
                    if m.autor_tipo == "admin":
                        a = Admin.get(id=m.autor_id)
                        autor = (a.nombre or a.email) if a else "Equipo"
                    else:
                        autor = c.nombre or "Cliente"
                    mensajes.append({"autor": autor, "texto": (m.texto or "📎 Archivo adjunto")[:240], "creado_en": _iso(m.creado_en)})
            consultas = []
            for q in sorted(list(ConsultaGuia.select()), key=lambda q: q.id, reverse=True):
                if q.tipo_usuario == "cliente" and q.usuario_id == cliente_id:
                    consultas.append({"texto": q.texto[:240], "creado_en": _iso(q.creado_en)})
                    if len(consultas) == 5:
                        break
            hoy = date.today()
            return {
                "email": c.email,
                "plan": c.plan_actual,
                "vence": _iso(c.fecha_vencimiento),
                "dias_restantes": (c.fecha_vencimiento - hoy).days if c.fecha_vencimiento else None,
                "responsable": c.responsable,
                "mensajes": mensajes,
                "consultas": consultas,
                "enlace": f"/mensajes?c={canal.id}" if canal else None,
            }
