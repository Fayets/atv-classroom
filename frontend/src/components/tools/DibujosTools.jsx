// Dibujos de línea de las portadas de las Tools, en el idioma de las portadas de los módulos (trazo azul
// marino "a mano"). El filtro y la flecha se definen una vez por página con <DefsTools />.
const S = { fill: 'none', stroke: '#1b2440', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke' }
const P = '#1b2440'

export function DefsTools() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <filter id="tl-mano" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" />
          <feDisplacementMap in="SourceGraphic" scale="2.6" />
        </filter>
        <marker id="tl-flecha" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M1 1 L9 5 L1 9" fill="none" stroke={P} strokeWidth="1.6" />
        </marker>
      </defs>
    </svg>
  )
}

const DIBUJOS = {
  'juan-ai': (
    <>
      <rect x="20" y="22" width="120" height="58" rx="14" {...S} /><path d="M48 80 L40 98 L66 80" {...S} />
      <path d="M40 42 H118 M40 56 H100" {...S} />
      <rect x="110" y="72" width="110" height="50" rx="14" {...S} /><path d="M196 122 L206 138 L186 122" {...S} />
      <circle cx="140" cy="97" r="3" fill={P} /><circle cx="160" cy="97" r="3" fill={P} /><circle cx="180" cy="97" r="3" fill={P} />
      <path d="M206 26 v16 M198 34 h16 M222 54 v8 M218 58 h8" {...S} />
    </>
  ),
  bottleneck: (
    <>
      <path d="M20 22 H140 L96 74 V98 H64 V74 Z" {...S} />
      {[[50, 38], [72, 34], [96, 40], [118, 32], [84, 56], [66, 52]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="5" {...S} />)}
      <circle cx="80" cy="86" r="5" fill={P} />
      <path d="M80 104 V126" {...S} markerEnd="url(#tl-flecha)" />
      <path d="M160 92 C 180 92, 186 60, 214 56" {...S} markerEnd="url(#tl-flecha)" />
      <path d="M160 116 H222" {...S} strokeDasharray="3 5" />
    </>
  ),
  audiencia: (
    <>
      <circle cx="44" cy="92" r="11" {...S} /><path d="M24 128 C 26 110, 62 110, 64 128" {...S} />
      <circle cx="96" cy="88" r="11" {...S} /><path d="M76 124 C 78 106, 114 106, 116 124" {...S} />
      <circle cx="148" cy="92" r="11" {...S} /><path d="M128 128 C 130 110, 166 110, 168 128" {...S} />
      <rect x="22" y="30" width="44" height="26" rx="8" {...S} /><path d="M36 56 L34 66 L46 56" {...S} />
      <rect x="128" y="26" width="44" height="26" rx="8" {...S} /><path d="M152 52 L150 62 L162 52" {...S} />
      <path d="M32 43 h24 M138 39 h24" {...S} />
      <circle cx="196" cy="64" r="20" {...S} /><path d="M210 78 L226 96" {...S} strokeWidth="3" />
    </>
  ),
  competencia: (
    <>
      <path d="M30 128 H222" {...S} />
      <rect x="44" y="84" width="34" height="44" {...S} /><rect x="104" y="54" width="34" height="74" {...S} /><rect x="164" y="98" width="34" height="30" {...S} />
      <path d="M121 44 V22 L138 28 L121 34" {...S} />
      <path d="M40 66 C 70 40, 100 38, 120 46" {...S} strokeDasharray="3 5" markerEnd="url(#tl-flecha)" />
      <path d="M58 104 l6 6 l10 -12" {...S} /><path d="M118 74 l6 6 l10 -12" {...S} /><path d="M176 108 l12 12 M188 108 l-12 12" {...S} />
    </>
  ),
  crm: (
    <>
      {/* Tablero en columnas: los leads avanzan de etapa hasta la llamada */}
      <rect x="18" y="20" width="62" height="112" rx="8" {...S} /><rect x="92" y="20" width="62" height="112" rx="8" {...S} /><rect x="166" y="20" width="62" height="112" rx="8" {...S} />
      <path d="M28 36 H70 M102 36 H144 M176 36 H218" {...S} />
      <rect x="28" y="48" width="42" height="18" rx="4" {...S} /><rect x="28" y="74" width="42" height="18" rx="4" {...S} /><rect x="28" y="100" width="42" height="18" rx="4" {...S} />
      <rect x="102" y="48" width="42" height="18" rx="4" {...S} /><rect x="102" y="74" width="42" height="18" rx="4" {...S} />
      <rect x="176" y="48" width="42" height="18" rx="4" {...S} /><path d="M188 57 l5 5 l9 -10" {...S} />
      <path d="M74 109 C 88 109, 90 83, 100 83" {...S} markerEnd="url(#tl-flecha)" />
      <path d="M148 83 C 160 83, 162 57, 172 57" {...S} markerEnd="url(#tl-flecha)" />
    </>
  ),
}

export function DibujoTool({ id }) {
  const dibujo = DIBUJOS[id]
  if (!dibujo) return null
  return (
    <svg viewBox="0 0 240 150" filter="url(#tl-mano)" aria-hidden="true" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
      {dibujo}
    </svg>
  )
}
