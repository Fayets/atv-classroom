import { useRef, useState } from 'react'
import AppHeader from '../components/AppHeader'
import { SelectorEstilo } from '../components/plataforma/MacVentana'
import RoadmapsMac from '../components/plataforma/RoadmapsMac'
import { Avatar } from '../components/plataforma/piezas'
import { CLIENTE_DEMO, COACHES, usePlataforma } from '../context/PlataformaDemo'
import '../styles/frentes.css'
import '../styles/plataforma.css'

const ORDEN = ['juan', 'juampi', 'nick']
const CARTA_W = 170
const ESPACIO = 22

const ETIQUETA = { vigente: 'Vigente', reemplazado: 'Reemplazado', complementario: 'Complementa al vigente', base: 'Base' }

function Carta({ r, sel, onSel }) {
  return (
    <button type="button" className={`pf-hoja pf-hoja--${r.estado}${sel ? ' is-sel' : ''}`} onClick={() => onSel(r.id)} aria-pressed={sel}>
      <span className="pf-hoja__estado">{r.estado === 'base' ? `Doc · ${r.detalle ?? 'base'}` : ETIQUETA[r.estado]}</span>
      <b>{r.titulo}</b>
      <span className="pf-hoja__fecha">{r.paso && r.estado === 'vigente' ? `${r.fecha} · paso ${r.paso[0]} de ${r.paso[1]}` : r.fecha}</span>
    </button>
  )
}

