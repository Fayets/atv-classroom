"""Trae el historial de un canal de comunidad de Discord (por ejemplo #wins) a un canal del classroom.

El .txt lo baja atv-clients con exportar_canal.py (mismo formato que los transcripts de clientes, con
sus imágenes en adjuntos/). Como el resto del historial de Discord:
- Entra con ids NEGATIVOS, en orden de fecha: nunca cuenta como no leído y queda antes de lo escrito
  en el classroom. Para meterlo se corre todo lo importado antes (igual que migrar_discord --nuevos).
- Los del equipo con cuenta quedan atados a su cuenta; los clientes conservan su nombre de Discord.
- Las imágenes guardadas se copian como adjuntos; audios y archivos vencidos quedan como nota.
- Si el canal ya tiene historial importado, no hace nada salvo que se pase --reemplazar (y avisa cuánto
  borraría). Nunca toca lo escrito en el classroom (ids positivos) ni otros canales.

Uso (dentro del contenedor del backend):
    python -m scripts.migrar_canal_comunidad /tmp/discord/comunidad/wins/wins.txt --canal=1557            # solo muestra
    python -m scripts.migrar_canal_comunidad /tmp/discord/comunidad/wins/wins.txt --canal=1557 --aplicar   # importa
Opciones: --equipo="Nombre,..." (más gente del equipo)  ·  --alias="Viejo=Nuevo,..."  ·  --reemplazar
"""
import json
import mimetypes
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


