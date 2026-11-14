"""Piloto: contesta a los clientes en la voz de cada persona del equipo.

Usa lo mismo que el Tab (perfil del cliente, hechos, la voz y las correcciones de esa persona, las clases)
más lo que se habló en sus llamadas de Fathom. Cada persona elige su modo:
- "borrador": la respuesta queda escrita en el chat y la persona la manda, la edita o la descarta;
- "automatico": sale sola, salvo los temas que la persona marcó (plata, bajas, dudas…), que quedan
  como borrador "para vos".

Quién contesta un chat: la última persona del equipo que escribió en él. Si nadie del equipo escribió
todavía, el piloto no se mete. Corre en el servidor con PILOTO=1 (main.py), cada PILOTO_CADA_SEG.
"""

import json
import logging
import re
from datetime import datetime, timedelta

from decouple import config
from fastapi import HTTPException
from pony.orm import db_session

from src.db import DB_SCHEMA, db
from src.models import Admin, Canal, Llamada, MensajeCanal, PilotoBorrador, PilotoConfig, ReglaVoz, SugerenciaIA
from src.services import aprendizaje_service as ap
from src.services import gasto_ia
from src.services import sugerencias_service as sug
from src.services.auth_service import es_equipo

logger = logging.getLogger("piloto")

MODELO = config("PILOTO_MODEL", default=sug.MODELO)
MODELO_TEMA = config("PILOTO_MODEL_TEMA", default="claude-haiku-5-5")
# El cliente suele mandar varios mensajes seguidos: se espera a que termine antes de contestar.
ESPERA_MIN = config("PILOTO_ESPERA_MIN", default=2, cast=int)
# Lo que quedó sin contestar hace más de esto ya no lo agarra el piloto: es de una persona.
VENTANA_HORAS = config("PILOTO_VENTANA_HORAS", default=48, cast=int)
POR_CICLO = config("PILOTO_POR_CICLO", default=8, cast=int)

MODOS = ("apagado", "borrador", "automatico")
TEMAS = ("dato", "estrategia", "plata", "baja_o_queja", "otro")
# "no_seguro" no es un tema: es cuando la IA no está segura o la respuesta podría inventar.
BLOQUEABLES = ("plata", "baja_o_queja", "estrategia", "no_seguro")
BLOQUEADOS_DEFECTO = ["plata", "baja_o_queja", "no_seguro"]
# Cómo se lee cada tema en el selector del chat.
ETIQUETA_TEMA = {"plata": "Plata y pagos", "baja_o_queja": "Bajas y quejas", "estrategia": "Estrategia y precios", "no_seguro": "Si no está seguro"}
NOMBRE_TEMA = {
    "plata": "plata y pagos",
    "baja_o_queja": "una baja o una queja",
    "estrategia": "estrategia y precios",
    "no_seguro": "no estaba seguro",
}


def _iso(m: datetime | None) -> str | None:
    return m.isoformat(timespec="seconds") + "Z" if m else None


# ---------- modo de cada persona ----------
def config_de(admin_id: int) -> dict:
    with db_session:
        c = PilotoConfig.get(admin_id=admin_id)
        if c is None:
            return {"modo": "apagado", "bloqueados": list(BLOQUEADOS_DEFECTO)}
        try:
            bloqueados = [b for b in json.loads(c.bloqueados_json or "null") if b in BLOQUEABLES] if c.bloqueados_json else list(BLOQUEADOS_DEFECTO)
        except ValueError:
            bloqueados = list(BLOQUEADOS_DEFECTO)
        return {"modo": c.modo if c.modo in MODOS else "apagado", "bloqueados": bloqueados}


