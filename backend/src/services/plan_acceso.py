"""Lo que incluye cada plan además del material. El 2K (backend offer, 26-10-2026) es el más acotado:
tiene su canal privado, pero solo para pedir sus sesiones 1 a 1 (los coaches no dan consultas por ahí);
no ve la comunidad ni los anuncios, no usa la guía con IA y el acceso es solo del titular (su contrato
no incluye integrantes de su equipo)."""

PLANES_SIN_CHAT = frozenset({"2k"})  # sin comunidad: solo su canal privado
# Un canal de anuncios con este rol lo ven también los planes sin comunidad (la guía de cómo usar la plataforma).
ROL_PARA_TODOS = "todos"
PLANES_SIN_IA = frozenset({"2k"})
PLANES_SIN_EQUIPO = frozenset({"2k"})


# Los valores salen de la pantalla Permisos del admin (permisos_service); las constantes de arriba son lo que
# trae el 2K por defecto.
def sin_chat(sesion: dict) -> bool:
    from src.services.permisos_service import permite

    return not permite(sesion, "comunidad")


def sin_ia(sesion: dict) -> bool:
    from src.services.permisos_service import permite

    return not permite(sesion, "ia")
