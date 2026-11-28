// Datos de prueba de la Biblioteca (/library y /swipes) y del Roadmap (state.roadmap). Todo inventado.
const hace = (min) => new Date(Date.now() - min * 60_000).toISOString()

export const biblioteca = () => ({
  stories: Array.from({ length: 9 }, (_, i) => ({ id: `historia-${(i % 4) + 1}-${i}`, fecha: hace(300 + i * 700), metricas: { views: 2600 - i * 180, exits: 120 + i * 14, replies: 18 - i } })),
  posts: [
    { fecha: hace(1500), link: 'https://www.instagram.com/', texto: '3 errores que te frenan a vender online', metricas: { views: 18400, saves: 640, shares: 212 } },
    { fecha: hace(4500), link: 'https://www.instagram.com/', texto: 'Cómo armé mi agenda de 6 meses', metricas: { views: 7600, saves: 120, shares: 40 } },
    { fecha: hace(9000), link: 'https://www.instagram.com/', texto: 'Si vendés online, dejá de hacer esto', metricas: { views: 9100, saves: 310, shares: 98 } },
  ],
  secuencias: [],
  guides: [
    { topic: 'voz', rules: ['Habla de vos, cercano y directo.', 'Frases cortas; nada de palabras en inglés si hay una en castellano.', 'Cierra siempre con una pregunta.'], source: 'Leído de 40 historias y 12 reels' },
    { topic: 'marca', rules: ['Rojo ATV solo para lo que pide acción.', 'Fondo hueso, tipografía Helvetica.'], source: 'Del brandbook 2026' },
    { topic: 'historias', rules: ['Las secuencias con un caso real traen el triple de chats.', 'El pedido funciona mejor en la última historia.'] },
  ],
  material: [
    { id: 'm1', kind: 'marca', title: 'Brandbook Escala Digital 2026', url: 'https://www.notion.so/', note: 'Colores, tipografía y tono' },
    { id: 'm2', kind: 'landing', title: 'Landing del programa High Ticket', url: 'https://escaladigital.com/programa', note: 'La que más convierte: 4,1 %' },
    { id: 'm3', kind: 'landing', title: 'Landing del webinar', url: 'https://escaladigital.com/webinar' },
    { id: 'm4', kind: 'miro', title: 'Miro · Plan de 90 días', url: 'https://miro.com/', note: 'Armado por Tomás' },
    { id: 'm5', kind: 'caso', title: 'Caso Nati: de 0 a 12 alumnas', url: 'https://www.youtube.com/', note: 'Con números reales' },
    { id: 'm6', kind: 'vsl', title: 'VSL del programa (12 min)', url: 'https://www.youtube.com/' },
    { id: 'm7', kind: 'mercado', title: 'Anuncios de la competencia · noviembre', url: 'https://www.facebook.com/ads/library', note: 'Para la campaña de diciembre' },
  ],
})

export const swipes = () => ({
  formatos: { Reel: 4, Carrusel: 2, Historia: 3 },
  piezas: [
    { formato: 'Reel', origen: 'propio', angulo: 'Error común', resultado: '18,4k vistas', texto: '3 errores que te frenan a vender online', link: 'https://www.instagram.com/' },
    { formato: 'Historia', origen: 'propio', angulo: 'Caso de alumno', resultado: '21 chats', texto: 'Caso de Nati: de 0 a 12 alumnas' },
    { formato: 'Carrusel', origen: 'tercero', angulo: 'Lista', resultado: '', texto: '7 cosas que aprendí vendiendo mi primer curso', link: 'https://www.instagram.com/' },
    { formato: 'Reel', origen: 'tercero', angulo: 'Historia personal', resultado: '1,2 M vistas', texto: 'Dejé mi trabajo para enseñar online: esto pasó', link: 'https://www.instagram.com/' },
  ],
})

