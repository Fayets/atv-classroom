"""El SOP "Acceder al Círculo Privado (WhatsApp)" de los Case of Study abría el WhatsApp de Naza. Pasa al número
comercial de Juan, el de las landings (pedido de Franco, 27-10-2026), con el mensaje a nombre de Juan.

    python -m scripts.whatsapp_circulo            # muestra
    python -m scripts.whatsapp_circulo --aplicar  # guarda
"""

import sys
from urllib.parse import quote

from pony.orm import db_session

from src.db import init_db

VIEJO = "phone=541120456045"
NUEVO = "https://api.whatsapp.com/send?phone=5491162626702&text=" + quote(
    "Buenas Juan quiero saber como puedo acceder al Círculo Privado, soy NOMBRE ")


def main(aplicar: bool) -> int:
    init_db()
    from src.models import ClaseRecurso

    with db_session:
        recursos = [r for r in list(ClaseRecurso.select()) if VIEJO in (r.url or "")]
        for r in sorted(recursos, key=lambda r: r.clase.id):
            print(f"  ✓ {r.clase.id:>3}  {r.clase.titulo} | {r.titulo}")
            if aplicar:
                r.url = NUEVO
    print(f"\n{len(recursos)} links {'cambiados' if aplicar else 'se cambian'} a\n{NUEVO}")
    return 0


if __name__ == "__main__":
    sys.exit(main("--aplicar" in sys.argv))
