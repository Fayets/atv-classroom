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
export const roadmap = () => ({
  titulo: 'Lanzamiento del programa High Ticket · diciembre',
  pasos: [
    { n: 1, titulo: 'Oferta y precio', detalle: 'Definir qué incluye el programa y a cuánto se vende.', estado: 'aprobado', aprobadoAt: hace(9000), tareas: [t('t1', 'Escribir la oferta en una página', 'hecha', 'Tomás', { archivo: '/mock/work/oferta.md' }), t('t2', 'Comparar precios de 5 competidores', 'hecha', 'Lucía')] },
    { n: 2, titulo: 'Landing y VSL', detalle: 'La página de venta y el video que la acompaña.', estado: 'aprobado', aprobadoAt: hace(4000), tareas: [t('t3', 'Landing del programa', 'hecha', 'Nicolás', { link: 'https://escaladigital.com/programa' }), t('t4', 'Guion del VSL', 'hecha', 'Bruno')] },
    {
      n: 3, titulo: 'Contenido de calentamiento', detalle: 'Dos semanas de historias y reels que preparen el lanzamiento.', estado: 'en curso', listoCuando: 'Están los 10 reels y las 4 secuencias listas para publicar.',
      partes: [{ clave: 'a', titulo: 'Guiones', cierre: 'Aprobás los guiones' }, { clave: 'b', titulo: 'Grabación y edición' }],
      tareas: [
        t('t5', 'Guiones de 10 reels', 'hecha', 'Bruno', { parte: 'a', archivo: '/mock/work/guiones-semana.md' }),
        t('t6', 'Secuencias de historias con casos', 'espera_ok', 'Camila', { parte: 'a' }),
        t('t7', 'Grabar los reels', 'pendiente', 'Vos', { parte: 'b' }),
        t('t8', 'Editar y subtitular', 'pendiente', 'Mateo', { parte: 'b' }),
      ],
    },
    { n: 4, titulo: 'Anuncios', detalle: 'Campaña de USD 1.200 hacia la landing.', estado: 'pendiente', tareas: [t('t9', 'Creativos para Meta', 'pendiente', 'Valentina'), t('t10', 'Públicos y presupuesto', 'pendiente', 'Lucía')] },
    { n: 5, titulo: 'Ventas', detalle: 'Setters y closers listos para la ola de chats.', estado: 'pendiente', tareas: [t('t11', 'Guion de setteo actualizado', 'pendiente', 'Martín')] },
  ],
})
