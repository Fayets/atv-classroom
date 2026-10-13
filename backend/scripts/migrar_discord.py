"""Trae el historial de Discord (los transcripts que guarda atv-clients) a los chats del classroom.

Así los clientes siguen el hilo donde lo dejaron y el cerebro aprende de toda la historia.

- Lee <carpeta>/<programa>/<canal>/<canal>.txt y busca a qué cliente es cada canal en
  clients.discord_transcripts. Los canales sin cliente se informan y no se tocan.
- Quién es del equipo: los que escriben en muchos canales de clientes. Los que tienen cuenta en el
  classroom quedan atados a su cuenta (así el Tab aprende su voz); los demás conservan su nombre.
- El historial entra con ids NEGATIVOS, en orden de fecha: queda antes de lo escrito en el classroom,
  nunca cuenta como no leído ni como "espera respuesta", y se reconoce para poder reimportarlo.
- Las imágenes que atv-clients guardó se copian como adjuntos; audios y otros archivos de Discord
  (cuyos links ya vencieron) quedan como una nota en el mensaje.
- Se puede correr varias veces: cada corrida reemplaza todo el historial importado antes.

Uso (dentro del contenedor del backend):
    python -m scripts.migrar_discord /tmp/discord            # solo muestra qué haría
    python -m scripts.migrar_discord /tmp/discord --aplicar  # importa
Opciones: --mapa=canal=cliente_id,...  (ata canales sin cliente)  ·  --alias="Viejo=Nuevo,..." (misma persona)
"""

import json
import mimetypes
import re
import shutil
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote, urlparse

from pony.orm import db_session

from src.db import DB_SCHEMA, db, init_db

UMBRAL_EQUIPO = 8  # escribe en al menos tantos canales de clientes → es del equipo
# Nombre en Discord → nombre de su cuenta en el classroom (para atar su historial a su cuenta).
CUENTA_DE = {
    "Franco": "Franco",
    "Fayet": "Franco",
    "Juan Pablo": "Juampi",
    "Nick Xanderz": "Nick",
    "Lucas": "Lucas",
    "juancarrizo": "Juan Cruz",
    "Maite": "Maite",
}
# Del equipo aunque escriban en pocos canales.
EQUIPO_SIEMPRE = {"Fayet", "Maite", "Juan"}
NOMBRE_VISIBLE = {"thiagoazcc": "Thiago", "FedeGM": "Fede", "juancarrizo": "Juan Cruz"}
PROGRAMAS_SIN_CLIENTE = {"updates"}
PROGRAMAS = {"advantage", "avanzados", "boost", "mentoria", "principiantes", "updates"}

_CABECERA = re.compile(r"^\[(\d{4}-\d\d-\d\d \d\d:\d\d)\] (.+)$")


def parsear(ruta: Path) -> list[dict]:
    """Mensajes de un transcript: fecha (UTC), autor, texto y links de adjuntos."""
    mensajes, actual, en_cuerpo = [], None, False
    for linea in ruta.read_text(encoding="utf-8", errors="replace").splitlines():
        if not en_cuerpo:
            en_cuerpo = linea.startswith("=====")
            continue
        m = _CABECERA.match(linea)
        if m:
            actual = {"fecha": datetime.strptime(m.group(1), "%Y-%m-%d %H:%M"), "autor": m.group(2).strip(), "lineas": [], "adjuntos": []}
            mensajes.append(actual)
        elif actual is not None:
            if linea.startswith("  📎 "):
                actual["adjuntos"].append(linea.split("📎", 1)[1].strip())
            else:
                actual["lineas"].append(linea)
    for m in mensajes:
        m["texto"] = "\n".join(m.pop("lineas")).strip()
    return mensajes


def limpiar_texto(texto: str, directorio: dict) -> str:
    usuarios, roles, canales = directorio.get("usuarios", {}), directorio.get("roles", {}), directorio.get("canales", {})
    texto = re.sub(r"<@!?(\d+)>", lambda m: "@" + usuarios.get(m.group(1), "alguien"), texto)
    texto = re.sub(r"<@&(\d+)>", lambda m: "@" + roles.get(m.group(1), "equipo"), texto)
    texto = re.sub(r"<#(\d+)>", lambda m: "#" + canales.get(m.group(1), "canal"), texto)
    texto = re.sub(r"<a?:(\w+):\d+>", r":\1:", texto)
    return texto.strip()


def archivo_del_adjunto(url: str, carpeta_canal: Path) -> tuple[str, Path | None]:
    """Nombre del archivo y, si atv-clients lo guardó, dónde está."""
    partes = urlparse(url).path.split("/")
    nombre = unquote(partes[-1]) if partes else "archivo"
    adj_id = partes[-2] if len(partes) >= 2 else ""
    local = carpeta_canal / "adjuntos" / f"{adj_id}_{nombre}"
    return nombre, (local if local.exists() else None)


