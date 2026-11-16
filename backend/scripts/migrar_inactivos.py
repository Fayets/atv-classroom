"""Trae al classroom los chats viejos de Discord de las categorías "❌ Canales inactivos 1…7".

Los baja atv-clients con `exportar_canal.py --categoria="canales inactivos"`: quedan en
<transcripts>/inactivos/<n>/<canal>/<canal>.txt (con sus imágenes en adjuntos/) y un resumen.json.

Cada canal de Discord pasa a ser un canal tipo "archivo" con archivo=<n>: solo lo ve el equipo, dentro de
Inactivos → "Inactivos <n>", y nadie escribe. No se crean fichas en atv-clients.
- Los mensajes entran con ids NEGATIVOS (como todo lo de Discord): nunca cuentan como no leídos.
  Se corre lo importado antes UNA sola vez para todos los canales.
- Un canal que ya está en el classroom (mismo nombre y misma categoría) se saltea: se puede volver a correr.
- Los del equipo con cuenta quedan atados a su cuenta; el resto conserva su nombre de Discord.

Uso (dentro del contenedor del backend):
    python -m scripts.migrar_inactivos /tmp/inactivos             # solo muestra qué haría
    python -m scripts.migrar_inactivos /tmp/inactivos --aplicar   # importa
Opciones: --equipo="Nombre,..." (más gente del equipo)  ·  --alias="Viejo=Nuevo,..."  ·  --solo=3,5 (categorías)
"""
import json
import mimetypes
import re
import shutil
import sys
from collections import Counter
from pathlib import Path

from pony.orm import db_session

from scripts.migrar_discord import (
    CUENTA_DE,
    EQUIPO_SIEMPRE,
    NOMBRE_VISIBLE,
    _hacer_lugar,
    archivo_del_adjunto,
    limpiar_texto,
    nota_de_adjunto,
    parsear,
)
from src.db import DB_SCHEMA, db, init_db


def _opcion(nombre: str) -> str | None:
    return next((a.split("=", 1)[1] for a in sys.argv[2:] if a.startswith(f"--{nombre}=")), None)


def nombre_visible(canal_discord: str) -> str:
    """ "📝-agustin-salas" → "agustin-salas": sin el emoji ni el separador del principio."""
    return re.sub(r"^[^\w]+", "", canal_discord, flags=re.UNICODE).strip("-") or canal_discord


