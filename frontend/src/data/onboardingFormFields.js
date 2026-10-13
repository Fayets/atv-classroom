/** Definición de bloques/preguntas para visualizar y exportar respuestas del onboarding. */

export const LEGACY_FORM_RESPONSE_FIELDS = [
  { key: 'nombre', label: 'Nombre completo y/o canal de Discord' },
  { key: 'perfil', label: 'Perfil' },
  { key: 'nicho', label: 'Nicho o industria' },
  { key: 'oferta', label: 'Oferta' },
  { key: 'precio', label: 'Precio de la oferta principal' },
  { key: 'cliente_ideal', label: 'Cliente ideal' },
  { key: 'facturacion_actual', label: 'Facturación actual' },
  { key: 'meta_90', label: 'Meta de facturación (90 días)' },
  { key: 'activos', label: 'Activos en el negocio' },
  { key: 'objetivo', label: 'Objetivo principal' },
  { key: 'obstaculos', label: 'Obstáculos' },
  { key: 'extra', label: 'Información adicional' },
];

export const ONBOARDING_FORM_SECTIONS = [
  {
    title: 'BLOQUE 0 — QUIÉN SOS Y DE QUÉ NEGOCIO HABLAMOS',
    questions: [
      { id: '1', label: 'Nombre real, WhatsApp y email principal' },
      {
        id: '2',
        label:
          'El negocio que vamos a trabajar, ¿es propio o de un cliente/empresa para la que trabajás? Si es de un cliente, indicá tu rol y tu nivel de decisión sobre los cambios',
      },
      { id: '3', label: '¿Con cuál rol te identificás más?' },
      {
        id: '4',
        label:
          'Compartí los links de todas las redes activas del negocio a trabajar (Instagram, YouTube, TikTok, Twitter, podcast, etc)',
      },
    ],
  },
  {
    title: 'BLOQUE 1 — OFERTA Y POSICIONAMIENTO',
    questions: [
      { id: '5', label: '¿Cuál es exactamente tu oferta?' },
      {
        id: '6',
        label: '¿En qué nicho operás, por qué te eligen y qué te diferencia de la competencia?',
      },
      {
        id: '7',
        label:
          '¿A quién le hablás? Describí los problemas y objetivos de tu avatar, no su demografía',
      },
      { id: '8', label: '¿A qué precio vendés y bajo qué lógica definiste ese precio?' },
    ],
  },
  {
    title: 'BLOQUE 2 — CONTENIDO Y ADQUISICIÓN',
    questions: [
      {
        id: '9',
        label:
          '¿Dónde creás contenido, cuál es tu canal más fuerte y cuál te trae los leads más calificados hoy?',
      },
      {
        id: '10',
        label:
          '¿Trabajás con un calendario de contenido planificado o publicás sin una estructura definida?',
      },
      {
        id: '11',
        label:
          '¿Tomás decisiones en base a métricas o a percepción? Si tenés métricas, pasame las views promedio por semana en reels, historias y YouTube',
      },
      { id: '12', label: '¿Cuántos chats abrís por mes y por qué vía?' },
    ],
  },
  {
    title: 'BLOQUE 3 — VENTAS Y EMBUDO',
    questions: [
      {
        id: '13',
        label: '¿Cuánto facturaste en los últimos 6 meses y qué tan estable es esa cifra?',
      },
      {
        id: '14',
        label: '¿Qué porcentaje de esos chats agenda llamada y qué porcentaje asiste?',
      },
      { id: '15', label: '¿Cuál es tu tasa de cierre?' },
      { id: '16', label: '¿Contás con un funnel de conversión para tu negocio?' },
      {
        id: '17',
        label: '¿Bajo qué criterio filtrás leads o atendés a cualquiera que escribe?',
      },
      {
        id: '18',
        label: '¿Tenés un proceso de seguimiento para los leads que no compran?',
      },
    ],
  },
  {
    title: 'BLOQUE 4 — OPERACIÓN, EQUIPO Y ENTREGA',
    questions: [
      {
        id: '19',
        label: '¿Qué herramientas usás para operar el negocio? (Skool, GHL, Calendly, Zapier, etc)',
      },
      {
        id: '20',
        label: '¿Quiénes integran tu equipo hoy, qué función cumple cada uno y cuánto cobra?',
      },
      { id: '21', label: '¿Quién toma las decisiones o todo pasa por vos?' },
      { id: '22', label: '¿Qué incluye exactamente tu programa o servicio?' },
      { id: '23', label: '¿Cuántos clientes activos tenés y cómo medís su progreso?' },
      {
        id: '24',
        label:
          '¿Contás con algún sistema de upsell y recompra para los clientes que ya tenés dentro de tu producto?',
      },
      {
        id: '25',
        label:
          '¿A cuántos clientes más podrías atender sin contratar personal ni modificar el producto?',
      },
      {
        id: '26',
        label: '¿Qué experiencia atraviesa el cliente desde que compra hasta que arranca?',
      },
    ],
  },
  {
    title: 'BLOQUE 5 — RESULTADOS, DOLOR Y OBJETIVO',
    questions: [
      {
        id: '27',
        label:
          'Contame tus mejores casos de éxito (situación inicial, resultado logrado y cómo fue el proceso)',
      },
      { id: '28', label: '¿Qué probaste antes de ATV y por qué creés que no funcionó?' },
      { id: '29', label: '¿Cuáles son tus 3 problemas principales para escalar hoy?' },
      {
        id: '30',
        label: '¿Qué identificás como el principal freno de tu negocio en este momento?',
      },
      {
        id: '31',
        label: '¿Cuál es tu objetivo concreto a 4 meses y qué esperás lograr con tu negocio?',
      },
    ],
  },
  {
    title: 'BLOQUE 6 — CONTENIDO Y DECISIÓN DE COMPRA',
    questions: [
      { id: '32', label: '¿Por dónde me conociste?' },
      { id: '33', label: '¿Qué formato de mi contenido te aporta o te gusta más?' },
      { id: '34', label: '¿Por qué elegiste ese formato?' },
      { id: '35', label: '¿Qué tipo de Reels te gustan más de mi Instagram?' },
      { id: '36', label: '¿Qué hace que te gusten esos Reels?' },
      {
        id: '37',
        label: '¿Qué tipo de videos te gustan o te aportan más en mi YouTube?',
      },
      { id: '38', label: '¿Qué hace que te gusten los videos de YouTube?' },
      { id: '39', label: '¿Qué te gusta o aporta más de las Historias?' },
      { id: '40', label: '¿Qué te hizo finalmente decir "SÍ" y entrar a ATV?' },
      { id: '41', label: '¿Qué te motivó específicamente a tomar acción?' },
      {
        id: '42',
        label: '¿Cuánto tiempo tardaste en decidirte a trabajar con nosotros?',
      },
      {
        id: '43',
        label: '¿Qué creés que podría haber funcionado mejor para que te decidieras antes?',
      },
      {
        id: '44',
        label: '¿Qué aspecto del punto que elegiste antes creés que se podría mejorar?',
      },
      {
        id: '45',
        label:
          'Antes de la llamada, ¿qué tan convencido estabas de ingresar, en una escala del 1 al 10?',
      },
      { id: '46', label: '¿Qué fue lo último que te convenció para tomar la decisión?' },
      { id: '47', label: '¿Qué fue lo que impedía que compres?' },
      { id: '48', label: '¿Qué programa compraste?' },
      {
        id: '49',
        label:
          '¿Hay algo dentro de ATV que descubriste cuando entraste y que si te lo hubiese mostrado antes, iba a ayudar a tu decisión?',
      },
    ],
  },
];

export function isNumericFormData(responses) {
  if (!responses || typeof responses !== 'object') return false;
  return Object.keys(responses).some((key) => /^\d+$/.test(key));
}

export function getFormDisplaySections(responses) {
  if (isNumericFormData(responses)) {
    return ONBOARDING_FORM_SECTIONS;
  }

  return [
    {
      title: null,
      questions: LEGACY_FORM_RESPONSE_FIELDS.map(({ key, label }) => ({ id: key, label })),
    },
  ];
}

export function formatFormResponseValue(value) {
  if (value === null || value === undefined || !String(value).trim()) return '—';
  return String(value);
}
