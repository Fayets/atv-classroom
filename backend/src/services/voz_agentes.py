"""La voz aprendida de alguien del equipo, para Juan IA en Leverage (ruta /api/agentes/voz).

Va aparte de agentes_service porque lee con Pony lo que ya arma el cerebro (voz, reglas, correcciones):
agentes_service lee solo por la conexión de solo lectura. Acá tampoco se escribe nada.
"""

from pony.orm import db_session

from src.db import DB_SCHEMA as S
from src.models import ReglaVoz
from src.services import aprendizaje_service as ap
from src.services.agentes_service import _SQL_EQUIPO, _filas, _lectura, persona_de
from src.services.sugerencias_service import _describir_voz


def voz_de_persona(agente: dict, quien: str) -> dict:
    """Lo mismo que usa el Tab para escribir como esa persona: sus rasgos medidos en sus mensajes reales, ejemplos,
    las reglas que le dio al Tab y las correcciones recientes (lo que propuso la IA y cómo lo dejó ella)."""
    with _lectura() as cur:
        equipo = _filas(cur, _SQL_EQUIPO)
    persona = persona_de(equipo, quien)
    pid = persona["id"]
    voz = ap.voz_de(pid)
    with db_session:
        reglas = [r.texto for r in ReglaVoz.select_by_sql(f'SELECT * FROM "{S}"."cerebro_reglas_voz" WHERE voz_id = $pid ORDER BY id DESC LIMIT 40')]
    correcciones = [c for c in ap.correcciones_de(pid, 60) if 5 <= c["cambio"] <= 90][:12]
    rasgos = voz.get("rasgos") or {}
    return {
        "persona": {"id": pid, "nombre": persona["nombre"]},
        "como_escribe": _describir_voz(rasgos),
        "mensajes_medidos": rasgos.get("mensajes"),
        "ejemplos": [e for e in (voz.get("ejemplos") or []) if e][:20],
        "reglas": reglas,
        "correcciones": [{"la_ia_propuso": c["propuesto"], "mando": c["enviado"]} for c in correcciones],
        "descartadas": [{"la_ia_propuso": d.get("propuesto"), "escribio": d.get("enviado")} for d in (voz.get("descartadas") or [])],
    }
