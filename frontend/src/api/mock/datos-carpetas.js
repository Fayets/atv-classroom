// Datos de prueba de las carpetas del equipo (Clientes, Cierres, Onboardings, Llamadas, Cuellos, Biblioteca, SOPs).
// Las formas siguen lo que devuelven los servicios del backend; la lógica está en rutas/carpetas.js.

// Generador pseudoaleatorio con semilla: los mismos datos en cada recarga.
export const semilla = (a) => () => {
  a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
export const elegir = (rnd, lista) => lista[Math.floor(rnd() * lista.length)]
export const entre = (rnd, a, b) => a + Math.floor(rnd() * (b - a + 1))

// ---------------------------------------------------------------- Planes
export const PRECIO = { entry: 1500, mid: 3000, high: 5500, boost: 4500, mentoria: 2500, dfy: 7000, '2k': 2000 }
export const DURACION = { entry: 120, mid: 120, high: 180, boost: 240, mentoria: 120, dfy: 180, '2k': 90 }
// Plan del classroom → nombre del programa en contratos y onboardings.
export const PROGRAMA = { entry: 'Entry Level', mid: 'Mid Level', high: 'High Level', boost: 'Boost', mentoria: 'Mentoría' }
export const PLAN_ONBOARDING = { ...PROGRAMA, '2k': '2K' }
export const PLAN_DE_PROGRAMA = { 'Entry Level': 'entry', 'Mid Level': 'mid', 'High Level': 'high', Boost: 'boost', Mentoría: 'mentoria', '2K': '2k' }

// ---------------------------------------------------------------- Cierre de mes
export const CUELLOS = ['Mentalidad', 'Equipo', 'Marketing y Contenido', 'Ventas', 'Sistemas y operaciones']
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const OFERTAS = [
  'Programa grupal de 12 semanas para que coaches de fitness armen su primera oferta high ticket.',
  'Mentoría 1 a 1 para nutricionistas que quieren vender planes anuales en lugar de consultas sueltas.',
  'Curso online más comunidad para traders que recién empiezan, con cuenta demo guiada.',
  'Servicio de gestión de redes y embudos para clínicas estéticas.',
  'Programa de ventas por WhatsApp para emprendedores de moda.',
  'Acompañamiento mensual para abogados que quieren captar clientes con contenido.',
  'Membresía de recetas y planificación para madres que quieren comer mejor sin tiempo.',
  'Consultoría para armar el equipo comercial de agencias de marketing.',
]
export const AVATARES = [
  'Coaches de 30 a 45 años que ya facturan entre 2 y 5 mil dólares y se quedaron estancados.',
  'Emprendedoras que venden servicios y no logran sostener un flujo de leads estable.',
  'Profesionales que trabajan en relación de dependencia y quieren armar su negocio de a poco.',
  'Dueños de agencias chicas que dependen de uno o dos clientes grandes.',
]
export const CUELLO_POR_QUE = {
  Mentalidad: 'Me cuesta sostener la constancia cuando una semana sale mal; dejo de publicar y se me cae todo el ritmo.',
  Equipo: 'Hago todo yo: edición, setting y seguimiento. Contratar me da miedo porque no sé qué delegar primero.',
  'Marketing y Contenido': 'Publico pero no tengo claro qué contenido trae llamadas. Los reels tienen vistas y no conversaciones.',
  Ventas: 'Agendo bastante pero en la llamada no logro cerrar; siento que me falta manejar mejor las objeciones de precio.',
  'Sistemas y operaciones': 'Mis leads viven en chats sueltos. No tengo un CRM ni seguimiento y se me pierden oportunidades.',
}
export const SATISFACCION_POR_QUE = [
  'El acompañamiento del coach fue clave este mes, me ordenó las prioridades.',
  'Las clases son muy buenas pero me falta tiempo para implementarlas todas.',
  'Me gustó el roadmap, lo pude seguir paso a paso y vi resultados en las llamadas.',
  'Estoy conforme, aunque me gustaría respuestas más rápidas en el chat.',
  'Todo muy bien, el SOP de ventas me sirvió un montón.',
  'Esperaba más material para mi nicho puntual.',
]
export const PROPUESTAS = [
  'Sumar plantillas de guiones por nicho para reels.',
  'Una clase en vivo mensual de revisión de llamadas de venta.',
  'Un CRM sencillo integrado al classroom.',
  'Más ejemplos reales de ofertas de clientes del mismo nicho.',
  'Un espacio para compartir wins entre clientes del mismo plan.',
  'Checklists descargables al final de cada clase.',
]
export const PREGUNTAS_TYPEFORM = [
  '¿Qué tan conforme estás con ATV este mes?',
  '¿Cuál es tu principal cuello de botella?',
  '¿Por qué?',
  '¿Qué podríamos agregar o implementar de nuevo?',
]
export const RANGOS_TYPEFORM = ['No puedo pedir más', 'Muy conforme con el servicio', 'Estoy conforme', 'No estoy conforme']

// ---------------------------------------------------------------- Formulario de onboarding (49 preguntas)
export function respuestasFormulario(nombre) {
  const p = nombre.split(' ')[0]
  const r = [
    `${nombre}, +54 9 11 5555-0000, ${p.toLowerCase()}@ejemplo.com`,
    'Es un negocio propio, tengo decisión total sobre los cambios.',
    'Creador de contenido y coach.',
    'Instagram y YouTube; Instagram es el que más trae.',
    'Programa grupal de 12 semanas con acompañamiento semanal.',
    'Trabajo con emprendedores que recién empiezan; me eligen por el trato cercano y los resultados rápidos.',
    'Personas que quieren dejar su empleo pero no saben cómo armar su primera oferta.',
    'Vendo a USD 997; lo definí mirando lo que cobra la competencia.',
    'Reels y stories; los reels traen más vistas pero las stories traen las conversaciones calificadas.',
    'Publico sin calendario, depende del tiempo que tenga.',
    'Más que nada por percepción; las views rondan los 4 mil por reel.',
    'Abro unos 60 chats por mes, casi todos por DM de Instagram.',
    'Facturé unos 18 mil dólares en seis meses, con meses muy desparejos.',
    'Agenda el 30 por ciento de los chats y asiste el 60 por ciento.',
    'Cierro 1 de cada 4 llamadas.',
    'No tengo un funnel armado; todo es por mensaje directo.',
    'Atiendo a cualquiera que escriba.',
    'No tengo seguimiento para los que no compran.',
    'Instagram, Calendly, Notion y una planilla.',
    'Estoy solo, una editora part time.',
    'Todo pasa por mí.',
    'Clases en vivo semanales, comunidad y una llamada mensual.',
    'Tengo 22 clientes activos; los mido por resultados que me cuentan.',
    'NA',
    'NA',
    'Desde que pagan reciben un mail de bienvenida y una llamada de arranque.',
    'Un cliente pasó de 0 a 3 mil dólares mensuales en 90 días.',
    'Probé ads y un curso grabado; no funcionó porque no tenía sistema de ventas.',
    'Que depende de mí para todo y no escalo.',
    'Me falta un proceso de ventas, tiempo para crear contenido y un equipo.',
    'Llegar a 10 mil dólares mensuales estables en 4 meses.',
    'Los videos de Juan en YouTube.',
    'Los videos largos con casos reales.',
    'Porque muestran el proceso completo.',
    'Reels cortos con un consejo accionable.',
    'Son directos y se pueden aplicar el mismo día.',
    'Análisis de casos de clientes.',
    'Se ve el antes y el después.',
    'Las stories diarias, se siente cercano.',
    'La llamada de diagnóstico me dio claridad.',
    'Ver que otros con mi mismo problema lo resolvieron.',
    'Dos semanas.',
    'Que me mostraran antes un caso de mi nicho.',
    'Nada puntual.',
    '8',
    'La garantía y el roadmap personalizado.',
    'El precio, me preocupaba la inversión.',
    'Boost',
    'No sé si había algo; me hubiera servido ver el classroom antes.',
  ]
  return Object.fromEntries(r.map((v, i) => [String(i + 1), v]))
}

// ---------------------------------------------------------------- Pizarra del onboarding
const P = (texto, p) => ({ texto, p })
export function pizarra(nombre, plan) {
  const persona = nombre.split(' ')[0]
  return {
    negocios: [
      {
        persona,
        marca: null,
        rubro: 'coaching de negocios online',
        que_vende: P('Programa grupal de 12 semanas con acompañamiento semanal', '5'),
        contexto: [P('Vende a USD 997 con meses de facturación desparejos', '8'), P('22 clientes activos y una editora part time', '23'), P('Hoy depende de él para todo el proceso', '21')],
        embudo: [
          { etapa: 'Chats', valor: 60, p: '12' },
          { etapa: 'Agendas', valor: 18, p: '14' },
          { etapa: 'Llamadas', valor: 11, p: '14' },
          { etapa: 'Ventas', valor: 3, p: '15' },
        ],
        cuellos: [
          {
            titulo: 'Sin proceso de ventas',
            sintoma: { texto: 'Agenda bastante pero cierra pocas llamadas', evidencia: [{ cita: null, dato: 'Cierra 1 de cada 4 llamadas', p: '15' }, { cita: 'Atiendo a cualquiera que escriba', dato: null, p: '17' }] },
            causa: 'No califica antes de la llamada: el equipo de ventas es una sola persona atendiendo todo tipo de leads.',
            impacto: 'Pierde horas semanales en llamadas que no tienen chance de cierre.',
            solucion: 'Armar un filtro de tres preguntas antes de agendar y un guion de llamada con manejo de objeciones.',
            su_frase: { cita: 'Que depende de mí para todo y no escalo', p: '29' },
            falta: 'Cuántas de las llamadas son de personas sin capacidad de pago',
          },
          {
            titulo: 'Contenido sin sistema',
            sintoma: { texto: 'Publica sin calendario y las vistas no se convierten en chats', evidencia: [{ cita: 'Publico sin calendario, depende del tiempo que tenga', dato: null, p: '10' }] },
            causa: 'Los reels no tienen un llamado a la acción asociado a la oferta, solo buscan alcance.',
            impacto: 'El 90 por ciento de las vistas no genera conversación.',
            solucion: 'Definir tres pilares de contenido y un CTA fijo por pieza, con calendario semanal.',
            su_frase: null,
            falta: null,
          },
        ],
        prioridad: { cuello: 1, por_que: 'Con 11 llamadas al mes, mejorar el cierre mueve la facturación más rápido que sumar tráfico.' },
        decidir: ['¿Qué filtro de calificación va a usar antes de agendar?', '¿Quién va a hacer el seguimiento de los que no compran?', '¿Cuántas horas semanales puede dedicar a ventas?'],
        freno: { cita: 'Que depende de mí para todo y no escalo', p: '30' },
        hoy: [P('Factura unos 3 mil dólares mensuales, desparejos', '13'), P('60 chats por mes', '12')],
        meta: { titular: '10K mensuales estables', detalle: ['Hoy factura 3K', 'Quiere sostenerlo en 4 meses'], p: '31' },
      },
    ],
    termometro: [
      { nombre: 'Contenido publicado', estado: 'algo', nota: 'sin calendario', p: '10' },
      { nombre: 'Leads medidos', estado: 'algo', nota: 'solo percepción', p: '11' },
      { nombre: 'Precio definido', estado: 'listo', nota: 'USD 997', p: '8' },
      { nombre: 'Proceso de ventas', estado: 'nada', nota: 'sin funnel ni seguimiento', p: '16' },
      { nombre: 'Equipo', estado: 'nada', nota: 'todo pasa por él', p: '21' },
    ],
    alertas: [{ texto: 'Todo el negocio depende de una sola persona', p: '21' }, { texto: 'No hay métricas del embudo más allá de lo que recuerda', p: null }],
    esperan: [P('Un proceso de ventas que funcione sin él', '41')],
    citas: [],
    problemas: [P('Proceso de ventas', '29'), P('Contenido', '29'), P('Equipo', '29')],
    llegada: [
      { etiqueta: 'Nos conoció por', valor: 'Los videos de Juan en YouTube', p: '32' },
      { etiqueta: 'Tardó en decidir', valor: 'Dos semanas', p: '42' },
      { etiqueta: 'Convencido antes de la llamada', valor: '8/10', p: '45' },
    ],
    por_que_entro: [P('La llamada de diagnóstico', '40')],
    sin_responder: ['24', '25'],
    total_preguntas: 49,
    nombre,
    plan,
    version: 3,
  }
}

// ---------------------------------------------------------------- Llamadas
export function transcripcion(cliente, coach, tema) {
  const c = cliente || 'Invitado'
  return [
    `${coach}: Hola ${c.split(' ')[0]}, ¿cómo venís? Antes de arrancar, contame cómo te fue con lo de la semana pasada.`,
    `${c}: Bien, avancé con casi todo. Lo único que me trabó fue ${tema}.`,
    `${coach}: Perfecto. ¿Qué intentaste hasta ahora?`,
    `${c}: Probé un par de cosas pero sin un orden claro, y no medí los resultados.`,
    `${coach}: Ahí está lo primero: sin medir no sabemos qué ajustar. Vamos a definir tres números para mirar cada semana.`,
    `${c}: Dale. ¿Cuáles serían?`,
    `${coach}: Conversaciones abiertas, llamadas agendadas y ventas cerradas. Con eso ya vemos dónde se cae.`,
    `${c}: Tiene sentido. Hoy tengo unas 40 conversaciones al mes y cierro dos o tres.`,
    `${coach}: Entonces el cuello no es el tráfico, es lo que pasa entre la conversación y la llamada.`,
    `${c}: Sí, creo que ahí me falta seguimiento.`,
    `${coach}: Te propongo esto para la próxima semana: un mensaje de seguimiento a las 24 horas y otro a las 72 horas, con una pregunta concreta.`,
    `${c}: Perfecto, lo armo hoy mismo.`,
    `${coach}: Y yo te paso el SOP de seguimiento y revisamos los resultados en la próxima llamada.`,
    `${c}: Genial, gracias.`,
  ].join('\n')
}
export const resumenLlamada = (tema) =>
  `## Resumen\n- Se revisó el avance de la semana y el principal freno: **${tema}**.\n- Se definieron tres números a medir cada semana: conversaciones, agendas y ventas.\n\n## Próximos pasos\n- Armar el seguimiento a 24 y 72 horas [ver el momento](https://fathom.video/share/ejemplo?timestamp=612).\n- El coach envía el SOP de seguimiento.`

// ---------------------------------------------------------------- Cuellos de botella
export const FORMATOS = {
  cuello: { nombre: 'Cuello de botella', titulo: 'Diagnóstico', secciones: ['Diagnóstico', 'Causas', 'Causa vs potenciadores', 'Qué no hacer', 'Solución', 'Métricas a mirar', 'Expectativas', 'Cierre'] },
  historias: { nombre: 'Feedback de historias', titulo: 'Feedback de historias', secciones: ['Lo que ya funciona', 'Story por story', 'Los 3 cambios que más mueven', 'Próxima secuencia', 'Qué mirar'] },
  reels: { nombre: 'Feedback de reels y contenido', titulo: 'Feedback de contenido', secciones: ['Lo que ya funciona', 'Pieza por pieza', 'El patrón que se repite', 'Guion del próximo', 'Qué mirar'] },
  llamada: { nombre: 'Revisión de llamada de venta', titulo: 'Revisión de llamada', secciones: ['Cómo fue la llamada', 'Momentos clave', 'Objeciones y respuesta', 'Lo que hay que sostener', 'Guion de la próxima', 'Cómo quedó'] },
  setting: { nombre: 'Revisión de chats de setting', titulo: 'Revisión de setting', secciones: ['Dónde se cae la conversación', 'Chat por chat', 'Mensajes listos para usar', 'Qué medir'] },
  embudo: { nombre: 'Revisión de embudo u oferta', titulo: 'Revisión de embudo', secciones: ['El recorrido hoy', 'Dónde se pierde la gente', 'Cambios en orden', 'Qué no tocar', 'Qué medir'] },
}
export const SECCIONES_CUELLO = FORMATOS.cuello.secciones

// Las secciones de un diagnóstico de cuello de botella (objeto sección → texto).
export function baseCuello(nombre, tema = 'las ventas') {
  const p = nombre.split(' ')[0]
  return {
    Diagnóstico: `El problema de ${p} no es el tráfico: es lo que pasa entre la conversación y la llamada.\nNúmeros:\n- 40 conversaciones al mes y solo 2 o 3 ventas: cierra menos del 8 por ciento de lo que abre.\n- Sin seguimiento después del primer mensaje: se pierde el 70 por ciento de los leads.\nNadie hace el trabajo de calificar y retomar al lead, por eso pasa lo que pasa con ${tema}.`,
    Causas: `### Causa 1: no hay seguimiento\nDespués del primer mensaje el lead queda sin respuesta. Es la causa de fondo.\n### Causa 2: no se mide el embudo\nNo hay un número semanal, así que nadie ve dónde se cae.`,
    'Causa vs potenciadores': 'La causa de fondo es la falta de seguimiento. El contenido y los anuncios son potenciadores: traen más leads, pero sin la causa resuelta solo se pierden más rápido.',
    'Qué no hacer': '- **No sumar más tráfico todavía.** Va a duplicar los leads perdidos.\n- **No cambiar la oferta.** Los números no muestran un problema de oferta.',
    Solución: `### 5.1 Seguimiento a 24 y 72 horas\nUn mensaje corto con una pregunta concreta.\n> "${p}, ¿pudiste ver lo que te mandé? Si querés lo repasamos en 10 minutos."\n### 5.2 Tablero semanal\nTres números: conversaciones, agendas y ventas.`,
    'Métricas a mirar': '- **Respuesta al seguimiento:** hoy no se mide, objetivo 35 por ciento.\n- **Agendas por conversación:** hoy 15 por ciento, objetivo 25 por ciento.',
    Expectativas: '- **Semana 1:** seguimiento armado y probado con 10 leads.\n- **Semana 2:** tablero semanal funcionando.\n- **Objetivo:** pasar de 2 a 5 ventas mensuales.',
    Cierre: 'Antes de sumar tráfico, hay que cuidar al que ya llegó: el seguimiento es el trabajo que nadie está haciendo.',
  }
}
export const textoDeSecciones = (obj) => Object.entries(obj).map(([k, v]) => `# ${k}\n${v}`).join('\n\n')
// Un borrador para un formato cualquiera (los de feedback no tienen plantilla propia en el mock).
export function borradorGenerico(formato, nombre) {
  const p = nombre.split(' ')[0]
  const obj = Object.fromEntries(FORMATOS[formato].secciones.map((s, i) => [s, i === 0 ? `- **Lo que ya funciona:** el tono cercano de ${p}, que no se toca.` : `Un cambio puntual para ${p}, en orden de impacto.\n> Hoy: mensaje largo y sin llamado a la acción.\n> Cómo quedaría: mensaje corto con una pregunta concreta.`]))
  return textoDeSecciones(obj)
}

// ---------------------------------------------------------------- SOPs solicitados
export const AREAS_SOP = [
  { id: 'marketing', nombre: 'Marketing' }, { id: 'ventas', nombre: 'Ventas' }, { id: 'sistemas', nombre: 'Sistemas' },
  { id: 'equipo', nombre: 'Equipo' }, { id: 'fulfillment', nombre: 'Fulfillment' }, { id: 'mentalidad', nombre: 'Mentalidad' },
]
// [clienteId, título, área, problema, consulta, estado, hace (días), entrega]
export const SOPS = [
  [141, 'SECUENCIA DE HISTORIAS DE VENTA', 'marketing', 'Necesito una secuencia de historias para vender mi programa sin sonar insistente.', 'cómo vender por stories sin ser pesado', 'pendiente', 1],
  [143, 'CHECKLIST DE CHECKOUT EN PESOS', 'sistemas', 'Mi checkout no deja cobrar en pesos y necesito el paso a paso de configuración.', 'configurar checkout en pesos argentinos', 'en_proceso', 3],
  [145, 'DEFINIR AVATAR DE MI OFERTA', 'marketing', 'No sé si apuntar a principiantes o a quienes ya facturan.', 'cómo definir mi avatar ideal', 'pendiente', 2],
  [131, 'GUION DE LLAMADA DE CIERRE', 'ventas', 'Quiero un guion para manejar la objeción de precio en la llamada.', 'qué decir cuando dicen que está caro', 'entregado', 8, 'https://docs.google.com/document/d/ejemplo-guion-cierre'],
  [144, 'ONBOARDING DE CLIENTES NUEVOS', 'fulfillment', 'Necesito un proceso para recibir a mis clientes nuevos y que no se enfríen.', 'proceso de onboarding de clientes', 'entregado', 12, 'https://docs.google.com/document/d/ejemplo-onboarding'],
  [142, 'MANEJO DE EQUIPO DE SETTERS', 'equipo', 'Voy a contratar mi primer setter y no sé cómo entrenarlo.', 'cómo entrenar a un setter', 'en_proceso', 5],
  [170, 'RUTINA SEMANAL CONSTANTE', 'mentalidad', 'Pierdo el ritmo cuando una semana sale mal.', 'cómo ser constante', 'pendiente', 6],
  [150, 'CRM PARA LEADS DE INSTAGRAM', 'sistemas', 'Mis leads viven en chats sueltos y necesito un CRM sencillo.', 'crm para leads de instagram', 'entregado', 15, 'https://docs.google.com/document/d/ejemplo-crm'],
]

// ---------------------------------------------------------------- Biblioteca
export const CONSULTAS = [
  [141, 'cómo vender por stories sin ser pesado', 'Marketing', 'sop', 0, 300],
  [143, 'configurar el checkout en pesos argentinos', 'Sistemas', 'problema', 2, 900],
  [145, 'no sé a quién venderle mi oferta', 'Marketing', 'problema', 3, 1500],
  [131, 'qué decir cuando dicen que está caro', 'Ventas', 'sop', 4, 2400],
  [144, 'proceso de onboarding de clientes nuevos', 'Fulfillment', 'sop', 0, 3300],
  [142, 'cómo entrenar a un setter', 'Equipo', 'sop', 0, 5800],
  [170, 'cómo ser constante con el contenido', 'Mentalidad', 'problema', 5, 7000],
  [150, 'crm sencillo para leads', 'Sistemas', 'sop', 1, 9000],
  [120, 'guion de reels para coaches', 'Marketing', 'sop', 6, 14000],
  [160, 'cómo cerrar más llamadas', 'Ventas', 'problema', 3, 20000],
  [130, 'precio de una mentoría grupal', 'Ventas', 'problema', 2, 30000],
  [141, 'plantilla de seguimiento a leads', 'Ventas', 'sop', 0, 45000],
]
const dolor = (que, veces) => ({ que, veces })
const cita = (texto, c, cliente) => ({ texto, cita: c, cliente })
// Cada nicho: clientes por id (con a qué se dedican), y las listas del cerebro.
export const NICHOS = [
  {
    slug: 'fitness-salud', nombre: 'Fitness y salud',
    clientes: [[141, 'Programa de entrenamiento online', 'coaches', 'vendiendo'], [142, 'Planes de nutrición anuales', 'nutrición', 'validando'], [144, 'Rutinas para madres', 'coaches', 'escalando']],
    dolores: [dolor('No saben cómo cobrar más caro', 8), dolor('Pierden leads por falta de seguimiento', 6), dolor('Contenido sin estrategia', 5), dolor('Dependen de un solo canal', 3)],
    recomendaciones: [dolor('Clase de seguimiento a leads', 7), dolor('SOP de oferta high ticket', 5), dolor('Guion de llamada de cierre', 4)],
    objeciones: [dolor('Está caro', 6), dolor('Lo tengo que hablar con mi pareja', 4), dolor('No tengo tiempo', 3)],
    funciono: [cita('Subir el precio y sumar una garantía', 'Pasé de 297 a 797 y cierro lo mismo.', 'Alan Klein'), cita('Seguimiento a 24 horas', 'Recuperé tres ventas la primera semana.', 'Cristopher Gonzalez'), cita('Reel con caso real', 'Me trajo 12 chats en un día.', 'Alicia Damian')],
    no_funciono: [cita('Anuncios sin oferta clara', 'Gasté 600 dólares y nada.', 'Alicia Damian'), cita('Publicar todos los días sin pilares', 'Muchas vistas, cero chats.', 'Alan Klein')],
    ofertas: [['Alan Klein', 'Programa de entrenamiento online', 'USD 797', 'USD 6.000', 'USD 15.000'], ['Alicia Damian', 'Planes de nutrición anuales', 'USD 450', 'USD 3.200', 'USD 8.000']],
    subnichos: [['coaches', [141, 144]], ['nutrición', [142]]],
  },
  {
    slug: 'finanzas-inversion', nombre: 'Finanzas e inversión',
    clientes: [[143, 'Curso de trading para principiantes', 'trading', 'vendiendo'], [145, 'Educación financiera para mujeres', 'educación financiera', 'arrancando'], [150, 'Asesoría de inversiones', 'asesoría', 'validando']],
    dolores: [dolor('Desconfianza del público', 7), dolor('Regulación y avisos legales', 4), dolor('Checkout internacional', 4)],
    recomendaciones: [dolor('Checklist de checkout en pesos', 5), dolor('Clase de prueba social', 4)],
    objeciones: [dolor('No confío en cursos de inversión', 6), dolor('No tengo capital para empezar', 4)],
    funciono: [cita('Mostrar resultados auditables', 'Con capturas verificables subió la confianza.', 'Alvaro Larraz'), cita('Webinar gratuito', 'Se llenó con 80 personas.', 'Ema Romero')],
    no_funciono: [cita('Prometer rentabilidad', 'Me bloquearon la cuenta de anuncios.', 'Alvaro Larraz')],
    ofertas: [['Alvaro Larraz', 'Curso de trading para principiantes', 'USD 297', 'USD 4.500', 'USD 10.000'], ['Ema Romero', 'Educación financiera para mujeres', 'USD 197', 'USD 1.800', 'USD 5.000']],
    subnichos: [['trading', [143]], ['educación financiera', [145, 150]]],
  },
  {
    slug: 'negocios-marketing', nombre: 'Negocios y marketing',
    clientes: [[120, 'Consultoría para agencias', 'agencias', 'escalando'], [131, 'Gestión de redes para clínicas', 'agencias', 'vendiendo'], [130, 'Productos digitales', 'infoproductos', 'validando'], [170, 'Mentoría para emprendedores', 'infoproductos', 'vendiendo'], [160, 'Programa de ventas', 'infoproductos', 'arrancando']],
    dolores: [dolor('Dependen de pocos clientes', 6), dolor('No tienen proceso de ventas', 6), dolor('Equipo sin entrenar', 4), dolor('Precios bajos', 3)],
    recomendaciones: [dolor('Guion de llamada de cierre', 6), dolor('Proceso de onboarding', 4), dolor('Entrenamiento de setters', 3)],
    objeciones: [dolor('Ya probé con otra agencia', 5), dolor('Necesito pensarlo', 5)],
    funciono: [cita('Guion de cierre con manejo de objeciones', 'Subió mi cierre del 20 al 35 por ciento.', 'Paulina Taurian'), cita('Contratar un setter', 'Liberé 15 horas semanales.', 'Martín Ibarra')],
    no_funciono: [cita('Cobrar por hora', 'Me ató al tiempo y no escalaba.', 'Martín Ibarra')],
    ofertas: [['Martín Ibarra', 'Consultoría para agencias', 'USD 2.500', 'USD 14.000', 'USD 30.000'], ['Paulina Taurian', 'Gestión de redes para clínicas', 'USD 900', 'USD 7.000', 'USD 15.000']],
    subnichos: [['agencias', [120, 131]], ['infoproductos', [130, 170, 160]]],
  },
]
export const ROADMAPS_BIB = [
  [141, 'Ventas', 'Alejandro', 4, 3, ['Grabá 3 historias por día con el CTA PLAN', 'Pasá las conversaciones a llamada', 'Te hago seguimiento cada dos días'], 'Cerró dos clientes nuevos en la semana.'],
  [144, 'Contenido', 'Lucas', 5, 5, ['Definí tres pilares de contenido', 'Calendario de reels semanal'], 'Duplicó las vistas y trajo 12 chats.'],
  [143, 'Sistemas', 'Lucho Vicente', 4, 2, ['Configurá el checkout en pesos'], null],
  [120, 'Equipo', 'Alejandro', 6, 4, ['Contratá al primer setter', 'Grabá el SOP de setting'], 'El setter ya agenda tres llamadas por día.'],
]