def main() -> None:
    if len(sys.argv) < 3 or not _opcion("canal"):
        print(__doc__)
        return
    txt = Path(sys.argv[1])
    canal_id = int(_opcion("canal"))
    aplicar = "--aplicar" in sys.argv
    reemplazar = "--reemplazar" in sys.argv
    equipo_extra = {n.strip() for n in (_opcion("equipo") or "").split(",") if n.strip()}
    alias = dict(p.split("=", 1) for p in (_opcion("alias") or "").split(",") if "=" in p)
    if not txt.exists():
        raise SystemExit(f"No existe {txt}")

    init_db()
    from src.models import Adjunto, Admin, Canal
    from src.storage import adjuntos as almacen

    directorio = {}
    for carpeta in [txt.parent, *txt.parents]:
        if (carpeta / "_directorio.json").exists():
            directorio = json.loads((carpeta / "_directorio.json").read_text(encoding="utf-8"))
            break

    with db_session:
        canal = Canal.get(id=canal_id)
        if canal is None:
            raise SystemExit(f"No existe el canal {canal_id} en el classroom.")
        if canal.tipo in ("cliente", "directo", "privado", "dm"):
            raise SystemExit(f"El canal {canal_id} es un chat ({canal.tipo}), no de comunidad: para esos va migrar_discord.")
        nombre_canal = canal.nombre
        previos = db.select(f'SELECT count(*) FROM "{DB_SCHEMA}"."mensajes_canal" WHERE canal = $canal_id AND id < 0')[0]
        cuentas = {}
        for a in list(Admin.select()):
            if a.activo and a.nombre:
                cuentas.setdefault(a.nombre, a.id)

    equipo = set(CUENTA_DE) | EQUIPO_SIEMPRE | equipo_extra
    mensajes = parsear(txt)
    todos, por_autor = [], Counter()
    guardadas = perdidas = 0
    for orden, m in enumerate(mensajes):
        autor = alias.get(m["autor"], m["autor"])
        texto = limpiar_texto(m["texto"], directorio)
        archivos, notas = [], []
        for url in m["adjuntos"]:
            nombre, local = archivo_del_adjunto(url, txt.parent)
            if local is not None and almacen.tipo_permitido(nombre):
                archivos.append((nombre, local))
                guardadas += 1
            else:
                notas.append(nota_de_adjunto(nombre))
                perdidas += 1
        if notas:
            texto = (texto + "\n" if texto else "") + "\n".join(notas)
        if not texto and not archivos:
            continue
        es_equipo = autor in equipo
        admin_id = cuentas.get(CUENTA_DE.get(autor, autor)) if es_equipo else None
        todos.append({
            "orden": (m["fecha"], orden),
            "autor_tipo": "admin" if es_equipo else "cliente",
            # Los clientes de la comunidad no se atan a una ficha: queda su nombre de Discord.
            "autor_id": (admin_id or 0) if es_equipo else 0,
            "autor_nombre": NOMBRE_VISIBLE.get(autor, autor),
            "texto": texto or None,
            "fecha": m["fecha"],
            "archivos": archivos,
        })
        por_autor[(NOMBRE_VISIBLE.get(autor, autor), "equipo" if es_equipo else "cliente")] += 1
    todos.sort(key=lambda x: x["orden"])
    for i, x in enumerate(todos):
        x["id"] = -(len(todos) - i)  # el más viejo, el más negativo

    print(f"Canal del classroom: {canal_id} {nombre_canal}")
    print(f"Mensajes a importar: {len(todos)}" + (f" · desde {todos[0]['fecha']:%d/%m/%Y} hasta {todos[-1]['fecha']:%d/%m/%Y} (UTC)" if todos else ""))
    print(f"Imágenes que se copian: {guardadas} · adjuntos que quedan como nota: {perdidas}")
    print("Quién escribe (revisá que el equipo esté bien marcado; si falta alguien: --equipo=\"Nombre\"):")
    for (autor, lado), n in por_autor.most_common(40):
        print(f"  {n:5}  {autor}  [{lado}]")
    if previos:
        print(f"\nEl canal ya tiene {previos} mensajes importados de Discord.")
        if not reemplazar:
            print("No se hace nada. Para reemplazarlos: --reemplazar")
            return
    if not aplicar:
        print("\nNo se escribió nada. Para importar: agregá --aplicar")
        return
    if not todos:
        print("No hay mensajes para importar.")
        return

    with db_session:
        if previos:
            borrados_adj = 0
            for a in Adjunto.select_by_sql(f'SELECT * FROM "{DB_SCHEMA}"."adjuntos" WHERE canal_id = $canal_id AND mensaje_id < 0'):
                ruta = almacen.ruta_de(a.archivo)
                if ruta and ruta.exists():
                    ruta.unlink()
                a.delete()
                borrados_adj += 1
            n = db.execute(f'DELETE FROM "{DB_SCHEMA}"."mensajes_canal" WHERE canal = $canal_id AND id < 0').rowcount
            print(f"\nReemplazo: {n} mensajes y {borrados_adj} adjuntos importados antes en este canal")
        _hacer_lugar(len(todos))
        cur = db.get_connection().cursor()
        from psycopg2.extras import execute_values

        execute_values(
            cur,
            f'INSERT INTO "{DB_SCHEMA}"."mensajes_canal" (id, canal, autor_tipo, autor_id, texto, borrado, creado_en, autor_nombre) VALUES %s',
            [(x["id"], canal_id, x["autor_tipo"], x["autor_id"], x["texto"] or "", False, x["fecha"], x["autor_nombre"]) for x in todos],
            page_size=1000,
        )
        copiadas = 0
        for x in todos:
            for nombre, local in x["archivos"]:
                relativo, destino = almacen.nuevo_archivo(canal_id, nombre)
                destino.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(local, destino)
                Adjunto(
                    canal_id=canal_id, mensaje_id=x["id"], subido_por_tipo=x["autor_tipo"], subido_por_id=x["autor_id"],
                    nombre=nombre, archivo=relativo, tipo_mime=mimetypes.guess_type(nombre)[0] or "application/octet-stream",
                    tamano=local.stat().st_size, creado_en=x["fecha"],
                )
                copiadas += 1
        c = Canal[canal_id]
        if c.ultimo_mensaje_en is None or c.ultimo_mensaje_en < todos[-1]["fecha"]:
            c.ultimo_mensaje_en = todos[-1]["fecha"]
    print(f"Importados: {len(todos)} mensajes en {nombre_canal} · {copiadas} imágenes")


if __name__ == "__main__":
    main()
