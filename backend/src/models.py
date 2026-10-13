from datetime import date, datetime

from pony.orm import Optional, PrimaryKey, Required, Set, composite_key

from src.db import DB_SCHEMA, db


class Admin(db.Entity):
    """Miembro del equipo de ATV. rol: "admin" (edita el classroom) o "coach".
    El equipo entra con Google; la contraseña queda solo para el admin original."""

    _table_ = (DB_SCHEMA, "admins")

    id = PrimaryKey(int, auto=True)
    email = Required(str, unique=True)
    nombre = Optional(str)
    password_hash = Optional(str, nullable=True)
    activo = Required(bool, default=True)
    creado_en = Required(datetime, default=datetime.utcnow)
    rol = Required(str, default="admin")
    area = Optional(str, nullable=True)
    google_sub = Optional(str, nullable=True)
    foto_url = Optional(str, nullable=True)


class SesionGuardada(db.Entity):
    """Sesiones en la base: sobreviven a un deploy. Se guarda el hash del token, nunca el token."""

    _table_ = (DB_SCHEMA, "sesiones")

    id = PrimaryKey(int, auto=True)
    token_hash = Required(str, unique=True)
    usuario_id = Required(int)
    tipo = Required(str)
    rol = Required(str)
    nombre = Required(str)
    email = Required(str)
    expira_en = Required(datetime)
    creado_en = Required(datetime, default=datetime.utcnow)


class ClienteExterno(db.Entity):
    _table_ = ("clients", "clientes")

    id = PrimaryKey(int, auto=True)
    nombre = Optional(str)
    email = Required(str, unique=True)
    emails_json = Optional(str, nullable=True)
    canal_discord = Optional(str, nullable=True)
    responsable = Optional(str, nullable=True)
    password_hash = Optional(str)
    plan_actual = Optional(str)
    estado_cliente = Optional(str)
    fecha_vencimiento = Optional(date)


class Programa(db.Entity):
    _table_ = (DB_SCHEMA, "programa")

    id = PrimaryKey(int, auto=True)
    titulo = Required(str)
    slug = Optional(str, unique=True)
    descripcion = Optional(str)
    orden = Required(int, default=0)
    cover_url = Optional(str)

    secciones = Set("Seccion")


class Seccion(db.Entity):
    _table_ = (DB_SCHEMA, "seccion")

    id = PrimaryKey(int, auto=True)
    programa = Required("Programa")
    titulo = Required(str)
    orden = Required(int, default=0)

    clases = Set("Clase")


class Clase(db.Entity):
    _table_ = (DB_SCHEMA, "clase")

    id = PrimaryKey(int, auto=True)
    seccion = Required("Seccion")
    titulo = Required(str)
    orden = Required(int, default=0)
    video_url = Optional(str)
    duracion_segundos = Optional(int)
    descripcion = Optional(str)

    recursos = Set("ClaseRecurso")


class ClaseRecurso(db.Entity):
    _table_ = (DB_SCHEMA, "clase_recurso")

    id = PrimaryKey(int, auto=True)
    clase = Required("Clase")
    titulo = Required(str)
    url = Required(str)
    orden = Required(int, default=0)


class Progreso(db.Entity):
    _table_ = (DB_SCHEMA, "progreso")

    id = PrimaryKey(int, auto=True)
    clase_id = Required(int)
    admin_id = Optional(int)
    cliente_id = Optional(int)
    completado = Required(bool, default=False)
    completado_en = Optional(datetime)


class Nota(db.Entity):
    _table_ = (DB_SCHEMA, "nota")

    id = PrimaryKey(int, auto=True)
    clase_id = Required(int)
    admin_id = Optional(int)
    cliente_id = Optional(int)
    contenido = Required(str)
    creado_en = Required(datetime, default=datetime.utcnow)


class Mensaje(db.Entity):
    _table_ = (DB_SCHEMA, "mensaje")

    id = PrimaryKey(int, auto=True)
    sesion_id = Required(str)
    usuario_id = Required(int)
    tipo_usuario = Required(str)
    rol = Required(str)
    contenido = Required(str)
    creado_en = Required(datetime, default=datetime.utcnow)


