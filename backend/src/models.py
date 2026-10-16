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
    voz_tab = Optional(int, nullable=True)  # con la voz de quién le sugiere el Tab (vacío = la propia)
    # Borrado del equipo: no aparece más ni entra, pero la fila queda para que sus mensajes y altas
    # sigan diciendo quién los hizo.
    borrado = Required(bool, default=False)


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
    miembro_id = Optional(int, nullable=True)  # si entró alguien del equipo del cliente


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
    miembro_id = Optional(int, nullable=True)
    completado = Required(bool, default=False)
    completado_en = Optional(datetime)


class Nota(db.Entity):
    _table_ = (DB_SCHEMA, "nota")

    id = PrimaryKey(int, auto=True)
    clase_id = Required(int)
    admin_id = Optional(int)
    cliente_id = Optional(int)
    miembro_id = Optional(int, nullable=True)
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
    estado = Required(str, default="pendiente")  # pendiente | en_proceso | entregado
    avisado_discord = Required(bool, default=False)
    creado_en = Required(datetime, default=datetime.utcnow)
    entrega_url = Optional(str, nullable=True)  # el link del SOP que se le pasó
    resuelto_por = Optional(int, nullable=True)  # admins.id
    resuelto_en = Optional(datetime, nullable=True)


class Canal(db.Entity):
    """Mensajería: "cliente" es el canal privado de un cliente con todo el equipo;
    "anuncios" es un canal que leen todos y donde escribe solo el equipo;
    "grupo" es un canal creado por alguien del equipo que ven (y usan) los roles elegidos;
    "directo" es un mensaje privado entre dos personas del equipo (solo lo ven ellas dos)."""

    _table_ = (DB_SCHEMA, "canales")

    id = PrimaryKey(int, auto=True)
    tipo = Required(str)
    cliente_id = Optional(int, nullable=True, unique=True)
    nombre = Required(str)
    descripcion = Optional(str, nullable=True)
    roles_json = Optional(str, nullable=True)  # grupo: ["equipo", "boost", ...] (ver roles_canal.py)
    creado_por = Optional(int, nullable=True)  # grupo: id del admin que lo creó
    # directo: mensaje privado entre dos del equipo, como un DM de Discord. Los ids de los dos (admins).
    participantes_json = Optional(str, nullable=True)
    orden = Optional(int, nullable=True)  # canales grupales y anuncios: el orden que les dio un admin (arrastrando)
    # Cliente archivado por el equipo (arrastrado a "Inactivos"): sale de su grupo, el chat sigue igual.
    inactivo = Required(bool, default=False)
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
    # Solo en el historial traído de Discord (id negativo): el nombre como aparecía allá.
    autor_nombre = Optional(str, nullable=True)
    # Si lo escribió alguien del equipo del cliente: autor_id sigue siendo el cliente y acá va quién.
    miembro_id = Optional(int, nullable=True)
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


class SugerenciaIA(db.Entity):
    """Cada sugerencia de la IA al escribir (Tab) y si la persona la usó. Es lo que permite medir
    y mejorar: qué sugerencias sirven, de quién, en qué conversaciones."""

    _table_ = (DB_SCHEMA, "cerebro_sugerencias")

    id = PrimaryKey(int, auto=True)
    admin_id = Required(int, index=True)
    canal_id = Required(int)
    borrador = Optional(str, nullable=True)
    sugerencia = Required(str)
    usada = Required(bool, default=False)
    ms = Optional(int, nullable=True)
    modelo = Optional(str, nullable=True)
    creado_en = Required(datetime, default=datetime.utcnow)


class FotoPerfil(db.Entity):
    """Foto de perfil subida desde "Mi cuenta". Vive en el classroom (no toca atv-clients) y, para el
    equipo, manda por encima de la foto de Google."""

    _table_ = (DB_SCHEMA, "fotos_perfil")

    id = PrimaryKey(int, auto=True)
    tipo = Required(str)  # cliente | admin
    usuario_id = Required(int)
    archivo = Required(str, unique=True)
    actualizado_en = Required(datetime, default=datetime.utcnow)
    composite_key(tipo, usuario_id)


class AccionRapida(db.Entity):
    """Botón del panel derecho del chat: un mensaje armado que el coach manda con un clic
    (su link de agenda, un pedido de avance…). Cada persona del equipo tiene las suyas."""

    _table_ = (DB_SCHEMA, "acciones_rapidas")

    id = PrimaryKey(int, auto=True)
    admin_id = Required(int, index=True)
    nombre = Required(str)
    texto = Required(str)
    orden = Required(int, default=0)
    creado_en = Required(datetime, default=datetime.utcnow)


