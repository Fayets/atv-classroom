from fastapi import APIRouter, Depends, File, UploadFile
from pydantic import BaseModel
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

from fastapi import Request

from src.services import dispositivos_service
from src.services.auth_service import _hash_token, obtener_sesion_desde_request, token_desde_request
from src.services.cuenta_service import MAX_FOTO, CuentaServices

router = APIRouter(prefix="/api/cuenta", tags=["cuenta"])
service = CuentaServices()


@router.get("")
async def mi_cuenta(sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.mi_cuenta, sesion)


@router.post("/foto")
async def subir_foto(archivo: UploadFile = File(...), sesion: dict = Depends(obtener_sesion_desde_request)):
    datos = await archivo.read(MAX_FOTO + 1)
    return await run_in_threadpool(service.subir_foto, sesion, datos)


@router.delete("/foto")
async def quitar_foto(sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.quitar_foto, sesion)


@router.get("/fotos/{archivo}")
def foto(archivo: str):
    """Sin sesión a propósito (un <img> no manda el token): el nombre es aleatorio y cambia en cada subida."""
    ruta = service.ruta_foto(archivo)
    return FileResponse(ruta, headers={"Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"})


class Voz(BaseModel):
    admin_id: int | None = None


@router.get("/voz")
async def voz(sesion: dict = Depends(obtener_sesion_desde_request)):
    """Con la voz de quién sugiere el Tab (solo equipo)."""
    return await run_in_threadpool(service.voces, sesion)


@router.put("/voz")
async def elegir_voz(datos: Voz, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.elegir_voz, sesion, datos.admin_id)


@router.get("/dispositivos")
async def mis_dispositivos(request: Request, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(dispositivos_service.mios, sesion, _hash_token(token_desde_request(request) or ""))


@router.delete("/dispositivos/{sesion_id}")
async def cerrar_dispositivo(sesion_id: int, sesion: dict = Depends(obtener_sesion_desde_request)):
    await run_in_threadpool(dispositivos_service.cerrar_mio, sesion, sesion_id)
    return {"ok": True}
