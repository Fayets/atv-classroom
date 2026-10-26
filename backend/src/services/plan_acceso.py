"""Lo que incluye cada plan además del material. El 2K (backend offer, 26-10-2026) es el más acotado:
ve su canal privado (lo que le manda el equipo) pero no escribe ni ve la comunidad, no usa la guía con
IA y el acceso es solo del titular (su contrato no incluye integrantes de su equipo)."""

PLANES_SIN_CHAT = frozenset({"2k"})
PLANES_SIN_IA = frozenset({"2k"})
PLANES_SIN_EQUIPO = frozenset({"2k"})


def sin_chat(sesion: dict) -> bool:
    return sesion.get("rol") in PLANES_SIN_CHAT


def sin_ia(sesion: dict) -> bool:
    return sesion.get("rol") in PLANES_SIN_IA