def nota_de_adjunto(nombre: str) -> str:
    if nombre.startswith("voice-message") or nombre.lower().endswith((".ogg", ".mp3", ".m4a", ".wav")):
        return "🎙️ Audio de Discord (no quedó guardado)"
    return f"📎 {nombre} (archivo de Discord que no quedó guardado)"


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    carpeta = Path(sys.argv[1])
    aplicar = "--aplicar" in sys.argv
    # --mapa canal=cliente_id: ata un canal a un cliente a mano (para probar o corregir uno suelto).
    mapa_manual, alias = {}, {}
    for arg in sys.argv[2:]:
        # --alias="Emi=Emi Enrique,Juan=juancarrizo": la misma persona con otro nombre en Discord.
        if arg.startswith("--alias="):
            for par in arg[len("--alias="):].split(","):
                viejo, _, nuevo = par.partition("=")
                alias[viejo.strip()] = nuevo.strip()
        if arg.startswith("--mapa="):
            for par in arg[len("--mapa="):].split(","):
                canal, _, cid = par.partition("=")
                mapa_manual[canal.strip()] = int(cid)
    init_db()
    from src.models import Adjunto, Admin, Canal, ClienteExterno, EstadoAprendizaje, HechoCerebro, MensajeCanal, PerfilCliente
    from src.storage import adjuntos as almacen

    directorio = {}
    candidatos = sorted(carpeta.rglob("_directorio.json"), key=lambda p: len(p.parts))
    if candidatos:
        directorio = json.loads(candidatos[0].read_text(encoding="utf-8"))

    with db_session:
        filas = db.select("SELECT categoria, canal, cliente_id FROM clients.discord_transcripts")
        cliente_de = {(c, n): cid for c, n, cid in filas}
        cliente_por_canal = {n: cid for c, n, cid in filas if cid}
        cuentas = {}
        for a in list(Admin.select()):
            if a.activo and a.nombre:
                cuentas.setdefault(a.nombre, a.id)
        nombres_cliente = {c.id: (c.nombre or c.email) for c in list(ClienteExterno.select())}

    # 1) Leer todo
    transcripts, sin_cliente = [], set()
    for txt in sorted(carpeta.rglob("*.txt")):
        if "adjuntos" in txt.parts:
            continue
        # <programa>/<canal>/<canal>.txt (actual) o <programa>/<canal>.txt (viejo), a cualquier profundidad.
        canal = txt.parent.name if txt.parent.name == txt.stem else txt.stem
        ancestros = [p.name for p in txt.parents]
        programa = next((a for a in ancestros if a in PROGRAMAS), txt.parent.parent.name)
        if programa in PROGRAMAS_SIN_CLIENTE:
            continue
        cid = mapa_manual.get(canal) or cliente_de.get((programa, canal)) or cliente_por_canal.get(canal)
        if not cid:
            sin_cliente.add(f"{programa}/{canal}")
            continue
        mensajes = parsear(txt)
        for m in mensajes:
            m["autor"] = alias.get(m["autor"], m["autor"])
        transcripts.append({"programa": programa, "canal": canal, "cliente_id": cid, "carpeta": txt.parent, "mensajes": mensajes})

    canales_de_autor = defaultdict(set)
    for t in transcripts:
        for m in t["mensajes"]:
            canales_de_autor[m["autor"]].add(t["cliente_id"])
    equipo = {a for a, cs in canales_de_autor.items() if len(cs) >= UMBRAL_EQUIPO} | (EQUIPO_SIEMPRE & set(canales_de_autor))

    # 2) Armar los mensajes del classroom (sin duplicados por cliente) y ordenarlos por fecha
    todos, vistos = [], set()
    adj_guardados = adj_perdidos = 0
    por_cliente = Counter()
    for orden_archivo, t in enumerate(transcripts):
        for orden, m in enumerate(t["mensajes"]):
            texto = limpiar_texto(m["texto"], directorio)
            archivos, notas = [], []
            for url in m["adjuntos"]:
                nombre, local = archivo_del_adjunto(url, t["carpeta"])
                if local is not None and almacen.tipo_permitido(nombre):
                    archivos.append((nombre, local))
                    adj_guardados += 1
                else:
                    notas.append(nota_de_adjunto(nombre))
                    adj_perdidos += 1
            if notas:
                texto = (texto + "\n" if texto else "") + "\n".join(notas)
            if not texto and not archivos:
                continue
            clave = (t["cliente_id"], m["fecha"], m["autor"], " ".join(texto.split()))
            if clave in vistos:
                continue
            vistos.add(clave)
            es_equipo = m["autor"] in equipo
            admin_id = cuentas.get(CUENTA_DE.get(m["autor"], "")) if es_equipo else None
            todos.append({
                "orden": (m["fecha"], orden_archivo, orden),
                "cliente_id": t["cliente_id"],
                "autor_tipo": "admin" if es_equipo else "cliente",
                "autor_id": (admin_id or 0) if es_equipo else t["cliente_id"],
                "autor_nombre": NOMBRE_VISIBLE.get(m["autor"], m["autor"]),
                "texto": texto or None,
                "fecha": m["fecha"],
                "archivos": archivos,
            })
            por_cliente[t["cliente_id"]] += 1
    todos.sort(key=lambda x: x["orden"])
    for i, x in enumerate(todos):
        x["id"] = -(len(todos) - i)  # el más viejo, el más negativo

    # 3) Reporte
    print(f"Transcripts con cliente: {len(transcripts)} · mensajes a importar: {len(todos)} · clientes: {len(por_cliente)}")
    if todos:
        print(f"Desde {todos[0]['fecha']:%Y-%m-%d} hasta {todos[-1]['fecha']:%Y-%m-%d} (hora UTC)")
    print(f"Imágenes que se copian: {adj_guardados} · adjuntos que quedan como nota (audios, links vencidos): {adj_perdidos}")
    print("\nEquipo (escriben en muchos canales):")
    for a in sorted(equipo, key=lambda a: -len(canales_de_autor[a])):
        cuenta = CUENTA_DE.get(a)
        destino = f"cuenta '{cuenta}'" if cuenta and cuentas.get(cuenta) else "sin cuenta: queda con su nombre"
        print(f"  {a:22s} {len(canales_de_autor[a]):3d} canales → {destino}")
    dudosos = sorted((a for a, cs in canales_de_autor.items() if a not in equipo and len(cs) >= 2), key=lambda a: -len(canales_de_autor[a]))
    if dudosos:
        print("\nEscriben en 2 o más canales pero se toman como CLIENTES (revisar):")
        for a in dudosos:
            print(f"  {a:22s} {len(canales_de_autor[a]):3d} canales")
    if sin_cliente:
        print(f"\nCanales sin cliente en atv-clients (no se importan): {', '.join(sorted(sin_cliente))}")
    print("\nMensajes por cliente (los 10 con más):")
    for cid, n in por_cliente.most_common(10):
        print(f"  {nombres_cliente.get(cid, cid)}: {n}")

    if not aplicar:
        print("\nNo se escribió nada. Para importar: agregá --aplicar")
        return

    # 4) Importar
    clientes = sorted(por_cliente)
    with db_session:
        canal_de = {}
        for cid in clientes:
            c = Canal.get(cliente_id=cid)
            if c is None:
                c = Canal(tipo="cliente", cliente_id=cid, nombre=(nombres_cliente.get(cid) or f"cliente-{cid}").strip())
                c.flush()
            canal_de[cid] = c.id

        # Lo importado antes se reemplaza entero (adjuntos, mensajes) y lo aprendido de esos canales se rehace.
        borrados_adj = 0
        for a in Adjunto.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."adjuntos" WHERE mensaje_id < 0'):
            ruta = almacen.ruta_de(a.archivo)
            if ruta and ruta.exists():
                ruta.unlink()
            a.delete()
            borrados_adj += 1
        previos = db.execute(f'DELETE FROM "{DB_SCHEMA}"."mensajes_canal" WHERE id < 0').rowcount
        canales_afectados = set(canal_de.values())
        for h in list(HechoCerebro.select()):
            if h.canal_id in canales_afectados:
                h.delete()
        for e in list(EstadoAprendizaje.select()):
            if e.canal_id in canales_afectados:
                e.delete()
        for p in list(PerfilCliente.select()):
            if p.cliente_id in por_cliente:
                p.delete()
        print(f"\nReemplazo: {previos} mensajes y {borrados_adj} adjuntos importados antes")

        cur = db.get_connection().cursor()
        from psycopg2.extras import execute_values

        execute_values(
            cur,
            f'INSERT INTO "{DB_SCHEMA}"."mensajes_canal" (id, canal, autor_tipo, autor_id, texto, borrado, creado_en, autor_nombre) VALUES %s',
            [(x["id"], canal_de[x["cliente_id"]], x["autor_tipo"], x["autor_id"], x["texto"] or "", False, x["fecha"], x["autor_nombre"]) for x in todos],
            page_size=1000,
        )
        copiados = 0
        for x in todos:
            for nombre, local in x["archivos"]:
                canal_id = canal_de[x["cliente_id"]]
                relativo, destino = almacen.nuevo_archivo(canal_id, nombre)
                destino.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(local, destino)
                Adjunto(
                    canal_id=canal_id, mensaje_id=x["id"], subido_por_tipo=x["autor_tipo"], subido_por_id=x["autor_id"],
                    nombre=nombre, archivo=relativo, tipo_mime=mimetypes.guess_type(nombre)[0] or "application/octet-stream",
                    tamano=local.stat().st_size, creado_en=x["fecha"],
                )
                copiados += 1
        # La bandeja ordena por la última actividad: cuenta también la de Discord.
        ultimo = {}
        for x in todos:
            ultimo[x["cliente_id"]] = max(ultimo.get(x["cliente_id"], x["fecha"]), x["fecha"])
        for cid, fecha in ultimo.items():
            c = Canal[canal_de[cid]]
            if c.ultimo_mensaje_en is None or c.ultimo_mensaje_en < fecha:
                c.ultimo_mensaje_en = fecha
    print(f"Importados: {len(todos)} mensajes en {len(canal_de)} chats · {copiados} imágenes")
    print("El cerebro empieza a aprender de este historial en el próximo ciclo (cada 10 minutos, de a tandas).")


if __name__ == "__main__":
    main()
