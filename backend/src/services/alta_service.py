"""Alta de clientes desde el classroom (lo que hoy hace /add-client en Discord).

1. Crea la sesión de onboarding en atv-onboarding, SIN mandar el mail.
2. Le pide al bot de onboarding el canal privado de Discord (es el plan de contingencia).
3. Crea la ficha en clients.clientes con el mail real (o completa la que ya existía por una seña): así el cliente ya puede entrar al classroom
   (usuario = su mail, clave = el canal con puntos).
4. El mail de onboarding se manda después, UNA sola vez, con el botón "Enviar link de onboarding".
"""

import json
import re
import unicodedata
from datetime import date, datetime, timedelta
from difflib import SequenceMatcher

import httpx
from decouple import config
from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db
from src.models import Admin, AltaCliente
from src.services.auth_service import _buscar_admin_por_email, _buscar_clientes_por_email, clave_desde_canal, es_equipo

# Las ofertas como las vende ATV hoy (Mentoría y Entry Level son lo mismo con otro nombre; Boost y High
# Level también): nombre del onboarding → plan en atv-clients.
PLANES = {"Entry Level": "entry", "Mid Level": "mid", "High Level": "high", "Boost": "boost", "Mentoría": "mentoria"}
# Modalidad de pago que va al contrato de ZapSign (como el "pago" de /add-client). High Level y Boost
# firman el contrato de High Level, que es siempre de pago único.
PAGOS = ("Pago único", "Dos cuotas", "Tres cuotas")
PAGO_UNICO = {"High Level", "Boost"}
DURACION = {"entry": 120, "mid": 120, "high": 180, "boost": 240, "mentoria": 120}  # días, igual que atv-clients
_CAMPOS_FICHA = ("email", "emails_json", "canal_discord", "plan_actual", "fecha_inicio", "duracion_dias", "fecha_vencimiento", "estado_cliente", "observaciones")
_MAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _onboarding():
    url = config("ONBOARDING_API_URL", default="").rstrip("/")
    clave = config("ONBOARDING_ADMIN_KEY", default="")
    if not url or not clave:
        raise HTTPException(status_code=503, detail="Falta conectar el classroom con el onboarding (ONBOARDING_API_URL y ONBOARDING_ADMIN_KEY).")
    return url, {"X-Admin-Key": clave}


def _llamar(metodo: str, ruta: str, **kw) -> dict:
    url, headers = _onboarding()
    try:
        r = httpx.request(metodo, f"{url}{ruta}", headers=headers, timeout=40, **kw)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="No se pudo hablar con el onboarding. Probá de nuevo en un rato.")
    if r.status_code >= 400:
        try:
            detalle = r.json().get("detail")
        except ValueError:
            detalle = None
        raise HTTPException(status_code=502 if r.status_code >= 500 else 422, detail=detalle or f"El onboarding respondió {r.status_code}.")
    return r.json() if r.content else {}


def slug_de(nombre: str) -> str:
    """Igual que slugify_name del onboarding: el canal de Discord y la clave del classroom salen de acá."""
    t = unicodedata.normalize("NFKD", nombre).encode("ascii", "ignore").decode("ascii").lower().strip()
    t = re.sub(r"[^a-z0-9\s-]", "", t)
    t = re.sub(r"[\s_]+", "-", t)
    return re.sub(r"-+", "-", t).strip("-") or "cliente"


def _norm(t: str | None) -> str:
    t = unicodedata.normalize("NFKD", t or "").encode("ascii", "ignore").decode("ascii").lower()
    return " ".join(re.sub(r"[^a-z0-9@.\s]", " ", t).split())


# Una seña pendiente: ficha sin canal de Discord, no inactiva y sin conversación. Si ya tiene mensajes en
# su chat (historial de Discord atado a esa ficha), el onboarding ya se hizo por otro lado: no es seña.
_SOLO_SENAS = (
    f"""WHERE coalesce(k.canal_discord, '') = '' AND k.estado_cliente <> 'inactivo' AND NOT EXISTS (
      SELECT 1 FROM "{DB_SCHEMA}"."canales" ch JOIN "{DB_SCHEMA}"."mensajes_canal" m ON m.canal = ch.id WHERE ch.cliente_id = k.id)"""
)