def _carpeta(base: Path, numero: str, canal_discord: str) -> Path | None:
    """La carpeta que escribió exportar_canal.py (mismo _simple que allá)."""
    simple = re.sub(r"^[^a-z0-9]+", "", canal_discord.lower()).strip("-")
    carpeta = base / numero / simple
    return carpeta if (carpeta / f"{simple}.txt").exists() else None


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        return
    base = Path(sys.argv[1])
    resumen_json = base / "resumen.json"
    if not resumen_json.exists():
        raise SystemExit(f"No está {resumen_json}: primero exportar_canal.py --categoria en atv-clients.")
    aplicar = "--aplicar" in sys.argv
    solo = {s.strip() for s in (_opcion("solo") or "").split(",") if s.strip()}
    equipo_extra = {n.strip() for n in (_opcion("equipo") or "").split(",") if n.strip()}
    alias = dict(p.split("=", 1) for p in (_opcion("alias") or "").split(",") if "=" in p)
    resumen = json.loads(resumen_json.read_text(encoding="utf-8"))

    directorio = {}
    for carpeta in [base, *base.parents]:
        if (carpeta / "_directorio.json").exists():
            directorio = json.loads((carpeta / "_directorio.json").read_text(encoding="utf-8"))
            break

    init_db()
    from src.models import Adjunto, Admin, Canal
    from src.storage import adjuntos as almacen

    with db_session:
        ya = {(c.archivo, c.nombre) for c in list(Canal.select()) if c.tipo == "archivo"}
        cuentas = {}
        for a in list(Admin.select()):
            if a.activo and a.nombre:
                cuentas.setdefault(a.nombre, a.id)

    equipo = set(CUENTA_DE) | EQUIPO_SIEMPRE | equipo_extra
    canales, por_autor = [], Counter()
    guardadas = perdidas = salteados = faltan = 0
    for cat in resumen:
        numero = str(cat["numero"])
        if solo and numero not in solo:
            continue
        for info in cat["canales"]:
            nombre = nombre_visible(info["canal"])
            if (numero, nombre) in ya:
                salteados += 1
                continue
            carpeta = _carpeta(base, numero, info["canal"])
            if carpeta is None:
                print(f"  ! falta el .txt de #{info['canal']} (Inactivos {numero})")
                faltan += 1
                continue
            mensajes = []
            for orden, m in enumerate(parsear(carpeta / f"{carpeta.name}.txt")):
                autor = alias.get(m["autor"], m["autor"])
                texto = limpiar_texto(m["texto"], directorio)
                archivos, notas = [], []
                for url in m["adjuntos"]:
                    nombre_adj, local = archivo_del_adjunto(url, carpeta)
                    if local is not None and almacen.tipo_permitido(nombre_adj):
                        archivos.append((nombre_adj, local))
                        guardadas += 1
                    else:
                        notas.append(nota_de_adjunto(nombre_adj))
                        perdidas += 1
                if notas:
                    texto = (texto + "\n" if texto else "") + "\n".join(notas)
                if not texto and not archivos:
                    continue
                es_equipo = autor in equipo
                admin_id = cuentas.get(CUENTA_DE.get(autor, autor)) if es_equipo else None
                mensajes.append({
                    "orden": (m["fecha"], orden),
                    "autor_tipo": "admin" if es_equipo else "cliente",
                    "autor_id": (admin_id or 0) if es_equipo else 0,
                    "autor_nombre": NOMBRE_VISIBLE.get(autor, autor),
                    "texto": texto or None,
                    "fecha": m["fecha"],
                    "archivos": archivos,
                })
                por_autor[(NOMBRE_VISIBLE.get(autor, autor), "equipo" if es_equipo else "cliente")] += 1
            mensajes.sort(key=lambda x: x["orden"])
            canales.append({"numero": numero, "nombre": nombre, "mensajes": mensajes})

    total = sum(len(c["mensajes"]) for c in canales)
    print(f"Canales a crear: {len(canales)} · mensajes: {total} · ya estaban: {salteados} · sin .txt: {faltan}")
    for numero in sorted({c["numero"] for c in canales}, key=int):
        de_esta = [c for c in canales if c["numero"] == numero]
        print(f"  Inactivos {numero}: {len(de_esta)} canales, {sum(len(c['mensajes']) for c in de_esta)} mensajes")
    print(f"Imágenes que se copian: {guardadas} · adjuntos que quedan como nota: {perdidas}")
    print("Quién escribe más (revisá que el equipo esté bien marcado; si falta alguien: --equipo=\"Nombre\"):")
    for (autor, lado), n in por_autor.most_common(30):
        print(f"  {n:6}  {autor}  [{lado}]")
    if not aplicar:
        print("\nNo se escribió nada. Para importar: agregá --aplicar")
        return
    if not total:
        print("No hay mensajes para importar.")
        return

    # Ids: todos los canales juntos, el mensaje más viejo de todos con el id más negativo.
    todos = sorted((m for c in canales for m in c["mensajes"]), key=lambda x: x["orden"])
    for i, x in enumerate(todos):
        x["id"] = -(len(todos) - i)

    with db_session:
        _hacer_lugar(len(todos))
        from psycopg2.extras import execute_values

        cur = db.get_connection().cursor()
        copiadas = 0
        for c in canales:
            ultimo = c["mensajes"][-1]["fecha"] if c["mensajes"] else None
            canal = Canal(tipo="archivo", nombre=c["nombre"], archivo=c["numero"], inactivo=True, ultimo_mensaje_en=ultimo)
            db.flush()
            if not c["mensajes"]:
                continue
            execute_values(
                cur,
                f'INSERT INTO "{DB_SCHEMA}"."mensajes_canal" (id, canal, autor_tipo, autor_id, texto, borrado, creado_en, autor_nombre) VALUES %s',
                [(x["id"], canal.id, x["autor_tipo"], x["autor_id"], x["texto"] or "", False, x["fecha"], x["autor_nombre"]) for x in c["mensajes"]],
                page_size=1000,
            )
            for x in c["mensajes"]:
                for nombre_adj, local in x["archivos"]:
                    relativo, destino = almacen.nuevo_archivo(canal.id, nombre_adj)
                    destino.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(local, destino)
                    Adjunto(
                        canal_id=canal.id, mensaje_id=x["id"], subido_por_tipo=x["autor_tipo"], subido_por_id=x["autor_id"],
                        nombre=nombre_adj, archivo=relativo, tipo_mime=mimetypes.guess_type(nombre_adj)[0] or "application/octet-stream",
                        tamano=local.stat().st_size, creado_en=x["fecha"],
                    )
                    copiadas += 1
            print(f"  Inactivos {c['numero']} · #{c['nombre']}: {len(c['mensajes'])} mensajes")
    print(f"Importados: {total} mensajes en {len(canales)} canales · {copiadas} imágenes")


if __name__ == "__main__":
    main()
