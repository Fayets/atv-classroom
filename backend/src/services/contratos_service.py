"""Carpeta "Contratos" del escritorio (solo admins): los contratos de ZapSign de cada cliente, por programa.

Solo lectura sobre el esquema onboarding (la misma base): el paso "Firmá tu contrato" de atv-onboarding
guarda ahí el estado y, una vez firmado, el PDF. Acá no se crea ni se toca ningún contrato.
"""

from pony.orm import db_session

from fastapi import HTTPException

from src.db import db

# Mismo orden que los planes de atv-onboarding (src/plans.py).
PROGRAMAS = ("Entry Level", "Mid Level", "High Level", "Boost", "Mentoría")

_SQL = """SELECT s.id::text, s.client_name, s.client_email, s.plan, s.payment_mode, s.contract_kind, s.contract_status,
  s.contract_created_at, s.contract_signed_at, s.contract_signed_pdf IS NOT NULL
FROM onboarding.sessions s
WHERE coalesce(s.contract_status, 'none') <> 'none'"""


def _fila(r) -> dict:
    sid, nombre, email, plan, pago, tipo, estado, creado, firmado, hay_pdf = r
    return {
        "id": sid,
        "nombre": nombre or email or "Sin nombre",
        "email": email,
        "programa": plan or "Sin programa",
        "pago": pago,
        "contrato": tipo,  # entry | mid | high: Boost firma el de High Level y Mentoría el de Entry Level
        "estado": "firmado" if estado == "signed" else "pendiente",
        "enviado_en": creado.isoformat() if creado else None,
        "firmado_en": firmado.isoformat() if firmado else None,
        "pdf": bool(hay_pdf),
    }


class ContratosServices:
    def listar(self) -> dict:
        with db_session:
            filas = [_fila(r) for r in db.select(_SQL + " ORDER BY coalesce(s.contract_signed_at, s.contract_created_at) DESC NULLS LAST")]
        extra = sorted({f["programa"] for f in filas} - set(PROGRAMAS))
        return {"programas": list(PROGRAMAS) + extra, "contratos": filas}

    def pdf(self, session_id: str) -> tuple[bytes, str]:
        with db_session:
            filas = db.select(
                "SELECT contract_signed_pdf, client_name, plan FROM onboarding.sessions WHERE id::text = $sid AND contract_signed_pdf IS NOT NULL",
                {"sid": session_id},
            )
        if not filas:
            raise HTTPException(status_code=404, detail="Ese contrato todavía no está firmado.")
        pdf, nombre, plan = filas[0]
        return bytes(pdf), f"Contrato {plan or ''} - {nombre or 'cliente'}.pdf".replace("  ", " ")