def guardar_config(admin_id: int, modo: str | None, bloqueados: list[str] | None, por: int | None) -> dict:
    if modo is not None and modo not in MODOS:
        raise HTTPException(status_code=422, detail="El modo tiene que ser apagado, borrador o automatico.")
    if bloqueados is not None and any(b not in BLOQUEABLES for b in bloqueados):
        raise HTTPException(status_code=422, detail="Hay un tema que no existe.")
    with db_session:
        if Admin.get(id=admin_id) is None:
            raise HTTPException(status_code=404, detail="No existe esa persona del equipo.")
        c = PilotoConfig.get(admin_id=admin_id) or PilotoConfig(admin_id=admin_id)
        if modo is not None:
            c.modo = modo
        if bloqueados is not None:
            c.bloqueados_json = json.dumps(list(dict.fromkeys(bloqueados)))
        c.actualizado_en = datetime.utcnow()
        c.actualizado_por = por
    return config_de(admin_id)


# ---------- qué chats esperan respuesta ----------
def pendientes(ahora: datetime | None = None) -> list[tuple[int, int]]:
    """(canal, último mensaje del cliente) de los chats de clientes cuyo último mensaje es del cliente,
    dentro de la ventana, que ya dejó de escribir y que el piloto todavía no contestó."""
    ahora = ahora or datetime.utcnow()
    desde, hasta = ahora - timedelta(hours=VENTANA_HORAS), ahora - timedelta(minutes=ESPERA_MIN)
    with db_session:
        filas = db.select(
            f"""SELECT u.canal, u.id FROM (
                SELECT DISTINCT ON (m.canal) m.canal, m.id, m.autor_tipo, m.creado_en
                FROM "{DB_SCHEMA}"."mensajes_canal" m
                WHERE m.borrado = false AND m.id > 0
                ORDER BY m.canal, m.id DESC
            ) u
            JOIN "{DB_SCHEMA}"."canales" c ON c.id = u.canal
            WHERE c.tipo = 'cliente' AND NOT c.inactivo AND NOT c.pausa AND NOT c.vencido
              AND u.autor_tipo = 'cliente' AND u.creado_en BETWEEN $desde AND $hasta
              AND NOT EXISTS (SELECT 1 FROM "{DB_SCHEMA}"."piloto_borradores" b WHERE b.canal_id = u.canal AND b.hasta_mensaje_id >= u.id)
            ORDER BY u.creado_en
            """
        )
        return [(int(c), int(i)) for c, i in filas]


def responsable(canal_id: int) -> int | None:
    """La última persona del equipo que escribió en el chat, si sigue activa."""
    with db_session:
        fila = next(iter(db.select(
            f'SELECT autor_id FROM "{DB_SCHEMA}"."mensajes_canal" WHERE canal = $canal_id AND autor_tipo = \'admin\' '
            "AND borrado = false AND id > 0 ORDER BY id DESC LIMIT 1"
        )), None)
        if fila is None:
            return None
        a = Admin.get(id=int(fila))
        return a.id if a and a.activo and not a.borrado else None


# ---------- escribir la respuesta ----------
def _llamadas_del_cliente(cliente_id: int | None, maximo: int = 3) -> list[dict]:
    if not cliente_id:
        return []
    with db_session:
        filas = list(Llamada.select_by_sql(
            f'SELECT * FROM "{DB_SCHEMA}"."llamadas" WHERE cliente_id = $cliente_id ORDER BY inicio DESC NULLS LAST LIMIT $maximo'
        ))
        salida = []
        for l in filas:
            puntos = ""
            if l.puntos_json:
                try:
                    datos = json.loads(l.puntos_json)
                    items = datos if isinstance(datos, list) else sum((v for v in datos.values() if isinstance(v, list)), [])
                    puntos = "; ".join(str(p.get("texto") if isinstance(p, dict) else p) for p in items)[:1200]
                except (ValueError, AttributeError, TypeError):
                    puntos = ""
            salida.append({
                "titulo": l.titulo or "Llamada",
                "fecha": l.inicio.date().isoformat() if l.inicio else None,
                "texto": puntos or (l.resumen or "")[:1200],
            })
        return [s for s in salida if s["texto"]]


