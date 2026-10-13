from fastapi import APIRouter, Depends
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from src.controllers.admin_controller import requerir_admin
from src.services.auth_service import obtener_sesion_desde_request
from src.services.equipo_cliente_service import EquipoClienteServices

router = APIRouter(tags=["equipo-cliente"])
service = EquipoClienteServices()


class Miembro(BaseModel):
    email: str
    nombre: str
    rol: str


class Limites(BaseModel):
    planes: dict[str, int]


# El cliente maneja su equipo desde "Mi cuenta".
@router.get("/api/cuenta/equipo")
async def listar(sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.listar, sesion)


@router.post("/api/cuenta/equipo")
async def agregar(datos: Miembro, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.agregar, sesion, datos.email, datos.nombre, datos.rol)


@router.patch("/api/cuenta/equipo/{miembro_id}")
async def editar(miembro_id: int, datos: Miembro, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.editar, sesion, miembro_id, datos.email, datos.nombre, datos.rol)


@router.delete("/api/cuenta/equipo/{miembro_id}")
async def quitar(miembro_id: int, sesion: dict = Depends(obtener_sesion_desde_request)):
    return await run_in_threadpool(service.quitar, sesion, miembro_id)


# ATV decide el cupo por plan.
@router.get("/api/admin/equipos-clientes")
async def limites(_sesion: dict = Depends(requerir_admin)):
    return await run_in_threadpool(service.limites)


@router.put("/api/admin/equipos-clientes")
async def guardar_limites(datos: Limites, _sesion: dict = Depends(requerir_admin)):
    return await run_in_threadpool(service.guardar_limites, datos.planes)
