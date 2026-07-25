from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from src import schemas
from src.services.admin_service import AdminServices
from src.services.auth_service import obtener_sesion_desde_request

router = APIRouter(prefix="/api/admin", tags=["admin"])
service = AdminServices()


def requerir_admin(
    sesion: dict = Depends(obtener_sesion_desde_request),
) -> dict:
    if sesion.get("rol") != "admin":
        raise HTTPException(status_code=403, detail="Acceso denegado.")
    return sesion


@router.get("/programas", response_model=list[schemas.ProgramaAdminListItem])
def listar_programas(_sesion: dict = Depends(requerir_admin)):
    return service.listar_programas()


@router.get("/programas/{programa_id}", response_model=schemas.ProgramaAdminDetalle)
def obtener_programa(programa_id: int, _sesion: dict = Depends(requerir_admin)):
    return service.obtener_programa(programa_id)


@router.post("/programas", response_model=schemas.ProgramaAdminDetalle, status_code=201)
def crear_programa(body: schemas.ProgramaAdminCreate, _sesion: dict = Depends(requerir_admin)):
    return service.crear_programa(body.model_dump())


@router.put("/programas/{programa_id}", response_model=schemas.ProgramaAdminDetalle)
def actualizar_programa(
    programa_id: int,
    body: schemas.ProgramaAdminUpdate,
    _sesion: dict = Depends(requerir_admin),
):
    data = body.model_dump(exclude_unset=True)
    return service.actualizar_programa(programa_id, data)


@router.delete("/programas/{programa_id}", status_code=204)
def eliminar_programa(programa_id: int, _sesion: dict = Depends(requerir_admin)):
    service.eliminar_programa(programa_id)


@router.post(
    "/programas/{programa_id}/secciones",
    response_model=schemas.SeccionAdminItem,
    status_code=201,
)
def crear_seccion(
    programa_id: int,
    body: schemas.SeccionAdminCreate,
    _sesion: dict = Depends(requerir_admin),
):
    return service.crear_seccion(programa_id, body.model_dump())


@router.put("/secciones/{seccion_id}", response_model=schemas.SeccionAdminItem)
def actualizar_seccion(
    seccion_id: int,
    body: schemas.SeccionAdminUpdate,
    _sesion: dict = Depends(requerir_admin),
):
    data = body.model_dump(exclude_unset=True)
    return service.actualizar_seccion(seccion_id, data)


@router.delete("/secciones/{seccion_id}", status_code=204)
def eliminar_seccion(seccion_id: int, _sesion: dict = Depends(requerir_admin)):
    service.eliminar_seccion(seccion_id)


@router.post(
    "/secciones/{seccion_id}/clases",
    response_model=schemas.ClaseAdminItem,
    status_code=201,
)
def crear_clase(
    seccion_id: int,
    body: schemas.ClaseAdminCreate,
    _sesion: dict = Depends(requerir_admin),
):
    return service.crear_clase(seccion_id, body.model_dump())


@router.put("/clases/{clase_id}", response_model=schemas.ClaseAdminItem)
def actualizar_clase(
    clase_id: int,
    body: schemas.ClaseAdminUpdate,
    _sesion: dict = Depends(requerir_admin),
):
    data = body.model_dump(exclude_unset=True)
    return service.actualizar_clase(clase_id, data)


@router.delete("/clases/{clase_id}", status_code=204)
def eliminar_clase(clase_id: int, _sesion: dict = Depends(requerir_admin)):
    service.eliminar_clase(clase_id)


@router.post(
    "/clases/{clase_id}/recursos/upload",
    response_model=schemas.ClaseRecursoItem,
    status_code=201,
)
async def subir_recurso_pdf(
    clase_id: int,
    archivo: UploadFile = File(...),
    titulo: str | None = Form(default=None),
    _sesion: dict = Depends(requerir_admin),
):
    nombre = archivo.filename or "documento.pdf"
    if not nombre.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos PDF.")

    contenido = await archivo.read()
    if not contenido:
        raise HTTPException(status_code=400, detail="El archivo PDF está vacío.")

    return service.subir_recurso_pdf(
        clase_id,
        contenido,
        titulo,
        nombre,
    )


@router.delete("/recursos/{recurso_id}", status_code=204)
def eliminar_recurso(recurso_id: int, _sesion: dict = Depends(requerir_admin)):
    service.eliminar_recurso(recurso_id)