def _pedir(sistema: str | None, usuario: str, modelo: str, max_tokens: int, uso: str) -> str:
    from anthropic import Anthropic

    cliente = Anthropic(api_key=config("ANTHROPIC_API_KEY", default=""), timeout=40)
    r = cliente.messages.create(
        model=modelo,
        max_tokens=max_tokens,
        thinking={"type": "disabled"} if "haiku" in modelo else {"type": "between_tools"},
        **({"system": sistema} if sistema else {}),
        messages=[{"role": "user", "content": usuario}],
    )
    try:
        gasto_ia.registrar(uso, r.usage)
    except Exception:  # el registro nunca corta una respuesta
        pass
    return "".join(getattr(b, "text", "") for b in r.content)


def limpiar_respuesta(texto: str, permitidos: set[str] | None) -> str:
    t = (texto or "").strip().strip('"“”').strip()
    marca = sug._MARCA.search(t)
    if marca:
        t = t[: marca.start()].rstrip()
    return sug.filtrar_emojis(t, permitidos).strip()


_JSON = re.compile(r"\{.*\}", re.S)


def clasificar(pedido: str, respuesta: str, pedir=_pedir) -> dict:
    """De qué trata el pedido del cliente y si la respuesta se apoya en lo que se sabe. La IA da los datos;
    qué se hace con ellos lo decide el código (ver decidir)."""
    usuario = (
        "Un cliente le escribió a su coach y hay una respuesta propuesta. Devolvé SOLO un JSON con dos campos:\n"
        '{"tema": uno de "dato", "estrategia", "plata", "baja_o_queja", "otro"; "seguro": true o false}\n'
        "- dato: pregunta dónde está algo, un link, un horario, cómo se usa la plataforma, o solo agradece.\n"
        "- estrategia: precios, ofertas, decisiones del negocio, qué hacer con su contenido o sus ventas.\n"
        "- plata: pagos, cuotas, facturas, reembolsos, descuentos.\n"
        "- baja_o_queja: quiere irse, pausar o cancelar, está molesto o se queja.\n"
        "- seguro: false si la respuesta afirma algo que no está en el pedido del cliente ni es general, o si el pedido es ambiguo.\n\n"
        f"Pedido del cliente:\n{pedido[:2000]}\n\nRespuesta propuesta:\n{respuesta[:2000]}"
    )
    try:
        crudo = pedir(None, usuario, MODELO_TEMA, 60, "piloto:tema")
        datos = json.loads(_JSON.search(crudo).group(0))
        tema = datos.get("tema") if datos.get("tema") in TEMAS else "otro"
        return {"tema": tema, "seguro": datos.get("seguro") is True}
    except Exception:
        return {"tema": "otro", "seguro": False}


def decidir(modo: str, bloqueados: list[str], tema: str, seguro: bool) -> tuple[bool, str | None]:
    """¿Sale solo? Devuelve (sale, motivo por el que no sale)."""
    if modo != "automatico":
        return False, None
    if tema in bloqueados:
        return False, NOMBRE_TEMA.get(tema, tema)
    if not seguro and "no_seguro" in bloqueados:
        return False, NOMBRE_TEMA["no_seguro"]
    return True, None