# Fichas que alguien ya creó en atv-clients (con su canal, a veces con el mail provisorio que deja el bot
# de Discord) y que todavía no tienen onboarding: sin alta, sin sesión de onboarding y sin conversación.
_SIN_ONBOARDING = (
    f"""WHERE coalesce(k.canal_discord, '') <> '' AND k.estado_cliente <> 'inactivo'
      AND NOT EXISTS (SELECT 1 FROM "{DB_SCHEMA}"."altas_clientes" a WHERE a.cliente_id = k.id)
      AND NOT EXISTS (SELECT 1 FROM onboarding.sessions s WHERE lower(s.client_email) = lower(k.email)
                      OR coalesce(k.emails_json, '') ILIKE '%' || lower(s.client_email) || '%')
      AND NOT EXISTS (SELECT 1 FROM "{DB_SCHEMA}"."canales" ch JOIN "{DB_SCHEMA}"."mensajes_canal" m ON m.canal = ch.id WHERE ch.cliente_id = k.id)
      AND (k.email ILIKE '%@discord.pendiente.atvos.io' OR k.fecha_inicio >= current_date - 14)"""
)
_MAIL_PROVISORIO = "@discord.pendiente.atvos.io"


def _parecidas(a: set[str], b: set[str]) -> bool:
    """Alguna palabra casi igual a otra ("Carla" y "Karla", "Rodriguez" y "Rodrigues")."""
    return any(len(x) >= 3 and len(y) >= 3 and SequenceMatcher(None, x, y).ratio() >= 0.8 for x in a for y in b)


def _candidatas(nombre: str = "", email: str = "") -> list[dict]:
    """Todas las señas abiertas (fichas creadas a mano en atv-clients, sin canal), con las que pueden ser
    de este cliente primero: mismo mail, mismo nombre, o nombre parecido (palabras contenidas o casi
    iguales). Franco y Nick no siempre las nombran igual: por eso se muestran todas y Nick elige."""
    n, e = _norm(nombre), (email or "").strip().lower()
    palabras = set(n.split()) if len(n) >= 3 else set()
    with db_session:
        filas = [("sena", *f) for f in db.select(
            "SELECT id, nombre, email, plan_actual, fecha_inicio, total_pagado_usd, canal_discord FROM clients.clientes k " + _SOLO_SENAS
        )] + [("ficha", *f) for f in db.select(
            "SELECT id, nombre, email, plan_actual, fecha_inicio, total_pagado_usd, canal_discord FROM clients.clientes k " + _SIN_ONBOARDING
        )]
    inversa = {v: k for k, v in PLANES.items()}
    salida = []
    for tipo, i, nom, mail, plan, fecha, pagado, canal in filas:
        otras = set(_norm(nom).split())
        if e and (mail or "").lower() == e:
            coincide = "mail"
        elif otras and otras == palabras:
            coincide = "nombre"
        elif otras and palabras and (otras <= palabras or palabras <= otras or _parecidas(otras, palabras)):
            coincide = "parecido"
        else:
            coincide = None
        salida.append({
            "id": i, "nombre": nom, "plan": inversa.get(plan, plan), "fecha": fecha.isoformat() if fecha else None,
            "monto": float(pagado) if pagado else None, "coincide": coincide, "tipo": tipo, "canal": canal or None,
        })
    orden = {"mail": 0, "nombre": 1, "parecido": 2, None: 3}
    # Las que coinciden primero; el resto, de la seña más nueva a la más vieja.
    salida.sort(key=lambda f: f["fecha"] or "", reverse=True)
    return sorted(salida, key=lambda f: orden[f["coincide"]])


def _equipo(sesion: dict) -> int:
    if not es_equipo(sesion):
        raise HTTPException(status_code=403, detail="Las altas las hace el equipo de ATV.")
    return sesion["usuario_id"]


