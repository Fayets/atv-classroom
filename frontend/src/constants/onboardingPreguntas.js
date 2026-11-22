// Las 49 preguntas del formulario de onboarding, copiadas tal cual de atv-onboarding
// (frontend/src/components/OnboardingForm.jsx, BLOCKS). Si cambian allá, se cambian acá.
export const BLOQUES_ONBOARDING = [
  {
    title: 'BLOQUE 0 — QUIÉN SOS Y DE QUÉ NEGOCIO HABLAMOS',
    questions: [
      {
        id: '1',
        type: 'textarea',
        label: 'Nombre real, WhatsApp y email principal',
        placeholder: 'Ej. Matías Gómez | +54 9 11 2345-6789 | ejemplo@gmail.com',
        rows: 2,
      },
      {
        id: '2',
        type: 'textarea',
        label:
          'El negocio que vamos a trabajar, ¿es propio o de un cliente/empresa para la que trabajás? Si es de un cliente, indicá tu rol y tu nivel de decisión sobre los cambios',
        rows: 3,
      },
      {
        id: '3',
        type: 'radio',
        label: '¿Con cuál rol te identificás más?',
        options: [
          { key: 'A', label: 'Experto en infoproductos' },
          { key: 'B', label: 'Dueño de negocio' },
          { key: 'C', label: 'Creador de contenido' },
          { key: 'D', label: 'Dueño de agencia' },
          { key: 'E', label: 'Director de ventas' },
          { key: 'F', label: 'Director de marketing' },
          { key: 'G', label: 'Growth partner' },
          { key: 'H', label: 'Setter' },
          { key: 'I', label: 'Closer' },
          { key: 'J', label: 'Editor' },
        ],
      },
      {
        id: '4',
        type: 'textarea',
        label:
          'Compartí los links de todas las redes activas del negocio a trabajar (Instagram, YouTube, TikTok, Twitter, podcast, etc)',
        rows: 3,
      },
    ],
  },
  {
    title: 'BLOQUE 1 — OFERTA Y POSICIONAMIENTO',
    questions: [
      { id: '5', type: 'textarea', label: '¿Cuál es exactamente tu oferta?', rows: 3 },
      {
        id: '6',
        type: 'textarea',
        label: '¿En qué nicho operás, por qué te eligen y qué te diferencia de la competencia?',
        rows: 3,
      },
      {
        id: '7',
        type: 'textarea',
        label:
          '¿A quién le hablás? Describí los problemas y objetivos de tu avatar, no su demografía',
        rows: 3,
      },
      {
        id: '8',
        type: 'textarea',
        label: '¿A qué precio vendés y bajo qué lógica definiste ese precio?',
        rows: 3,
      },
    ],
  },
  {
    title: 'BLOQUE 2 — CONTENIDO Y ADQUISICIÓN',
    questions: [
      {
        id: '9',
        type: 'textarea',
        label:
          '¿Dónde creás contenido, cuál es tu canal más fuerte y cuál te trae los leads más calificados hoy?',
        rows: 3,
      },
      {
        id: '10',
        type: 'textarea',
        label:
          '¿Trabajás con un calendario de contenido planificado o publicás sin una estructura definida?',
        rows: 3,
      },
      {
        id: '11',
        type: 'textarea',
        label:
          '¿Tomás decisiones en base a métricas o a percepción? Si tenés métricas, pasame las views promedio por semana en reels, historias y YouTube',
        rows: 3,
      },
      {
        id: '12',
        type: 'textarea',
        label: '¿Cuántos chats abrís por mes y por qué vía?',
        rows: 3,
      },
    ],
  },
  {
    title: 'BLOQUE 3 — VENTAS Y EMBUDO',
    questions: [
      {
        id: '13',
        type: 'textarea',
        label: '¿Cuánto facturaste en los últimos 6 meses y qué tan estable es esa cifra?',
        rows: 3,
      },
      {
        id: '14',
        type: 'textarea',
        label: '¿Qué porcentaje de esos chats agenda llamada y qué porcentaje asiste?',
        rows: 3,
      },
      { id: '15', type: 'textarea', label: '¿Cuál es tu tasa de cierre?', rows: 3 },
      {
        id: '16',
        type: 'textarea',
        label: '¿Contás con un funnel de conversión para tu negocio?',
        rows: 3,
      },
      {
        id: '17',
        type: 'textarea',
        label: '¿Bajo qué criterio filtrás leads o atendés a cualquiera que escribe?',
        rows: 3,
      },
      {
        id: '18',
        type: 'textarea',
        label: '¿Tenés un proceso de seguimiento para los leads que no compran?',
        rows: 3,
      },
    ],
  },
  {
    title: 'BLOQUE 4 — OPERACIÓN, EQUIPO Y ENTREGA',
    questions: [
      {
        id: '19',
        type: 'textarea',
        label: '¿Qué herramientas usás para operar el negocio? (Skool, GHL, Calendly, Zapier, etc)',
        rows: 3,
      },
      {
        id: '20',
        type: 'textarea',
        label: '¿Quiénes integran tu equipo hoy, qué función cumple cada uno y cuánto cobra?',
        rows: 3,
      },
      {
        id: '21',
        type: 'textarea',
        label: '¿Quién toma las decisiones o todo pasa por vos?',
        rows: 3,
      },
      {
        id: '22',
        type: 'textarea',
        label: '¿Qué incluye exactamente tu programa o servicio?',
        rows: 3,
      },
      {
        id: '23',
        type: 'textarea',
        label: '¿Cuántos clientes activos tenés y cómo medís su progreso?',
        rows: 3,
      },
      {
        id: '24',
        type: 'textarea',
        label:
          '¿Contás con algún sistema de upsell y recompra para los clientes que ya tenés dentro de tu producto?',
        rows: 3,
      },
      {
        id: '25',
        type: 'textarea',
        label:
          '¿A cuántos clientes más podrías atender sin contratar personal ni modificar el producto?',
        rows: 3,
      },
      {
        id: '26',
        type: 'textarea',
        label: '¿Qué experiencia atraviesa el cliente desde que compra hasta que arranca?',
        rows: 3,
      },
    ],
  },
  {
    title: 'BLOQUE 5 — RESULTADOS, DOLOR Y OBJETIVO',
    questions: [
      {
        id: '27',
        type: 'textarea',
        label:
          'Contame tus mejores casos de éxito (situación inicial, resultado logrado y cómo fue el proceso)',
        rows: 4,
      },
      {
        id: '28',
        type: 'textarea',
        label: '¿Qué probaste antes de ATV y por qué creés que no funcionó?',
        rows: 3,
      },
      {
        id: '29',
        type: 'checkbox',
        label: '¿Cuáles son tus 3 problemas principales para escalar hoy?',
        options: [
          { key: 'A', label: 'Depender de ads' },
          { key: 'B', label: 'Depender de lanzamientos' },
          { key: 'C', label: 'Falta de leads calificados' },
          { key: 'D', label: 'Falta de claridad para escalar' },
          { key: 'E', label: 'Falta de claridad con el contenido' },
          { key: 'F', label: 'Todo depende de vos' },
          { key: 'G', label: 'El equipo no rinde' },
          { key: 'H', label: 'Falta de sistemas y métricas' },
          { key: 'I', label: 'Producto poco escalable' },
          { key: 'J', label: 'Problemas operativos' },
        ],
      },
      {
        id: '30',
        type: 'textarea',
        label: '¿Qué identificás como el principal freno de tu negocio en este momento?',
        rows: 3,
      },
      {
        id: '31',
        type: 'textarea',
        label: '¿Cuál es tu objetivo concreto a 4 meses y qué esperás lograr con tu negocio?',
        rows: 3,
      },
    ],
  },
  {
    title: 'BLOQUE 6 — CONTENIDO Y DECISIÓN DE COMPRA',
    questions: [
      {
        id: '32',
        type: 'radio',
        label: '¿Por dónde me conociste?',
        options: [
          { key: 'a', label: 'Instagram' },
          { key: 'b', label: 'YouTube' },
          { key: 'c', label: 'Recomendación (te enviaron mi contenido)' },
          { key: 'd', label: 'Otro' },
        ],
      },
      {
        id: '33',
        type: 'radio',
        label: '¿Qué formato de mi contenido te aporta o te gusta más?',
        options: [
          { key: 'a', label: 'Historias' },
          { key: 'b', label: 'Reels' },
          { key: 'c', label: 'YouTube' },
        ],
      },
      { id: '34', type: 'textarea', label: '¿Por qué elegiste ese formato?', rows: 3 },
      {
        id: '35',
        type: 'radio',
        label: '¿Qué tipo de Reels te gustan más de mi Instagram?',
        options: [
          { key: 'a', label: 'Reels dinámicos/editados' },
          { key: 'b', label: 'Reels crudos/simples' },
        ],
      },
      {
        id: '36',
        type: 'checkbox',
        label: '¿Qué hace que te gusten esos Reels?',
        options: [
          { key: 'a', label: 'Es diferente a lo que todos hacen' },
          { key: 'b', label: 'Transmite confianza y autoridad' },
          { key: 'c', label: 'Son creativos y entretenidos' },
          { key: 'd', label: 'Es auténtico y real' },
          { key: 'e', label: 'Cambian mi perspectiva' },
          { key: 'f', label: 'Aportan valor' },
          { key: 'g', label: 'Otro' },
        ],
      },
      {
        id: '37',
        type: 'radio',
        label: '¿Qué tipo de videos te gustan o te aportan más en mi YouTube?',
        options: [
          { key: 'a', label: 'Formato en Miro (valor/técnico)' },
          { key: 'b', label: 'Formato en Google Docs (valor/técnico)' },
          { key: 'c', label: 'Formato hablando a cámara (valor/técnico)' },
          { key: 'd', label: 'Formato hablando a cámara (mentalidad)' },
        ],
      },
      {
        id: '38',
        type: 'textarea',
        label: '¿Qué hace que te gusten los videos de YouTube?',
        rows: 3,
      },
      {
        id: '39',
        type: 'textarea',
        label: '¿Qué te gusta o aporta más de las Historias?',
        rows: 3,
      },
      {
        id: '40',
        type: 'checkbox',
        label: '¿Qué te hizo finalmente decir "SÍ" y entrar a ATV?',
        options: [
          { key: 'a', label: 'La convicción y confianza de Juan en el contenido' },
          { key: 'b', label: 'La información dentro del programa' },
          { key: 'c', label: 'El roadmap y claridad que podía obtener' },
          { key: 'd', label: 'El estilo de vida de Juan y ATV' },
          { key: 'e', label: 'Los valores de Juan y ATV' },
          { key: 'f', label: 'La velocidad con la que escalan negocios' },
          { key: 'g', label: 'Los casos de éxito' },
          { key: 'h', label: 'El método Evergreen Value' },
          { key: 'i', label: 'Otro' },
        ],
      },
      {
        id: '41',
        type: 'textarea',
        label: '¿Qué te motivó específicamente a tomar acción?',
        rows: 3,
      },
      {
        id: '42',
        type: 'radio',
        label: '¿Cuánto tiempo tardaste en decidirte a trabajar con nosotros?',
        options: [
          { key: 'a', label: 'Menos de 1 mes' },
          { key: 'b', label: '1 a 3 meses' },
          { key: 'c', label: 'Más de 6 meses' },
          { key: 'd', label: 'Otro' },
        ],
      },
      {
        id: '43',
        type: 'checkbox',
        label: '¿Qué creés que podría haber funcionado mejor para que te decidieras antes?',
        options: [
          { key: 'a', label: 'Mejor llamada de venta' },
          { key: 'b', label: 'Mejor proceso en el setting' },
          { key: 'c', label: 'Más frecuencia de contenido' },
          { key: 'd', label: 'Más ángulos en el contenido' },
          { key: 'e', label: 'Más testimonios/casos de éxito' },
          { key: 'f', label: 'Conocer más la vida personal de Juan' },
          { key: 'g', label: 'Conocer más el producto/programa por dentro' },
          { key: 'h', label: 'Otro' },
        ],
      },
      {
        id: '44',
        type: 'textarea',
        label: '¿Qué aspecto del punto que elegiste antes creés que se podría mejorar?',
        rows: 3,
      },
      {
        id: '45',
        type: 'number',
        label:
          'Antes de la llamada, ¿qué tan convencido estabas de ingresar, en una escala del 1 al 10?',
        min: 1,
        max: 10,
      },
      {
        id: '46',
        type: 'textarea',
        label: '¿Qué fue lo último que te convenció para tomar la decisión?',
        rows: 3,
      },
      {
        id: '47',
        type: 'radio',
        label: '¿Qué fue lo que impedía que compres?',
        options: [
          { key: 'a', label: 'Precio' },
          { key: 'b', label: 'Confianza' },
          { key: 'c', label: 'Tiempo' },
          { key: 'd', label: 'Falta de claridad en el servicio' },
          { key: 'e', label: 'Otro' },
        ],
      },
      {
        id: '48',
        type: 'radio',
        label: '¿Qué programa compraste?',
        options: [
          { key: 'a', label: 'Mentoría' },
          { key: 'b', label: 'Advantage' },
          { key: 'c', label: 'Boost' },
          { key: 'd', label: 'Entry Level' },
          { key: 'e', label: 'Mid Level' },
          { key: 'f', label: 'High Level' },
        ],
      },
      {
        id: '49',
        type: 'textarea',
        label:
          '¿Hay algo dentro de ATV que descubriste cuando entraste y que si te lo hubiese mostrado antes, iba a ayudar a tu decisión?',
        rows: 3,
      },
    ],
  },
];