class GastoIA(db.Entity):
    """Tokens que se usaron por día y por uso (aprendizaje, tab). Sirve para ver el gasto real y para el
    tope diario del aprendizaje, sin depender de estimaciones."""

    _table_ = (DB_SCHEMA, "cerebro_gasto")

    id = PrimaryKey(int, auto=True)
    fecha = Required(date)
    uso = Required(str)
    llamadas = Required(int, default=0)
    entrada = Required(int, default=0)
    cache_escrita = Required(int, default=0)
    cache_leida = Required(int, default=0)
    salida = Required(int, default=0)
    composite_key(fecha, uso)


class MiembroCliente(db.Entity):
    """Alguien del equipo de un cliente (socio, setter, closer…). Entra con su mail y la misma clave
    del cliente; ve el chat del cliente y todo el classroom, y su acceso dura lo que dura el del cliente."""

    _table_ = (DB_SCHEMA, "miembros_cliente")

    id = PrimaryKey(int, auto=True)
    cliente_id = Required(int, index=True)
    email = Required(str, unique=True)
    nombre = Required(str)
    rol = Required(str)  # socio | setter | closer | editor | otro
    creado_en = Required(datetime, default=datetime.utcnow)


class LimiteEquipo(db.Entity):
    """Cuántas personas de su equipo puede sumar un cliente según su plan (si no está, va el de por defecto)."""

    _table_ = (DB_SCHEMA, "limites_equipo")

    plan = PrimaryKey(str)
    maximo = Required(int)


class RoadmapDoc(db.Entity):
    """Un documento del roadmap del cliente (el Google Doc de próximos pasos que deja cada coach).
    Mismo coach + mismo título = versiones del mismo roadmap: la más nueva es la vigente y las
    anteriores quedan como reemplazadas. El "que tenés que seguir ahora" lo marca el coach."""

    _table_ = (DB_SCHEMA, "roadmap_docs")

    id = PrimaryKey(int, auto=True)
    cliente_id = Required(int, index=True)
    coach_id = Optional(int, nullable=True)  # admins.id
    area = Optional(str, nullable=True)  # lo que trabaja ese coach: "Setting y closing"
    titulo = Required(str)  # "Ventas", "Roadmap inicial"
    tipo = Required(str, default="revision")  # inicial | revision | complementario
    url = Optional(str, nullable=True)  # un Doc externo (opcional: los pasos pueden vivir acá adentro)
    fathom_url = Optional(str, nullable=True)  # la grabación de la llamada, para que el cliente la vea
    # Próximos pasos escritos en el roadmap: [{"id", "texto", "quien": cliente|atv, "hecho", "hecho_en", "hecho_por"}].
    # Los tildan el cliente (o su equipo) y el coach.
    pasos_json = Optional(str, nullable=True)
    fecha = Required(date)
    pasos_total = Optional(int, nullable=True)
    paso_actual = Optional(int, nullable=True)
    principal = Required(bool, default=False)
    creado_por = Optional(int, nullable=True)
    creado_en = Required(datetime, default=datetime.utcnow)


class AltaCliente(db.Entity):
    """Un alta hecha desde el classroom: crea la sesión de onboarding, el canal de Discord (contingencia)
    y la ficha en clients.clientes. El mail de onboarding sale aparte, una sola vez, con un botón."""

    _table_ = (DB_SCHEMA, "altas_clientes")

    id = PrimaryKey(int, auto=True)
    cliente_id = Required(int, index=True)
    session_id = Required(str)  # sesión de atv-onboarding
    nombre = Required(str)
    email = Required(str)
    plan = Required(str)  # como lo nombra el onboarding: Boost | Mentoría | Advantage
    canal = Required(str)
    discord_invite_url = Optional(str, nullable=True)
    discord_error = Optional(str, nullable=True)
    # Si el alta completó una ficha que ya existía (la de la seña): cómo estaba antes, para poder anular.
    ficha_previa = Optional(str, nullable=True)
    creado_por = Required(int)
    creado_en = Required(datetime, default=datetime.utcnow)
    mail_enviado_en = Optional(datetime, nullable=True)
    mail_enviado_por = Optional(int, nullable=True)


class FathomConexion(db.Entity):
    """El Fathom de cada coach, conectado desde Mi cuenta con su API key (cifrada: nadie la ve)."""

    _table_ = (DB_SCHEMA, "fathom_conexiones")

    id = PrimaryKey(int, auto=True)
    admin_id = Required(int, unique=True)
    clave_cifrada = Required(str)
    conectada_en = Required(datetime, default=datetime.utcnow)
    ultima_sync = Optional(datetime, nullable=True)
    error = Optional(str, nullable=True)  # lo último que respondió mal Fathom (clave vencida, etc.)
    # Webhook de Fathom: avisa apenas una llamada está lista (sin buscar cada 15 minutos).
    webhook_id = Optional(str, nullable=True)
    webhook_secreto_cifrado = Optional(str, nullable=True)  # el que devuelve Fathom al crearlo, para verificar la firma
    webhook_token = Optional(str, nullable=True, unique=True)  # parte de la URL: dice de qué coach es el aviso