const t = (id, texto, estado, quien, extra = {}) => ({ id, texto, estado, quien, ...extra })
// Cada paso puede traer, además de sus tareas: inicio y fin (fechas), resultado (lo que se logró, al aprobarlo) y notas.
export const roadmap = () => ({
  titulo: 'Lanzamiento del programa High Ticket · diciembre',
  meta: '30 alumnos nuevos a USD 1.500 antes del 31 de diciembre',
  pasos: [
    {
      n: 1, titulo: 'Oferta y precio', detalle: 'Definir qué incluye el programa, a quién va dirigido y a cuánto se vende.', estado: 'aprobado', inicio: hace(30000), aprobadoAt: hace(24000),
      resultado: 'Programa de 12 semanas a USD 1.500, con 3 cuotas de USD 550. Garantía de 14 días.',
      listoCuando: 'La oferta entra en una página y el precio está validado con 10 conversaciones.',
      partes: [{ clave: 'a', titulo: 'Investigación', cierre: 'Tenés los precios del mercado' }, { clave: 'b', titulo: 'La oferta escrita', cierre: 'Aprobás la página de la oferta' }],
      tareas: [
        t('t1', 'Comparar precios de 5 competidores', 'hecha', 'Lucía', { parte: 'a', archivo: '/mock/work/precios-competencia.md' }),
        t('t1b', 'Encuesta a 40 seguidores sobre qué pagarían', 'hecha', 'Tomás', { parte: 'a', link: 'https://forms.gle/encuesta-precio' }),
        t('t1c', 'Leer las 10 llamadas de venta del último mes', 'hecha', 'Joaquín', { parte: 'a' }),
        t('t2', 'Escribir la oferta en una página', 'hecha', 'Tomás', { parte: 'b', archivo: '/mock/work/oferta.md', versiones: [{ archivo: '/mock/work/oferta-v1.md' }] }),
        t('t2b', 'Definir bonos y garantía', 'hecha', 'Vos', { parte: 'b' }),
        t('t2c', 'Validar el precio en 10 conversaciones', 'hecha', 'Martín', { parte: 'b' }),
      ],
      notas: ['3 de cada 10 pidieron precio sin que se lo ofrezcan: la oferta está viva.', 'Se descartó el plan anual: nadie lo eligió en la encuesta.'],
    },
    {
      n: 2, titulo: 'Landing y VSL', detalle: 'La página de venta, el formulario de aplicación y el video que la acompaña.', estado: 'aprobado', inicio: hace(24000), aprobadoAt: hace(9000),
      resultado: 'Landing publicada con 4,1 % de conversión a aplicación en la primera semana. VSL de 12 minutos.',
      listoCuando: 'La landing está publicada, el formulario manda las aplicaciones a Calendly y el VSL está arriba.',
      partes: [{ clave: 'a', titulo: 'Guion y video', cierre: 'Aprobás el guion del VSL' }, { clave: 'b', titulo: 'Página y formulario', cierre: 'La landing queda publicada' }],
      tareas: [
        t('t4', 'Guion del VSL', 'hecha', 'Bruno', { parte: 'a', archivo: '/mock/work/guion-vsl.md' }),
        t('t4b', 'Grabar el VSL', 'hecha', 'Vos', { parte: 'a' }),
        t('t4c', 'Editar el VSL con subtítulos', 'hecha', 'Mateo', { parte: 'a', link: 'https://www.youtube.com/watch?v=vsl-programa' }),
        t('t3', 'Landing del programa', 'hecha', 'Nicolás', { parte: 'b', link: 'https://escaladigital.com/programa' }),
        t('t3b', 'Formulario de aplicación conectado a Calendly', 'hecha', 'Agustina', { parte: 'b', link: 'https://escaladigital.com/aplicar' }),
        t('t3c', 'Píxel de Meta y conversiones', 'hecha', 'Nicolás', { parte: 'b' }),
      ],
      notas: ['El formulario se rompió un día (ticket T-12): se arregló en 3 horas.'],
    },
    {
      n: 3, titulo: 'Contenido de calentamiento', detalle: 'Dos semanas de historias y reels que preparen el lanzamiento.', estado: 'en curso', inicio: hace(9000), listoCuando: 'Están los 10 reels y las 4 secuencias listas para publicar.',
      partes: [{ clave: 'a', titulo: 'Guiones', cierre: 'Aprobás los guiones' }, { clave: 'b', titulo: 'Grabación y edición' }],
      tareas: [
        t('t5', 'Guiones de 10 reels', 'hecha', 'Bruno', { parte: 'a', archivo: '/mock/work/guiones-semana.md' }),
        t('t6', 'Secuencias de historias con casos', 'espera_ok', 'Camila', { parte: 'a', archivo: '/mock/work/secuencias-casos.md' }),
        t('t7', 'Grabar los reels', 'pendiente', 'Vos', { parte: 'b' }),
        t('t8', 'Editar y subtitular', 'pendiente', 'Mateo', { parte: 'b' }),
      ],
    },
    {
      n: 4, titulo: 'Anuncios', detalle: 'Campaña de USD 1.200 hacia la landing, con tres públicos.', estado: 'pendiente', listoCuando: 'Las tres campañas están cargadas en Meta y aprobaste el presupuesto.',
      tareas: [t('t9', 'Creativos para Meta', 'pendiente', 'Valentina'), t('t10', 'Públicos y presupuesto', 'pendiente', 'Lucía'), t('t10b', 'Reglas para pausar lo que no funciona', 'pendiente', 'Valentina')],
    },
    { n: 5, titulo: 'Ventas', detalle: 'Setters y closers listos para la ola de chats.', estado: 'pendiente', listoCuando: 'El guion de setteo está actualizado y hay agenda para 40 llamadas.', tareas: [t('t11', 'Guion de setteo actualizado', 'pendiente', 'Martín'), t('t12', 'Agenda de llamadas de diciembre', 'pendiente', 'Joaquín')] },
  ],
})