def generar(canal_id: int, admin_id: int, pedir=_pedir) -> dict | None:
    """La respuesta en la voz de admin_id al último pedido del cliente, o None si no corresponde contestar."""
    with db_session:
        canal = Canal.get(id=canal_id)
        yo = Admin.get(id=admin_id)
        if canal is None or yo is None:
            return None
        # Con la voz que esa persona eligió para el Tab (por defecto, la propia), igual que cuando escribe.
        voz = Admin.get(id=yo.voz_tab) if yo.voz_tab else None
        voz = voz if voz and voz.activo else yo
        voz_id, nombre, yo_nombre = voz.id, voz.nombre or "el coach", yo.nombre or voz.nombre or "el coach"
        cliente_id = canal.cliente_id
        canal_nombre = canal.nombre
    ctx = ap.contexto_para_responder(canal_id, voz_id, incluir_nicho=False)
    if not ctx:
        return None
    ctx["cliente_nombre"] = canal_nombre
    ctx["voz_nombre"], ctx["yo_nombre"] = nombre, yo_nombre
    with db_session:
        ctx["equipo"] = [a.nombre for a in Admin.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."admins" WHERE activo AND nombre IS NOT NULL')]
        ctx["reglas"] = [r.texto for r in ReglaVoz.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."cerebro_reglas_voz" WHERE voz_id = $voz_id ORDER BY id DESC')]
    entiende = sug.entendimiento(ctx, "", len(ctx["reglas"]))
    # Otra persona del equipo lleva el hilo, le habló a otro (lo etiquetó) o el último mensaje no es del
    # cliente: el piloto no contesta.
    if entiende["modo"] in ("hilo-de-otro", "para-otro", "seguimiento", "primero"):
        return None
    nicho = sug._nicho((ctx.get("perfil") or {}).get("nicho"))
    sistema, usuario = sug.armar_prompt(nombre.split()[0], ctx, "", nicho)
    llamadas = _llamadas_del_cliente(cliente_id)
    if llamadas:
        usuario += "\n\nLo que se habló en sus últimas llamadas (Fathom). Usalo si sirve para contestar; no inventes nada que no esté acá:\n" + "\n".join(
            f"- {l['titulo']} ({l['fecha'] or 'sin fecha'}): {l['texto']}" for l in llamadas
        )
    permitidos = sug.emojis_de((ctx.get("voz") or {}).get("rasgos") or {})
    texto = limpiar_respuesta(pedir(sistema, usuario, MODELO, 400, "piloto"), permitidos)
    if not texto:
        return None
    pendientes_cliente = sug.pendientes_del_cliente([m for m in ctx.get("conversacion") or [] if m.get("texto") or m.get("archivos")])
    pedido = "\n".join(m.get("texto") or "(mandó un archivo)" for m in pendientes_cliente) or entiende.get("retoma") or ""
    tema = clasificar(pedido, texto, pedir=pedir)
    fuentes = ["su voz y sus correcciones"]
    if ctx.get("perfil"):
        fuentes.append("lo que sabemos del cliente")
    if llamadas:
        fuentes.append(f"{len(llamadas)} llamada{'s' if len(llamadas) > 1 else ''} de Fathom")
    if sug.clases_relacionadas(ctx):
        fuentes.append("las clases del classroom")
    return {"texto": texto, "tema": tema["tema"], "seguro": tema["seguro"], "fuentes": fuentes, "voz_id": voz_id}


def _sesion_de(admin_id: int) -> dict:
    with db_session:
        a = Admin.get(id=admin_id)
        return {"usuario_id": a.id, "rol": a.rol if a.rol in ("admin", "coach") else "coach", "nombre": a.nombre or a.email}


def _vencer_viejos(canal_id: int) -> None:
    """Un borrador pendiente deja de valer si alguien del equipo contestó a mano o llegó uno más nuevo."""
    with db_session:
        ultimo_equipo = next(iter(db.select(
            f'SELECT max(id) FROM "{DB_SCHEMA}"."mensajes_canal" WHERE canal = $canal_id AND autor_tipo = \'admin\' AND borrado = false'
        )), None) or 0
        for b in PilotoBorrador.select_by_sql(
            f'SELECT * FROM "{DB_SCHEMA}"."piloto_borradores" WHERE canal_id = $canal_id AND estado = \'pendiente\' ORDER BY id'
        ):
            if b.hasta_mensaje_id < ultimo_equipo:
                b.estado, b.resuelto_en = "vencido", datetime.utcnow()


def procesar(canal_id: int, hasta_id: int, pedir=_pedir, enviar=None) -> dict | None:
    """Escribe la respuesta de un chat. Devuelve un evento para avisar en vivo ({"tipo": "mensaje"|"borrador", …})."""
    admin_id = responsable(canal_id)
    if admin_id is None:
        return None
    cfg = config_de(admin_id)
    if cfg["modo"] == "apagado":
        return None
    r = generar(canal_id, admin_id, pedir=pedir)
    with db_session:
        # Ya hay uno más nuevo o alguien contestó mientras escribía: no se pisa nada.
        if r is None:
            PilotoBorrador(canal_id=canal_id, admin_id=admin_id, hasta_mensaje_id=hasta_id, texto="(sin respuesta)", estado="vencido", resuelto_en=datetime.utcnow(), motivo="no correspondía contestar")
            return None
        for viejo in PilotoBorrador.select_by_sql(
            f'SELECT * FROM "{DB_SCHEMA}"."piloto_borradores" WHERE canal_id = $canal_id AND estado = \'pendiente\''
        ):
            viejo.estado, viejo.resuelto_en = "vencido", datetime.utcnow()
        sale, motivo = decidir(cfg["modo"], cfg["bloqueados"], r["tema"], r["seguro"])
        b = PilotoBorrador(
            canal_id=canal_id, admin_id=admin_id, voz_id=r["voz_id"], hasta_mensaje_id=hasta_id, texto=r["texto"][:4000], tema=r["tema"], seguro=r["seguro"],
            para_vos=cfg["modo"] == "automatico" and not sale, motivo=motivo, fuentes_json=json.dumps(r["fuentes"], ensure_ascii=False),
        )
        b.flush()
        bid = b.id
    if not sale:
        return {"tipo": "borrador", "canal_id": canal_id, "admin_id": admin_id, "borrador_id": bid, "para_vos": cfg["modo"] == "automatico"}
    enviar = enviar or _enviar_como
    try:
        mensaje, canal = enviar(admin_id, canal_id, r["texto"])
    except HTTPException as e:
        logger.warning("Piloto: no se pudo mandar en el canal %s: %s", canal_id, e.detail)
        with db_session:
            PilotoBorrador[bid].para_vos, PilotoBorrador[bid].motivo = True, "no se pudo mandar"
        return {"tipo": "borrador", "canal_id": canal_id, "admin_id": admin_id, "borrador_id": bid, "para_vos": True}
    with db_session:
        b = PilotoBorrador[bid]
        b.estado, b.mensaje_id, b.texto_final, b.cambio_pct, b.resuelto_en = "automatico", mensaje["id"], r["texto"][:4000], 0, datetime.utcnow()
    return {"tipo": "mensaje", "canal_id": canal_id, "mensaje": mensaje, "canal": canal}


def info_canal(canal_id: int) -> dict:
    from src.services.mensajeria_service import _info

    with db_session:
        return _info(Canal[canal_id])


def _enviar_como(admin_id: int, canal_id: int, texto: str) -> tuple[dict, dict]:
    from src.services.mensajeria_service import MensajeriaServices

    return MensajeriaServices().enviar(_sesion_de(admin_id), canal_id, texto, None)


def ciclo(pedir=_pedir, enviar=None, ahora: datetime | None = None) -> list[dict]:
    """Una vuelta: contesta hasta POR_CICLO chats. Cada chat que falla no frena a los demás."""
    eventos = []
    for canal_id, hasta_id in pendientes(ahora)[:POR_CICLO]:
        try:
            _vencer_viejos(canal_id)
            ev = procesar(canal_id, hasta_id, pedir=pedir, enviar=enviar)
            if ev:
                eventos.append(ev)
        except Exception:
            logger.exception("Piloto: falló el canal %s", canal_id)
    return eventos


# ---------- lo que usa la pantalla del chat ----------
def _borrador_dict(b: PilotoBorrador) -> dict:
    try:
        fuentes = json.loads(b.fuentes_json or "[]")
    except ValueError:
        fuentes = []
    return {
        "id": b.id, "canal_id": b.canal_id, "admin_id": b.admin_id, "texto": b.texto, "tema": b.tema, "seguro": b.seguro,
        "para_vos": b.para_vos, "motivo": b.motivo, "fuentes": fuentes, "estado": b.estado, "creado_en": _iso(b.creado_en),
    }


class PilotoServices:
    def _solo_equipo(self, sesion: dict) -> None:
        if not es_equipo(sesion):
            raise HTTPException(status_code=403, detail="Solo para el equipo.")

    def mi_modo(self, sesion: dict) -> dict:
        self._solo_equipo(sesion)
        return {**config_de(sesion["usuario_id"]), "bloqueables": [{"id": b, "nombre": ETIQUETA_TEMA[b]} for b in BLOQUEABLES]}

    def cambiar_mi_modo(self, sesion: dict, modo: str | None, bloqueados: list[str] | None) -> dict:
        self._solo_equipo(sesion)
        return guardar_config(sesion["usuario_id"], modo, bloqueados, sesion["usuario_id"])

    def del_canal(self, sesion: dict, canal_id: int) -> dict:
        """El borrador pendiente del chat (si hay), qué mensajes salieron solos y el modo de quien mira."""
        self._solo_equipo(sesion)
        from src.services.mensajeria_service import _canal_visible

        with db_session:
            _canal_visible(sesion, canal_id)
        _vencer_viejos(canal_id)
        with db_session:
            b = next(iter(PilotoBorrador.select_by_sql(
                f'SELECT * FROM "{DB_SCHEMA}"."piloto_borradores" WHERE canal_id = $canal_id AND estado = \'pendiente\' ORDER BY id DESC LIMIT 1'
            )), None)
            borrador = None
            if b is not None:
                borrador = _borrador_dict(b)
                voz = Admin.get(id=b.voz_id or b.admin_id)
                quien = Admin.get(id=b.admin_id)
                borrador["voz_nombre"] = (voz.nombre or "").split(" ")[0] if voz else None
                borrador["de_nombre"] = (quien.nombre or "").split(" ")[0] if quien else None
                borrador["mio"] = b.admin_id == sesion["usuario_id"]
            marcas = {}
            for mid, voz_id, admin_id in db.select(
                f'SELECT mensaje_id, voz_id, admin_id FROM "{DB_SCHEMA}"."piloto_borradores" '
                f"WHERE canal_id = $canal_id AND estado = 'automatico' AND mensaje_id IS NOT NULL ORDER BY id DESC LIMIT 300"
            ):
                v = Admin.get(id=voz_id or admin_id)
                marcas[str(mid)] = (v.nombre or "").split(" ")[0] if v else None
        return {"borrador": borrador, "marcas": marcas, **config_de(sesion["usuario_id"])}

    def _pendiente(self, sesion: dict, borrador_id: int) -> PilotoBorrador:
        b = PilotoBorrador.get(id=borrador_id)
        if b is None or b.estado != "pendiente":
            raise HTTPException(status_code=404, detail="Ese borrador ya no está: alguien lo mandó o lo descartó.")
        from src.services.mensajeria_service import _canal_visible

        _canal_visible(sesion, b.canal_id)
        return b

    def enviar(self, sesion: dict, borrador_id: int, texto: str | None) -> tuple[dict, dict]:
        """Lo manda quien lo aprueba, con lo que haya editado. La diferencia con lo propuesto enseña la voz."""
        self._solo_equipo(sesion)
        with db_session:
            b = self._pendiente(sesion, borrador_id)
            propuesto, canal_id = b.texto, b.canal_id
        final = (texto if texto is not None else propuesto).strip()
        if not final:
            raise HTTPException(status_code=422, detail="El mensaje está vacío.")
        from src.services.mensajeria_service import MensajeriaServices

        mensaje, canal = MensajeriaServices().enviar(sesion, canal_id, final, None)
        cambio = ap.cambio_pct(propuesto, final)
        with db_session:
            b = PilotoBorrador[borrador_id]
            b.estado = "enviado" if cambio == 0 else "editado"
            b.mensaje_id, b.texto_final, b.cambio_pct, b.resuelto_en = mensaje["id"], final[:4000], cambio, datetime.utcnow()
            if b.admin_id == sesion["usuario_id"]:
                # Como una sugerencia del Tab usada: la corrección alimenta la voz de quien escribe.
                SugerenciaIA(admin_id=b.admin_id, canal_id=canal_id, sugerencia=propuesto[:2000], usada=True, modelo=f"piloto:{MODELO}",
                             voz_id=b.voz_id or b.admin_id, enviado=final[:4000], mensaje_id=mensaje["id"], cambio_pct=cambio)
        return mensaje, canal

    def descartar(self, sesion: dict, borrador_id: int) -> dict:
        self._solo_equipo(sesion)
        with db_session:
            b = self._pendiente(sesion, borrador_id)
            b.estado, b.resuelto_en = "descartado", datetime.utcnow()
            canal_id = b.canal_id
        return info_canal(canal_id)


def resumen(ahora: datetime | None = None) -> dict:
    """Para Leverage: el modo de cada persona, lo de hoy y lo que quedó para el equipo."""
    ahora = ahora or datetime.utcnow()
    inicio = ahora.replace(hour=3, minute=0, second=0, microsecond=0)  # medianoche de Argentina en UTC
    if inicio > ahora:
        inicio -= timedelta(days=1)
    with db_session:
        equipo = list(Admin.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."admins" WHERE activo AND NOT borrado ORDER BY nombre'))
        modos = [{"admin_id": a.id, "nombre": a.nombre or a.email, **config_de(a.id)} for a in equipo]
        cuentas = dict(db.select(
            f'SELECT estado, count(*) FROM "{DB_SCHEMA}"."piloto_borradores" WHERE creado_en >= $inicio AND estado <> \'vencido\' GROUP BY estado'
        ))
        para_vos = []
        for b in PilotoBorrador.select_by_sql(
            f'SELECT * FROM "{DB_SCHEMA}"."piloto_borradores" WHERE estado = \'pendiente\' AND para_vos ORDER BY id DESC LIMIT 20'
        ):
            canal = Canal.get(id=b.canal_id)
            para_vos.append({"canal_id": b.canal_id, "cliente": canal.nombre if canal else None, "motivo": b.motivo, "creado_en": _iso(b.creado_en)})
        pendientes_borrador = int(cuentas.get("pendiente", 0))
    return {
        "modos": modos,
        "hoy": {
            "automatico": int(cuentas.get("automatico", 0)),
            "enviado": int(cuentas.get("enviado", 0)),
            "editado": int(cuentas.get("editado", 0)),
            "descartado": int(cuentas.get("descartado", 0)),
            "pendiente": pendientes_borrador,
        },
        "para_vos": para_vos,
    }


# ---------- Para Leverage: los borradores pendientes y mandarlos con el OK del dueño ----------
def borradores_pendientes(limite: int = 50) -> list[dict]:
    """Lo que espera que alguien lo apruebe, con lo que escribió el cliente para que se entienda sin abrir el chat."""
    salida = []
    with db_session:
        canales = [int(c) for c in db.select(f'SELECT DISTINCT canal_id FROM "{DB_SCHEMA}"."piloto_borradores" WHERE estado = \'pendiente\'')]
    for canal_id in canales:
        _vencer_viejos(canal_id)
    with db_session:
        for b in PilotoBorrador.select_by_sql(
            f'SELECT * FROM "{DB_SCHEMA}"."piloto_borradores" WHERE estado = \'pendiente\' ORDER BY id LIMIT $limite'
        ):
            canal = Canal.get(id=b.canal_id)
            quien = Admin.get(id=b.admin_id)
            voz = Admin.get(id=b.voz_id or b.admin_id)
            hasta = b.hasta_mensaje_id
            cid = b.canal_id
            del_cliente = [m.texto or "(mandó un archivo)" for m in MensajeCanal.select_by_sql(
                f'SELECT * FROM "{DB_SCHEMA}"."mensajes_canal" WHERE canal = $cid AND autor_tipo = \'cliente\' AND NOT borrado '
                f"AND id <= $hasta AND id > coalesce((SELECT max(id) FROM \"{DB_SCHEMA}\".\"mensajes_canal\" WHERE canal = $cid AND autor_tipo = 'admin' AND id < $hasta AND NOT borrado), 0) "
                "ORDER BY id DESC LIMIT 4"
            )][::-1]
            datos = _borrador_dict(b)
            datos.update(
                cliente=canal.nombre if canal else None,
                coach=(quien.nombre or quien.email) if quien else None,
                voz=(voz.nombre or "").split(" ")[0] if voz else None,
                cliente_escribio=[t[:600] for t in del_cliente],
            )
            salida.append(datos)
    return salida


def preparar_por_persona(admin_id: int, texto: str, canal_id: int | None = None, cliente_id: int | None = None) -> dict:
    """Un mensaje que alguien del equipo le pidió a su CSM de Leverage que mande: queda como borrador pendiente a su
    nombre, con el botón para mandarlo en su Bandeja de Leverage (y en el classroom, como cualquier borrador del piloto).
    No sale hasta que esa persona lo aprueba."""
    texto = (texto or "").strip()
    if not texto:
        raise HTTPException(status_code=422, detail="El mensaje está vacío.")
    with db_session:
        if canal_id is None and cliente_id is not None:
            canal = Canal.select_by_sql(
                f'SELECT * FROM "{DB_SCHEMA}"."canales" WHERE tipo = \'cliente\' AND cliente_id = $cliente_id ORDER BY id LIMIT 1'
            )
            canal = canal[0] if canal else None
        else:
            canal = Canal.get(id=canal_id) if canal_id is not None else None
        if canal is None or canal.tipo != "cliente":
            raise HTTPException(status_code=404, detail="Ese cliente no tiene chat en el classroom.")
        cid = canal.id
        # Vale hasta que alguien del equipo escriba en ese chat: ahí se vence, como los borradores del piloto.
        hasta = next(iter(db.select(f'SELECT max(id) FROM "{DB_SCHEMA}"."mensajes_canal" WHERE canal = $cid')), None) or 0
        b = PilotoBorrador(
            canal_id=cid, admin_id=admin_id, hasta_mensaje_id=hasta, texto=texto[:4000], tema="otro", seguro=True,
            para_vos=False, motivo="Lo dejó listo tu CSM en Leverage", fuentes_json=json.dumps(["leverage"]),
        )
        db.flush()
        quien = Admin.get(id=admin_id)
        datos = _borrador_dict(b)
        datos.update(cliente=canal.nombre, coach=(quien.nombre or quien.email) if quien else None, voz=None, cliente_escribio=[])
    return datos


def enviar_por_agente(borrador_id: int, texto: str | None) -> tuple[dict, dict]:
    """Lo aprobó el dueño desde Leverage: sale en nombre de quien lleva el chat, con lo que haya corregido."""
    with db_session:
        b = PilotoBorrador.get(id=borrador_id)
        if b is None or b.estado != "pendiente":
            raise HTTPException(status_code=404, detail="Ese borrador ya no está: alguien lo mandó, lo descartó o contestó a mano.")
        propuesto, canal_id, admin_id = b.texto, b.canal_id, b.admin_id
    final = (texto if texto is not None else propuesto).strip()
    if not final:
        raise HTTPException(status_code=422, detail="El mensaje está vacío.")
    mensaje, canal = _enviar_como(admin_id, canal_id, final)
    cambio = ap.cambio_pct(propuesto, final)
    with db_session:
        b = PilotoBorrador[borrador_id]
        b.estado = "enviado" if cambio == 0 else "editado"
        b.mensaje_id, b.texto_final, b.cambio_pct, b.resuelto_en = mensaje["id"], final[:4000], cambio, datetime.utcnow()
    return mensaje, canal


def descartar_por_agente(borrador_id: int) -> dict:
    with db_session:
        b = PilotoBorrador.get(id=borrador_id)
        if b is None or b.estado != "pendiente":
            raise HTTPException(status_code=404, detail="Ese borrador ya no está.")
        b.estado, b.resuelto_en = "descartado", datetime.utcnow()
        canal_id = b.canal_id
    return info_canal(canal_id)