def _dict(a: AltaCliente) -> dict:
    from src.models import Canal

    autor = Admin.get(id=a.creado_por)
    canal = Canal.get(cliente_id=a.cliente_id)
    return {
        "canal_id": canal.id if canal else None,
        "id": a.id,
        "cliente_id": a.cliente_id,
        "nombre": a.nombre,
        "email": a.email,
        "plan": a.plan,
        "canal": a.canal,
        "clave_classroom": clave_desde_canal(a.canal),
        "discord_invite_url": a.discord_invite_url,
        "discord_error": a.discord_error,
        "canal_ya_existia": bool((json.loads(a.ficha_previa) if a.ficha_previa else {}).get("canal_discord")),
        "creado_en": a.creado_en.isoformat() + "Z",
        "creado_por": (autor.nombre or autor.email) if autor else None,
        "mail_enviado_en": a.mail_enviado_en.isoformat() + "Z" if a.mail_enviado_en else None,
    }


class AltaServices:
    def buscar_ficha(self, sesion: dict, nombre: str, email: str = "") -> list[dict]:
        """Señas abiertas, las que pueden ser de este cliente primero, con lo justo para reconocerla:
        nombre, programa, fecha y cuánto dejó (Nick sabe el monto de la seña que mandó a la caja)."""
        _equipo(sesion)
        return [{k: f[k] for k in ("id", "nombre", "plan", "fecha", "monto", "coincide", "tipo", "canal")} for f in _candidatas(nombre, email)]

    def senas(self, sesion: dict) -> list[dict]:
        """Grupo "Señas" de Mensajes: quienes dejaron seña y todavía no tienen onboarding, la más vieja
        primero (son las que hay que perseguir), con el monto, hace cuántos días y las notas de la caja."""
        _equipo(sesion)
        with db_session:
            filas = db.select(
                "SELECT id, nombre, plan_actual, fecha_inicio, total_pagado_usd, observaciones FROM clients.clientes k "
                + _SOLO_SENAS + " ORDER BY fecha_inicio NULLS LAST, id"
            )
        inversa = {v: k for k, v in PLANES.items()}
        hoy = date.today()
        return [
            {
                "id": i, "nombre": nom, "plan": inversa.get(plan, plan), "fecha": fecha.isoformat() if fecha else None,
                "dias": (hoy - fecha).days if fecha else None, "monto": float(pagado) if pagado else None, "notas": obs or None,
            }
            for i, nom, plan, fecha, pagado, obs in filas
        ]

    def crear(
        self, sesion: dict, nombre: str, email: str, plan: str, ficha_id: int | None = None, sin_ficha: bool = False, pago: str | None = None
    ) -> dict:
        yo = _equipo(sesion)
        nombre = " ".join((nombre or "").split())
        email = (email or "").strip().lower()
        if not nombre or len(nombre) > 80:
            raise HTTPException(status_code=422, detail="Poné el nombre del cliente.")
        if not _MAIL.match(email):
            raise HTTPException(status_code=422, detail="Revisá el mail.")
        if plan not in PLANES:
            raise HTTPException(status_code=422, detail="Elegí el plan.")
        if plan in PAGO_UNICO:
            pago = "Pago único"
        elif pago not in PAGOS:
            raise HTTPException(status_code=422, detail="Elegí la modalidad de pago.")
        canal = slug_de(nombre)
        canal_previo = None  # la ficha ya tenía canal de Discord: se usa ese y no se crea otro
        # Con señas abiertas, quien hace el onboarding tiene que decir si es una de ellas o si no dejó
        # seña: así no queda la ficha de la seña por un lado y la del onboarding por otro.
        if ficha_id is None and not sin_ficha and _candidatas():
            raise HTTPException(status_code=409, detail="Indicá si el cliente dejó seña: elegí su ficha o “No dejó seña”.")
        with db_session:
            if _buscar_admin_por_email(email):
                raise HTTPException(status_code=409, detail="Ese mail es de alguien del equipo de ATV.")
            if any(c.id != ficha_id for c in _buscar_clientes_por_email(email)):
                raise HTTPException(status_code=409, detail="Ya hay un cliente con ese mail.")
            if ficha_id is not None:
                previa = db.select(f"SELECT {', '.join(_CAMPOS_FICHA)} FROM clients.clientes WHERE id = $i", {"i": ficha_id})
                if not previa:
                    raise HTTPException(status_code=404, detail="No existe esa ficha.")
                if previa[0][2]:
                    sin_onb = db.select("SELECT 1 FROM clients.clientes k " + _SIN_ONBOARDING + " AND k.id = $i", {"i": ficha_id})
                    if not sin_onb:
                        raise HTTPException(status_code=409, detail="Esa ficha ya tiene canal: ya se le hizo el onboarding.")
                    canal = canal_previo = previa[0][2].strip().lstrip("#").lower()
            if not canal_previo and db.select("SELECT 1 FROM clients.clientes WHERE lower(canal_discord) = $c LIMIT 1", {"c": canal}):
                raise HTTPException(status_code=409, detail=f"Ya hay un cliente con el canal #{canal}. Agregá el apellido o una inicial al nombre.")

        # 1. Sesión de onboarding, sin mail.
        s = _llamar("POST", "/api/admin/add-client", json={"name": nombre, "email": email, "plan": plan, "payment_mode": pago, "send_email": False})
        session_id = s["session_id"]
        canal = canal_previo or s.get("channel_slug") or canal

        # 2. Canal de Discord. Si falla, el alta sigue: se avisa y se puede crear a mano.
        invite, error_discord = None, None
        if not canal_previo:
            try:
                d = _llamar("POST", f"/api/admin/sessions/{session_id}/create-discord-channel")
                invite = d.get("discord_invite_url")
            except HTTPException as e:
                error_discord = e.detail

        # 3. Ficha del cliente en atv-clients: se completa la de la seña o se crea una nueva.
        plan_bd = PLANES[plan]
        hoy = date.today()
        with db_session:
            autor = Admin.get(id=yo)
            quien = (autor.nombre or autor.email) if autor else "el equipo"
            if ficha_id is not None:
                previa = db.select(f"SELECT {', '.join(_CAMPOS_FICHA)} FROM clients.clientes WHERE id = $i", {"i": ficha_id})[0]
                guardada = json.dumps({k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in zip(_CAMPOS_FICHA, previa)}, default=str)
                emails = json.loads(previa[1] or "[]") if previa[1] else []
                # El mail provisorio que deja el bot de Discord se reemplaza por el real.
                emails = [email] + [e for e in emails if e and e.lower() != email and not e.lower().endswith(_MAIL_PROVISORIO)]
                # El acceso corre desde el alta (cuando arranca el programa), no desde la seña.
                db.execute(
                    "UPDATE clients.clientes SET email = $email, emails_json = $emails, canal_discord = $canal, plan_actual = $plan, "
                    "fecha_inicio = $inicio, duracion_dias = $dur, fecha_vencimiento = $vence, estado_cliente = 'vigente', "
                    "observaciones = concat_ws(E'\n', nullif(observaciones, ''), $obs) WHERE id = $id",
                    {
                        "email": email, "emails": json.dumps(emails), "canal": canal, "plan": plan_bd, "inicio": hoy,
                        "dur": DURACION[plan_bd], "vence": hoy + timedelta(days=DURACION[plan_bd]),
                        "obs": f"Alta desde el classroom por {quien} (" + ("completó la ficha que ya estaba creada" if canal_previo else "completó la ficha de la seña") + ")",
                        "id": ficha_id,
                    },
                )
                fila = (ficha_id,)
            else:
                guardada = None
                fila = db.execute(
                    "INSERT INTO clients.clientes (nombre, email, emails_json, canal_discord, plan_actual, fecha_inicio, duracion_dias, "
                    "fecha_vencimiento, estado_cliente, total_pagado_usd, total_adeudado_usd, observaciones) "
                    "VALUES ($nombre, $email, $emails, $canal, $plan, $inicio, $dur, $vence, 'vigente', 0, 0, $obs) RETURNING id",
                    {
                        "nombre": nombre, "email": email, "emails": json.dumps([email]), "canal": canal, "plan": plan_bd,
                        "inicio": hoy, "dur": DURACION[plan_bd], "vence": hoy + timedelta(days=DURACION[plan_bd]),
                        "obs": f"Alta desde el classroom por {quien}",
                    },
                ).fetchone()
            # Su chat en el classroom, ya listo para que quien hizo el alta lo abra.
            from src.services.mensajeria_service import _canal_del_cliente

            _canal_del_cliente(fila[0])
            a = AltaCliente(
                cliente_id=fila[0], session_id=session_id, nombre=nombre, email=email, plan=plan, canal=canal,
                discord_invite_url=invite, discord_error=error_discord, creado_por=yo, ficha_previa=guardada,
            )
            a.flush()
            return _dict(a)

    def listar(self, sesion: dict) -> list[dict]:
        _equipo(sesion)
        with db_session:
            filas = list(AltaCliente.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."altas_clientes" ORDER BY creado_en DESC LIMIT 30'))
            return [_dict(a) for a in filas]

    def enviar_mail(self, sesion: dict, alta_id: int) -> dict:
        yo = _equipo(sesion)
        with db_session:
            # Candado por alta: dos clics a la vez no mandan dos mails.
            if not db.select("SELECT pg_try_advisory_xact_lock(7400000 + $i)", {"i": alta_id})[0]:
                raise HTTPException(status_code=409, detail="Ya se está mandando.")
            a = AltaCliente.get(id=alta_id)
            if a is None:
                raise HTTPException(status_code=404, detail="No existe esa alta.")
            if a.mail_enviado_en:
                raise HTTPException(status_code=409, detail="El link de onboarding ya se mandó.")
            _llamar("POST", f"/api/admin/sessions/{a.session_id}/send-onboarding-email")
            a.mail_enviado_en = datetime.utcnow()
            a.mail_enviado_por = yo
            return _dict(a)

    def anular(self, sesion: dict, alta_id: int) -> dict:
        """Para un error de carga (o una prueba): borra el canal de Discord, la sesión de onboarding, la
        ficha y el chat. Solo si el cliente todavía no empezó: sin mail mandado y sin mensajes suyos."""
        yo = _equipo(sesion)
        with db_session:
            a = AltaCliente.get(id=alta_id)
            if a is None:
                raise HTTPException(status_code=404, detail="No existe esa alta.")
            if sesion.get("rol") != "admin" and a.creado_por != yo:
                raise HTTPException(status_code=403, detail="Solo quien hizo el alta o un admin la puede anular.")
            if a.mail_enviado_en:
                raise HTTPException(status_code=409, detail="El cliente ya recibió el onboarding: no se puede anular desde acá.")
            escribio = db.select(
                f'SELECT 1 FROM "{DB_SCHEMA}"."mensajes_canal" m JOIN "{DB_SCHEMA}"."canales" c ON c.id = m.canal '
                "WHERE c.cliente_id = $c AND m.autor_tipo = 'cliente' LIMIT 1",
                {"c": a.cliente_id},
            )
            if escribio:
                raise HTTPException(status_code=409, detail="El cliente ya escribió en su chat: no se puede anular desde acá.")
            session_id, cliente_id = a.session_id, a.cliente_id
        _llamar("DELETE", f"/api/admin/sessions/{session_id}/cancel")
        with db_session:
            canales = db.select(f'SELECT id FROM "{DB_SCHEMA}"."canales" WHERE cliente_id = $c', {"c": cliente_id})
            for t, col in (("menciones", "canal_id"), ("mensajes_canal", "canal"), ("lecturas_canal", "canal_id"), ("cerebro_estado", "canal_id")):
                db.execute(f'DELETE FROM "{DB_SCHEMA}"."{t}" WHERE {col} = ANY($ids)', {"ids": list(canales)})
            db.execute(f'DELETE FROM "{DB_SCHEMA}"."canales" WHERE cliente_id = $c', {"c": cliente_id})
            db.execute(f'DELETE FROM "{DB_SCHEMA}"."sesiones" WHERE tipo = \'cliente\' AND usuario_id = $c', {"c": cliente_id})
            alta = AltaCliente.get(id=alta_id)
            if alta.ficha_previa:
                # La ficha era de una seña: vuelve a como estaba (con sus pagos), no se borra.
                previa = json.loads(alta.ficha_previa)
                db.execute(
                    "UPDATE clients.clientes SET " + ", ".join(f"{k} = ${k}" for k in _CAMPOS_FICHA) + " WHERE id = $id",
                    {**previa, "id": cliente_id},
                )
            else:
                db.execute("DELETE FROM clients.clientes WHERE id = $c AND observaciones LIKE 'Alta desde el classroom%'", {"c": cliente_id})
            alta.delete()
        return {"ok": True}
