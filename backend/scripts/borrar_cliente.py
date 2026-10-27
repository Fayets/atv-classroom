"""Borra a un cliente del classroom y su sesión de atv-onboarding, SIN tocar su ficha de atv-clients (ahí está
la seña). Pedido de Franco del 27-10-2026 para Máximo Agustín Maydana.

Busca la ficha por una parte del nombre o el mail: tiene que haber exactamente una. Sin --aplicar solo cuenta
lo que hay en cada tabla. Si el onboarding tiene el contrato firmado, antes de borrar lo guarda en
/tmp/contrato-<id>.pdf dentro del contenedor.

    python -m scripts.borrar_cliente maydana            # muestra
    python -m scripts.borrar_cliente maydana --aplicar  # borra
    ... --aplicar --llamadas                            # borra también sus llamadas de Fathom (eran de prueba)
"""

import sys

from pony.orm import db_session

from src.db import DB_SCHEMA, db, init_db

S = f'"{DB_SCHEMA}"'


def _cuenta(sql: str, params: dict) -> int:
    return db.select(f"SELECT count(*) FROM ({sql}) x", params)[0]


def main(texto: str, aplicar: bool) -> int:
    init_db()
    with db_session:
        fichas = db.select(
            "SELECT id, nombre, email, plan_actual, estado_cliente FROM clients.clientes "
            "WHERE nombre ILIKE $t OR email ILIKE $t",
            {"t": f"%{texto}%"},
        )
        if len(fichas) != 1:
            print(f"{len(fichas)} fichas coinciden con «{texto}»: tiene que ser una sola. No se borra nada.")
            for f in fichas:
                print("  ", f)
            return 1
        cid, nombre, email, plan, estado = fichas[0]
        print(f"Ficha {cid}: {nombre} <{email}> · plan {plan} · {estado}  (queda en atv-clients, no se toca)\n")

        canales = [r for r in db.select(f"SELECT id FROM {S}.canales WHERE cliente_id = $c", {"c": cid})]
        miembros = [r for r in db.select(f"SELECT id FROM {S}.miembros_cliente WHERE cliente_id = $c", {"c": cid})]
        p = {"c": cid, "can": canales or [0], "mie": miembros or [0]}
        # (tabla, condición) en el orden en que se borra: primero lo que cuelga de otra cosa.
        borrar = [
            ("adjuntos", "canal_id = ANY($can)"),
            ("menciones", "canal_id = ANY($can)"),
            ("reacciones", "canal_id = ANY($can)"),
            ("lecturas_canal", "canal_id = ANY($can)"),
            ("cerebro_estado", "canal_id = ANY($can)"),
            ("cerebro_hechos", "cliente_id = $c OR canal_id = ANY($can)"),
            ("mensajes_canal", "canal = ANY($can)"),
            ("canales", "cliente_id = $c"),
            ("sesiones", "(tipo = 'cliente' AND usuario_id = $c) OR miembro_id = ANY($mie)"),
            ("push_suscripciones", "(tipo = 'cliente' AND usuario_id = $c) OR miembro_id = ANY($mie)"),
            ("progreso", "cliente_id = $c OR miembro_id = ANY($mie)"),
            ("nota", "cliente_id = $c OR miembro_id = ANY($mie)"),
            ("fotos_perfil", "(tipo = 'cliente' AND usuario_id = $c) OR (tipo = 'miembro' AND usuario_id = ANY($mie))"),
            ("frente", "tipo_usuario = 'cliente' AND usuario_id = $c"),
            ("consulta_coach", "tipo_usuario = 'cliente' AND usuario_id = $c"),
            ("solicitud_sop", "tipo_usuario = 'cliente' AND usuario_id = $c"),
            ("consultas_guia", "tipo_usuario = 'cliente' AND usuario_id = $c"),
            ("mensaje", "tipo_usuario = 'cliente' AND usuario_id = $c"),
            ("cerebro_roadmaps", "cliente_id = $c"),
            ("roadmap_docs", "cliente_id = $c"),
            ("cerebro_perfil_cliente", "cliente_id = $c"),
            ("cerebro_onboarding", "cliente_id = $c"),
            ("miembros_cliente", "cliente_id = $c"),
        ]
        existentes = {r for r in db.select("SELECT table_name FROM information_schema.tables WHERE table_schema = $s", {"s": DB_SCHEMA})}
        conteos = []
        for tabla, cond in borrar:
            if tabla not in existentes:
                continue
            n = _cuenta(f"SELECT 1 FROM {S}.{tabla} WHERE {cond}", p)
            conteos.append((tabla, cond, n))
            if n:
                print(f"  {tabla:<24} {n}")
        llamadas = _cuenta(f"SELECT 1 FROM {S}.llamadas WHERE cliente_id = $c", p) if "llamadas" in existentes else 0
        if llamadas:
            print(f"  llamadas {llamadas}" + ("" if "--llamadas" in sys.argv else "  (quedan, sin cliente; con --llamadas se borran)"))

        altas = db.select(f"SELECT id, session_id FROM {S}.altas_clientes WHERE cliente_id = $c", p)
        sesiones_onb = [str(s) for _, s in altas if s]
        if not sesiones_onb and email:
            # Sin alta desde el classroom: la sesión del onboarding por su mail.
            sesiones_onb = [str(s) for s in db.select("SELECT id FROM onboarding.sessions WHERE lower(client_email) = lower($e)", {"e": email})]
        pdfs = []
        for sid in sesiones_onb:
            fila = db.select("SELECT client_name, contract_signed_pdf FROM onboarding.sessions WHERE id::text = $s", {"s": sid})
            if fila:
                print(f"\n  onboarding: sesión {sid} ({fila[0][0]}){' · con contrato firmado' if fila[0][1] else ''}")
                if fila[0][1]:
                    pdfs.append((sid, bytes(fila[0][1])))
            else:
                print(f"\n  onboarding: la sesión {sid} del alta ya no existe")
        if not sesiones_onb:
            print("\n  onboarding: no encuentro su sesión (ni por el alta ni por el mail)")

        if not aplicar:
            print("\nNo se borró nada. Corré con --aplicar para borrar.")
            return 0

        for sid, pdf in pdfs:
            ruta = f"/tmp/contrato-{cid}.pdf"
            open(ruta, "wb").write(pdf)
            print(f"\nContrato firmado guardado en {ruta}")
        for tabla, cond, n in conteos:
            if n:
                db.execute(f"DELETE FROM {S}.{tabla} WHERE {cond}", p)
        if llamadas and "--llamadas" in sys.argv:
            # Como el botón Borrar de la carpeta Llamadas: queda anotada para que Fathom no la vuelva a traer.
            db.execute(
                f"INSERT INTO {S}.llamadas_borradas (fathom_id, admin_id, borrada_en) "
                f"SELECT fathom_id, admin_id, now() FROM {S}.llamadas WHERE cliente_id = $c ON CONFLICT DO NOTHING", p)
            db.execute(f"DELETE FROM {S}.llamadas WHERE cliente_id = $c", p)
        elif llamadas:
            db.execute(f"UPDATE {S}.llamadas SET cliente_id = NULL WHERE cliente_id = $c", p)
        db.execute(f"DELETE FROM {S}.altas_clientes WHERE cliente_id = $c", p)

    from src.services.alta_service import _llamar

    for sid in sesiones_onb:
        try:
            _llamar("DELETE", f"/api/admin/sessions/{sid}/cancel")
            print(f"Sesión de onboarding {sid} borrada")
        except Exception as e:  # noqa: BLE001
            print(f"No se pudo borrar la sesión de onboarding {sid}: {getattr(e, 'detail', e)}")
    print(f"\n{nombre} borrado del classroom. La ficha {cid} sigue en atv-clients.")
    return 0


if __name__ == "__main__":
    argumentos = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not argumentos:
        print(__doc__)
        sys.exit(1)
    sys.exit(main(argumentos[0], "--aplicar" in sys.argv))