class Frente(db.Entity):
    """Un problema del negocio que el cliente está trabajando: resolver → documentar sus SOPs → revisarlos con el coach."""

    _table_ = (DB_SCHEMA, "frente")

    id = PrimaryKey(int, auto=True)
    usuario_id = Required(int)
    tipo_usuario = Required(str)
    slug = Required(str)
    vistas_json = Required(str, default="[]")
    sop_link = Optional(str, nullable=True)
    # {id de plantilla (ClaseRecurso): link de la versión completa del cliente}
    sops_json = Optional(str, nullable=True)
    automatizado = Required(bool, default=False)
    revisado = Required(bool, default=False)
    creado_en = Required(datetime, default=datetime.utcnow)
    actualizado_en = Required(datetime, default=datetime.utcnow)
    composite_key(usuario_id, tipo_usuario, slug)


class ConsultaCoach(db.Entity):
    """Lo que la guía no pudo resolver con material y quedó para el coach."""

    _table_ = (DB_SCHEMA, "consulta_coach")

    id = PrimaryKey(int, auto=True)
    usuario_id = Required(int)
    tipo_usuario = Required(str)
    texto = Required(str)
    slug = Optional(str, nullable=True)
    estado = Required(str, default="pendiente")
    creado_en = Required(datetime, default=datetime.utcnow)


class SolicitudSop(db.Entity):
    """Un SOP que el cliente pidió porque la guía no encontró material. Se avisa al canal de Discord."""

    _table_ = (DB_SCHEMA, "solicitud_sop")

    id = PrimaryKey(int, auto=True)
    usuario_id = Required(int)
    tipo_usuario = Required(str)
    nombre = Required(str)
    area = Required(str)
    problema = Required(str, column="entregable")
    consulta = Optional(str, nullable=True)
    estado = Required(str, default="pendiente")
    avisado_discord = Required(bool, default=False)
    creado_en = Required(datetime, default=datetime.utcnow)


class Canal(db.Entity):
    """Mensajería: "cliente" es el canal privado de un cliente con todo el equipo;
    "anuncios" es un canal que leen todos y donde escribe solo el equipo."""

    _table_ = (DB_SCHEMA, "canales")

    id = PrimaryKey(int, auto=True)
    tipo = Required(str)
    cliente_id = Optional(int, nullable=True, unique=True)
    nombre = Required(str)
    descripcion = Optional(str, nullable=True)
    ultimo_mensaje_en = Optional(datetime, nullable=True)
    creado_en = Required(datetime, default=datetime.utcnow)
    mensajes = Set("MensajeCanal")


class MensajeCanal(db.Entity):
    """autor_tipo: "cliente" (id de clients.clientes) o "admin" (id de admins: todo el equipo)."""

    _table_ = (DB_SCHEMA, "mensajes_canal")

    id = PrimaryKey(int, auto=True)
    canal = Required(Canal)
    autor_tipo = Required(str)
    autor_id = Required(int)
    texto = Optional(str)  # puede ir vacío si el mensaje solo lleva adjuntos
    respuesta_a = Optional(int, nullable=True)
    editado_en = Optional(datetime, nullable=True)
    borrado = Required(bool, default=False)
    creado_en = Required(datetime, default=datetime.utcnow)


class LecturaCanal(db.Entity):
    """Hasta qué mensaje leyó cada persona en cada canal (para los no leídos)."""

    _table_ = (DB_SCHEMA, "lecturas_canal")

    id = PrimaryKey(int, auto=True)
    canal_id = Required(int)
    lector_tipo = Required(str)
    lector_id = Required(int)
    ultimo_leido_id = Required(int, default=0)
    composite_key(canal_id, lector_tipo, lector_id)


class Mencion(db.Entity):
    """Un @ a alguien del equipo en un mensaje. Para el coach es una alerta: queda pendiente
    hasta que escribe en ese canal (o la marca como resuelta)."""

    _table_ = (DB_SCHEMA, "menciones")

    id = PrimaryKey(int, auto=True)
    mensaje_id = Required(int)
    canal_id = Required(int)
    admin_id = Required(int)
    creado_en = Required(datetime, default=datetime.utcnow)
    respondida_en = Optional(datetime, nullable=True)
    composite_key(mensaje_id, admin_id)