class Llamada(db.Entity):
    """Una llamada grabada con Fathom por un coach (carpeta Llamadas). cliente_id: el cliente que
    estaba invitado (por su mail), si se encontró."""

    _table_ = (DB_SCHEMA, "llamadas")

    id = PrimaryKey(int, auto=True)
    admin_id = Required(int, index=True)
    fathom_id = Required(str, unique=True)  # recording_id de Fathom
    titulo = Optional(str, nullable=True)
    inicio = Optional(datetime, nullable=True)  # UTC
    duracion_min = Optional(int, nullable=True)
    url = Optional(str, nullable=True)
    share_url = Optional(str, nullable=True)
    invitados_json = Optional(str, nullable=True)  # [{"nombre", "email", "externo"}]
    transcripcion = Optional(str, nullable=True)
    resumen = Optional(str, nullable=True)  # el resumen que arma Fathom
    # Lo que se habló, para el contexto del próximo coach: temas, decisiones y compromisos, con cita.
    puntos_json = Optional(str, nullable=True)
    cliente_id = Optional(int, nullable=True, index=True)
    creado_en = Required(datetime, default=datetime.utcnow)


class RoadmapAprendido(db.Entity):
    """Lo que el cerebro guarda de cada roadmap armado con IA, para que el próximo salga mejor:
    el borrador que propuso la IA, cómo quedó después de que el coach lo corrigió (también si lo
    edita más tarde) y qué pasó con cada paso según la llamada siguiente."""

    _table_ = (DB_SCHEMA, "cerebro_roadmaps")

    id = PrimaryKey(int, auto=True)
    cliente_id = Required(int, index=True)
    coach_id = Required(int, index=True)  # quien lo armó
    voz_id = Optional(int, nullable=True)  # con la voz de quién se escribió
    doc_id = Optional(int, nullable=True, index=True)  # el roadmap guardado (vacío si quedó en borrador)
    fathom_url = Optional(str, nullable=True)
    transcripcion = Optional(str, nullable=True)
    borrador_json = Required(str)  # lo que propuso la IA
    final_json = Optional(str, nullable=True)  # lo que guardó el coach (pasos, título, mensaje)
    cambios_json = Optional(str, nullable=True)  # qué corrigió el coach: pasos sacados/agregados/reescritos, mensaje
    editado_despues = Required(bool, default=False)
    enviado = Required(bool, default=False)
    # Lo que la IA leyó en la llamada siguiente sobre los pasos de este roadmap: hecho / parcial / no, y el resultado.
    resultado_json = Optional(str, nullable=True)
    resultado_en = Optional(datetime, nullable=True)
    creado_en = Required(datetime, default=datetime.utcnow)
    guardado_en = Optional(datetime, nullable=True)


class AvisoMail(db.Entity):
    """El último aviso por mail que se le mandó a un cliente por mensajes sin leer en su chat."""

    _table_ = (DB_SCHEMA, "avisos_mail")

    id = PrimaryKey(int, auto=True)
    canal_id = Required(int, unique=True)
    ultimo_mensaje_id = Required(int)  # hasta qué mensaje del equipo ya se avisó
    enviado_en = Required(datetime, default=datetime.utcnow)


class OnboardingCerebro(db.Entity):
    """Lo que el cliente contó en su formulario de onboarding, ya leído por el cerebro: las respuestas
    tal cual y la ficha armada (oferta, precio, avatar, facturación, objetivo…)."""

    _table_ = (DB_SCHEMA, "cerebro_onboarding")

    cliente_id = PrimaryKey(int)
    session_id = Required(str)
    respondido_en = Optional(datetime, nullable=True)
    respuestas_json = Required(str)  # {"5": "…", "6": "…"}
    ficha_json = Required(str)
    importado_en = Required(datetime, default=datetime.utcnow)


class PizarraOnboarding(db.Entity):
    """La pizarra a lápiz de un onboarding (carpeta Onboardings): lo que el cliente contó en el formulario,
    ordenado para el coach que lo atiende en el 1 a 1. Se arma una vez por formulario enviado; si el cliente
    lo vuelve a mandar, se rearma."""

    _table_ = (DB_SCHEMA, "pizarras_onboarding")

    id = PrimaryKey(int, auto=True)
    session_id = Required(str, unique=True)
    respondido_en = Optional(datetime, nullable=True)  # el formulario con el que se armó
    datos_json = Required(str)
    modelo = Optional(str, nullable=True)
    creado_en = Required(datetime, default=datetime.utcnow)