// Los proyectos del Roadmap: el lanzamiento (el de arriba), un webinar que recién arranca y uno ya terminado.
export const roadmaps = () => [
  { id: 'rm-lanzamiento', creadoAt: hace(31000), ...roadmap() },
  {
    id: 'rm-webinar', creadoAt: hace(4300), titulo: 'Webinar de enero · "Vendé tu programa sin anuncios"', meta: '400 inscriptos y 25 aplicaciones al programa',
    pasos: [
      { n: 1, titulo: 'Tema y landing de registro', detalle: 'El tema que más chats trajo y la página para anotarse.', estado: 'en curso', inicio: hace(4300), listoCuando: 'La landing está publicada y el formulario manda los datos al CRM.', tareas: [t('w1', 'Elegir el tema con los datos de las historias', 'hecha', 'Tomás'), t('w2', 'Landing de registro', 'pendiente', 'Nicolás'), t('w3', 'Secuencia de mails de recordatorio', 'pendiente', 'Joaquín')] },
      { n: 2, titulo: 'Difusión', detalle: 'Historias, reels y anuncios chicos para llenar el webinar.', estado: 'pendiente', listoCuando: 'Hay 400 inscriptos.', tareas: [t('w4', '10 historias de difusión', 'pendiente', 'Camila'), t('w5', 'Anuncio de USD 300 a la landing', 'pendiente', 'Valentina')] },
      { n: 3, titulo: 'El webinar', detalle: 'Guion, presentación y la oferta al final.', estado: 'pendiente', tareas: [t('w6', 'Guion y diapositivas', 'pendiente', 'Bruno'), t('w7', 'Ensayo con Franco', 'pendiente', 'Vos')] },
      { n: 4, titulo: 'Seguimiento', detalle: 'Llamar a los que aplicaron en las 48 h siguientes.', estado: 'pendiente', tareas: [t('w8', 'Agenda de llamadas', 'pendiente', 'Martín')] },
    ],
  },
  {
    id: 'rm-whatsapp', creadoAt: hace(60000), terminadoAt: hace(33000), titulo: 'Ordenar las ventas por WhatsApp', meta: 'Responder todos los chats en menos de 1 hora',
    pasos: [
      { n: 1, titulo: 'Respuestas rápidas', detalle: 'Las 12 preguntas que más se repiten, contestadas.', estado: 'aprobado', inicio: hace(60000), aprobadoAt: hace(52000), resultado: '12 respuestas guardadas en WhatsApp Business.', tareas: [t('z1', 'Juntar las preguntas que más se repiten', 'hecha', 'Sofía'), t('z2', 'Escribir las respuestas', 'hecha', 'Sofía', { archivo: '/mock/work/respuestas-rapidas.md' })] },
      { n: 2, titulo: 'Etiquetas y seguimiento', detalle: 'Cada chat con su etiqueta: nuevo, calificado, agendado, cliente.', estado: 'aprobado', inicio: hace(52000), aprobadoAt: hace(41000), resultado: 'Nadie queda sin respuesta: el setter revisa las etiquetas dos veces por día.', tareas: [t('z3', 'Armar las etiquetas', 'hecha', 'Martín'), t('z4', 'Rutina de revisión', 'hecha', 'Sofía')] },
      { n: 3, titulo: 'Medir', detalle: 'Tiempo de respuesta y cuántos chats llegan a llamada.', estado: 'aprobado', inicio: hace(41000), aprobadoAt: hace(33000), resultado: 'Tiempo de respuesta promedio: 38 minutos (antes, 6 horas). 1 de cada 4 chats agenda.', tareas: [t('z5', 'Reporte semanal de WhatsApp', 'hecha', 'Lucía', { archivo: '/mock/work/reporte-whatsapp.md' })] },
    ],
  },
]
