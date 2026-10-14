"""Carpeta "Llamadas" del escritorio: las llamadas de Fathom de cada coach.

- Un coach ve las suyas.
- Un admin ve una carpeta por coach con las llamadas de cada uno.
Cada llamada dice con qué cliente fue (si estaba invitado con su mail) y si ya se armó su roadmap.
"""

import json

from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db
from src.models import Admin, Canal, ClienteExterno, FathomConexion, Llamada
from src.services.auth_service import es_equipo
from src.services.cuenta_service import foto_de


def _iso(d):
    return d.isoformat() + "Z" if d else None


def _con_roadmap() -> set[str]:
    """Links de Fathom que ya tienen roadmap."""
    return {r[0] for r in db.select(f'SELECT fathom_url FROM "{DB_SCHEMA}"."roadmap_docs" WHERE fathom_url IS NOT NULL')}


def _fila(ll: Llamada, clientes: dict, canales: dict, hechos: set[str]) -> dict:
    c = clientes.get(ll.cliente_id) if ll.cliente_id else None
    links = {x for x in (ll.share_url, ll.url) if x}
    return {
        "id": ll.id,
        "titulo": ll.titulo or "Llamada sin título",
        "inicio": _iso(ll.inicio),
        "duracion_min": ll.duracion_min,
        "fathom_url": ll.share_url or ll.url,
        "cliente": {"id": c.id, "nombre": c.nombre or c.email, "canal_id": canales.get(c.id)} if c else None,
        "con_transcripcion": bool(ll.transcripcion),
        "con_roadmap": bool(links & hechos),
        "coach_id": ll.admin_id,
    }


class LlamadasServices:
    def listar(self, sesion: dict) -> dict:
        if not es_equipo(sesion):
            raise HTTPException(status_code=403, detail="Solo el equipo.")
        yo, admin = sesion["usuario_id"], sesion.get("rol") == "admin"
        with db_session:
            sql = f'SELECT * FROM "{DB_SCHEMA}"."llamadas"' + ("" if admin else " WHERE admin_id = $yo") + " ORDER BY inicio DESC NULLS LAST"
            llamadas = list(Llamada.select_by_sql(sql))
            clientes = {c.id: c for c in list(ClienteExterno.select())}
            canales = {c.cliente_id: c.id for c in list(Canal.select()) if c.cliente_id}
            hechos = _con_roadmap()
            filas = [_fila(ll, clientes, canales, hechos) for ll in llamadas]
            conectados = {c.admin_id for c in list(FathomConexion.select())}
            if not admin:
                return {"admin": False, "conectado": yo in conectados, "llamadas": filas}
            # Admin: una carpeta por persona del equipo con Fathom conectado o con llamadas.
            ids = conectados | {f["coach_id"] for f in filas}
            coaches = []
            for a in list(Admin.select()):
                if a.id in ids and not a.borrado:
                    suyas = [f for f in filas if f["coach_id"] == a.id]
                    coaches.append({
                        "id": a.id,
                        "nombre": a.nombre or a.email,
                        "foto_url": foto_de("admin", a.id, a.foto_url),
                        "conectado": a.id in conectados,
                        "llamadas": suyas,
                    })
            coaches.sort(key=lambda c: (c["id"] != yo, c["nombre"].lower()))
            return {"admin": True, "conectado": yo in conectados, "coaches": coaches}

    def detalle(self, sesion: dict, llamada_id: int) -> dict:
        if not es_equipo(sesion):
            raise HTTPException(status_code=403, detail="Solo el equipo.")
        with db_session:
            ll = Llamada.get(id=llamada_id)
            if ll is None or (sesion.get("rol") != "admin" and ll.admin_id != sesion["usuario_id"]):
                raise HTTPException(status_code=404, detail="No existe esa llamada.")
            clientes = {ll.cliente_id: ClienteExterno.get(id=ll.cliente_id)} if ll.cliente_id else {}
            canal = Canal.get(cliente_id=ll.cliente_id) if ll.cliente_id else None
            fila = _fila(ll, {k: v for k, v in clientes.items() if v}, {ll.cliente_id: canal.id} if canal else {}, _con_roadmap())
            coach = Admin.get(id=ll.admin_id)
            return {
                **fila,
                "coach": (coach.nombre or coach.email) if coach else None,
                "invitados": json.loads(ll.invitados_json or "[]"),
                "transcripcion": ll.transcripcion or "",
                "resumen": ll.resumen or "",
            }

    def asignar_cliente(self, sesion: dict, llamada_id: int, cliente_id: int | None) -> dict:
        """Cuando el cliente no estaba invitado con su mail, el coach dice de quién es la llamada."""
        with db_session:
            ll = Llamada.get(id=llamada_id)
            if ll is None or not es_equipo(sesion) or (sesion.get("rol") != "admin" and ll.admin_id != sesion["usuario_id"]):
                raise HTTPException(status_code=404, detail="No existe esa llamada.")
            if cliente_id is not None and ClienteExterno.get(id=cliente_id) is None:
                raise HTTPException(status_code=404, detail="No existe ese cliente.")
            ll.cliente_id = cliente_id
        return self.detalle(sesion, llamada_id)

    def por_link(self, sesion: dict, url: str) -> dict:
        from src.services.fathom_service import buscar_por_link

        llamada_id = buscar_por_link(sesion, url)
        # Quien la pidió la ve aunque sea de otro coach: la trajo para armar el roadmap.
        return self.detalle({**sesion, "rol": "admin"}, llamada_id)