class Adjunto(db.Entity):
    """Archivo de un mensaje. Se sube antes de enviar (mensaje_id vacío) y se ata al enviar.
    Vive fuera de la carpeta pública: solo se baja con un link firmado."""

    _table_ = (DB_SCHEMA, "adjuntos")

    id = PrimaryKey(int, auto=True)
    canal_id = Required(int)
    mensaje_id = Optional(int, nullable=True)
    subido_por_tipo = Required(str)
    subido_por_id = Required(int)
    nombre = Required(str)
    archivo = Required(str, unique=True)
    tipo_mime = Required(str)
    tamano = Required(int)
    creado_en = Required(datetime, default=datetime.utcnow)


class ConsultaGuia(db.Entity):
    """Lo que alguien le preguntó a la guía y qué le recomendó. Es lo que el cerebro aprende de
    cada cliente: qué le preocupa, con sus palabras."""

    _table_ = (DB_SCHEMA, "consultas_guia")

    id = PrimaryKey(int, auto=True)
    usuario_id = Required(int)
    tipo_usuario = Required(str)
    texto = Required(str)
    clases_json = Required(str, default="[]")
    frente = Optional(str, nullable=True)
    creado_en = Required(datetime, default=datetime.utcnow)


# ---------- Lo que el cerebro aprende de las conversaciones ----------
# Base para lo que viene: completar con Tab en la voz de cada coach, seguimientos automáticos
# y una base de conocimiento por nicho. Todo hecho aprendido guarda su cita textual y el
# mensaje de donde salió: la IA propone, la evidencia queda.


class PerfilCliente(db.Entity):
    """Quién es el cliente según lo que dijo en sus conversaciones (no lo que cargó atv-clients)."""

    _table_ = (DB_SCHEMA, "cerebro_perfil_cliente")

    cliente_id = PrimaryKey(int)
    nicho = Optional(str, nullable=True)  # slug normalizado: "fitness", "idiomas", "marketing-digital"
    nicho_texto = Optional(str, nullable=True)  # como lo dijo el cliente
    que_vende = Optional(str, nullable=True)
    etapa = Optional(str, nullable=True)  # arrancando | validando | vendiendo | escalando
    facturacion = Optional(str, nullable=True)  # textual, solo si lo dijo
    objetivo = Optional(str, nullable=True)
    tono_cliente = Optional(str, nullable=True)  # cómo escribe el cliente: formal, relajado, ansioso…
    actualizado_en = Required(datetime, default=datetime.utcnow)


class HechoCerebro(db.Entity):
    """Algo concreto que pasó en una conversación, con la cita exacta que lo prueba."""

    _table_ = (DB_SCHEMA, "cerebro_hechos")

    id = PrimaryKey(int, auto=True)
    cliente_id = Required(int, index=True)
    canal_id = Required(int)
    tipo = Required(str)  # tema | dolor | objecion | recomendacion | le_funciono | no_le_funciono | logro | pedido
    texto = Required(str)  # resumen corto en tercera persona
    cita = Required(str)  # fragmento textual del mensaje
    concepto = Optional(str, nullable=True)  # id de conceptos.json, lo asigna el código
    mensaje_id = Required(int, index=True)
    autor_tipo = Required(str)  # cliente | admin
    autor_id = Required(int)
    dicho_en = Required(datetime)
    aprendido_en = Required(datetime, default=datetime.utcnow)
    modelo = Optional(str, nullable=True)


class VozEquipo(db.Entity):
    """Cómo escribe cada persona del equipo: rasgos medidos en código y mensajes de ejemplo.
    Es lo que se le da a la IA para que complete o haga seguimientos con su tono."""

    _table_ = (DB_SCHEMA, "cerebro_voz")

    admin_id = PrimaryKey(int)
    rasgos_json = Required(str, default="{}")
    muestras_json = Required(str, default="[]")  # ids de mensajes representativos
    mensajes_analizados = Required(int, default=0)
    actualizado_en = Required(datetime, default=datetime.utcnow)


class EstadoAprendizaje(db.Entity):
    """Hasta qué mensaje ya aprendió el cerebro, por canal."""

    _table_ = (DB_SCHEMA, "cerebro_estado")

    canal_id = PrimaryKey(int)
    ultimo_mensaje_id = Required(int, default=0)
    actualizado_en = Required(datetime, default=datetime.utcnow)