// Mapa de roadmaps del cliente: una zona por coach con sus roadmaps como hojas. Uno solo es el vigente.
export default function RoadmapsPage() {
  const { cliente, roadmapsDe, vigenteDe, estilo } = usePlataforma()
  const yo = cliente(CLIENTE_DEMO)
  const todos = roadmapsDe(CLIENTE_DEMO)
  const vigente = vigenteDe(CLIENTE_DEMO)
  const [sel, setSel] = useState(vigente?.id ?? null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const arrastre = useRef(null)

  // Zonas en fila; cada una crece con sus hojas.
  let x = 40
  const zonas = ORDEN.map((id) => {
    const hojas = todos.filter((r) => r.coach === id)
    const w = Math.max(260, 40 + hojas.length * CARTA_W + (hojas.length - 1) * ESPACIO)
    const z = { id, hojas, x, y: 40, w, h: 300 }
    x += w + 70
    return z
  })
  const sistemas = todos.filter((r) => r.coach === 'franco')
  const bloqueado = yo.nivel !== 'high' && !sistemas.length
  const zonaFranco = { id: 'franco', hojas: sistemas, x: zonas[1].x, y: 420, w: 440, h: 210 }
  const seleccionado = todos.find((r) => r.id === sel)

  function bajar(e) {
    if (e.target.closest('button, a')) return
    arrastre.current = { x: e.clientX, y: e.clientY, pan }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function mover(e) {
    if (!arrastre.current) return
    setPan({ x: arrastre.current.pan.x + e.clientX - arrastre.current.x, y: arrastre.current.pan.y + e.clientY - arrastre.current.y })
  }
  const soltar = () => {
    arrastre.current = null
  }
  const acercar = (d) => setZoom((z) => Math.min(1.5, Math.max(0.5, Math.round((z + d) * 10) / 10)))

  if (estilo === 'mac') return <RoadmapsMac />

  return (
    <div className="app-shell im-root">
      <AppHeader />
      <main className="pf-roadmaps">
        <div className="pf-rm-barra">
          {vigente ? (
            <>
              <div>
                <span className="pf-eyebrow pf-eyebrow--rojo">El que tenés que seguir ahora</span>
                <b>
                  {vigente.titulo}{' '}
                  <span>
                    de {COACHES[vigente.coach].nombre} · {vigente.fecha === 'Hoy' ? 'actualizado hoy' : vigente.fecha}
                    {vigente.paso ? ` · vas por el paso ${vigente.paso[0]} de ${vigente.paso[1]}` : ''}
                  </span>
                </b>
              </div>
              <button type="button" className="pc-btn pc-complete" onClick={() => setSel(vigente.id)}>
                Abrir roadmap vigente
              </button>
            </>
          ) : (
            <div>
              <span className="pf-eyebrow">Sin roadmap vigente</span>
              <b>Tu coach te va a asignar uno en tu próxima revisión.</b>
            </div>
          )}
        </div>

        <div className="pf-lienzo" onPointerDown={bajar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
          <div className="pf-lienzo__mundo" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
            <svg className="pf-lienzo__flechas" width="2400" height="900" aria-hidden="true">
              <path d={`M${zonas[0].x + zonas[0].w} 190 C ${zonas[0].x + zonas[0].w + 40} 190, ${zonas[1].x - 40} 190, ${zonas[1].x} 190`} />
              <path d={`M${zonas[1].x + zonas[1].w} 190 C ${zonas[1].x + zonas[1].w + 40} 190, ${zonas[2].x - 40} 190, ${zonas[2].x} 190`} />
              <path d={`M${zonas[1].x + 120} 340 C ${zonas[1].x + 120} 380, ${zonaFranco.x + 80} 380, ${zonaFranco.x + 80} 420`} />
            </svg>

            {zonas.map((z) => (
              <section key={z.id} className={`pf-zona pf-zona--${z.id}`} style={{ left: z.x, top: z.y, width: z.w, minHeight: z.h }}>
                <header>
                  <Avatar coach={z.id} size={32} />
                  <span>
                    <b>{COACHES[z.id].nombre}</b>
                    <small>{COACHES[z.id].rol}</small>
                  </span>
                </header>
                <div className="pf-zona__hojas">
                  {z.hojas.length ? (
                    z.hojas.map((r) => <Carta key={r.id} r={r} sel={sel === r.id} onSel={setSel} />)
                  ) : (
                    <p className="pf-muted">Todavía no te dio ningún roadmap.</p>
                  )}
                </div>
                {z.hojas.some((r) => r.estado === 'vigente') ? <span className="pf-mano">este es el que seguís</span> : null}
              </section>
            ))}

            <section className="pf-zona pf-zona--franco" style={{ left: zonaFranco.x, top: zonaFranco.y, width: zonaFranco.w, minHeight: zonaFranco.h }}>
              <header>
                <Avatar coach="franco" size={32} />
                <span>
                  <b>{COACHES.franco.nombre}</b>
                  <small>{COACHES.franco.rol}</small>
                </span>
              </header>
              {bloqueado ? (
                <div className="pf-candado">
                  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                    <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
                    <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
                  </svg>
                  <span>
                    <b>Roadmap de Sistemas</b>
                    <small>Métricas, software y laboratorios. Incluido en High.</small>
                  </span>
                </div>
              ) : (
                <div className="pf-zona__hojas">
                  {sistemas.map((r) => (
                    <Carta key={r.id} r={r} sel={sel === r.id} onSel={setSel} />
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="pf-leyenda">
            <span className="pf-eyebrow">Cómo leer el mapa</span>
            <span>
              <i className="pf-ley pf-ley--vigente" /> Vigente: el que seguís ahora
            </span>
            <span>
              <i className="pf-ley pf-ley--complementario" /> Complementa al vigente
            </span>
            <span className="pf-muted">
              <i className="pf-ley pf-ley--reemplazado" /> Reemplazado: queda como historial
            </span>
          </div>

          <div className="pf-zoom">
            <button type="button" aria-label="Alejar" onClick={() => acercar(-0.1)}>
              −
            </button>
            <span className="num">{Math.round(zoom * 100)}%</span>
            <button type="button" aria-label="Acercar" onClick={() => acercar(0.1)}>
              +
            </button>
            <button
              type="button"
              aria-label="Centrar"
              onClick={() => {
                setZoom(1)
                setPan({ x: 0, y: 0 })
              }}
            >
              ⌂
            </button>
          </div>

          {seleccionado ? (
            <div className="pf-detalle" role="status">
              <span className={`pf-eyebrow${seleccionado.estado === 'vigente' ? ' pf-eyebrow--rojo' : ''}`}>{ETIQUETA[seleccionado.estado]}</span>
              <b>{seleccionado.titulo}</b>
              <span className="pf-muted">
                De {COACHES[seleccionado.coach].nombre} · {seleccionado.fecha}
              </span>
              {seleccionado.link ? (
                <a href={seleccionado.link} target="_blank" rel="noopener noreferrer" className="pc-btn pc-btn--light">
                  Abrir documento
                </a>
              ) : (
                <span className="pf-muted pf-demo">En la demo los roadmaps de ejemplo no tienen documento.</span>
              )}
            </div>
          ) : null}
        </div>
      </main>
      <SelectorEstilo flotante />
    </div>
  )
}
