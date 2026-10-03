import { useRef, useState } from 'react'
import { CLIENTE_DEMO, COACHES, usePlataforma } from '../../context/PlataformaDemo'
import MacVentana from './MacVentana'

const ORDEN = ['juan', 'juampi', 'nick']
const ESTADO = { vigente: 'Vigente', reemplazado: 'Reemplazado', complementario: 'Complementario', base: 'Inicial' }
const TIPO = { inicial: 'Roadmap inicial', revision: 'Revisión mensual', complementario: 'Complementario' }
const HOJA = 112
const SEP = 26

function Hoja({ r, sel, onSel }) {
  return (
    <button type="button" className={`mac-archivo mac-archivo--${r.estado}${sel ? ' is-sel' : ''}`} onClick={() => onSel(r.id)} aria-pressed={sel}>
      <span className="mac-doc" aria-hidden="true">
        {r.estado === 'vigente' ? <span className="mac-doc__cinta">Vigente</span> : null}
      </span>
      <span className="mac-archivo__nombre">{r.titulo}</span>
      <span className="mac-archivo__meta">{r.estado === 'reemplazado' ? 'Reemplazado' : r.estado === 'complementario' ? 'Complementario' : r.fecha}</span>
    </button>
  )
}

// Roadmaps con interfaz de macOS y un lienzo tipo Excalidraw adentro: una zona por coach, cada roadmap una hoja.
export default function RoadmapsMac() {
  const { cliente, roadmapsDe, vigenteDe } = usePlataforma()
  const yo = cliente(CLIENTE_DEMO)
  const todos = roadmapsDe(CLIENTE_DEMO)
  const vigente = vigenteDe(CLIENTE_DEMO)
  const [sel, setSel] = useState(vigente?.id ?? null)
  const [historial, setHistorial] = useState(true)
  const [zoom, setZoom] = useState(0.8)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const arrastre = useRef(null)
  const elegido = todos.find((r) => r.id === sel)

  let x = 40
  const zonas = ORDEN.map((id) => {
    const hojas = todos.filter((r) => r.coach === id && (historial || r.estado !== 'reemplazado'))
    const w = Math.max(240, 36 + hojas.length * HOJA + Math.max(0, hojas.length - 1) * SEP)
    const z = { id, hojas, x, y: 40, w }
    x += w + 80
    return z
  })
  const sistemas = todos.filter((r) => r.coach === 'franco')
  const bloqueado = yo.nivel !== 'high' && !sistemas.length
  const franco = { x: zonas[1].x, y: 330, w: 420 }

  function irA(z) {
    setZoom(1)
    setPan({ x: -z.x + 40, y: -z.y + 30 })
  }
  function bajar(e) {
    if (e.target.closest('button, a, label')) return
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
  const medio = (z) => z.y + 110

  return (
    <MacVentana titulo="Roadmaps">
      <div className="mac-tres">
        <aside className="mac-lateral" aria-label="Coaches">
          <p className="mac-seccion">Roadmaps</p>
          {vigente ? (
            <button
              type="button"
              className="mac-item"
              onClick={() => {
                setSel(vigente.id)
                irA(zonas.find((z) => z.id === vigente.coach))
              }}
            >
              <span className="mac-ico mac-rojo" aria-hidden="true">
                ●
              </span>
              <span className="mac-item__nombre">Vigente</span>
            </button>
          ) : null}
          <button
            type="button"
            className="mac-item"
            onClick={() => {
              setZoom(0.8)
              setPan({ x: 0, y: 0 })
            }}
          >
            <span className="mac-ico" aria-hidden="true">
              ▦
            </span>
            <span className="mac-item__nombre">Ver todo</span>
            <span className="mac-cuenta">{todos.length}</span>
          </button>
          <p className="mac-seccion">Coaches</p>
          {ORDEN.map((id) => (
            <button key={id} type="button" className="mac-item" onClick={() => irA(zonas.find((z) => z.id === id))}>
              <span className="mac-av" style={{ width: 20, height: 20, fontSize: 9, background: COACHES[id].color, color: COACHES[id].tinta }} aria-hidden="true">
                {COACHES[id].ini}
              </span>
              <span className="mac-item__nombre">{COACHES[id].nombre}</span>
              <span className="mac-cuenta">{todos.filter((r) => r.coach === id).length || ''}</span>
            </button>
          ))}
          <button type="button" className="mac-item" onClick={() => irA(franco)}>
            <span className="mac-av" style={{ width: 20, height: 20, fontSize: 9, background: COACHES.franco.color, color: COACHES.franco.tinta }} aria-hidden="true">
              {COACHES.franco.ini}
            </span>
            <span className="mac-item__nombre">{COACHES.franco.nombre}</span>
            {bloqueado ? <span className="mac-cuenta">High</span> : null}
          </button>
        </aside>

        <section className="mac-principal">
          {vigente ? (
            <button type="button" className="mac-banda" onClick={() => setSel(vigente.id)}>
              <span className="mac-doc mac-doc--chico" aria-hidden="true" />
              <span>
                <small>El que tenés que seguir ahora</small>
                <b>
                  {vigente.titulo} · {COACHES[vigente.coach].nombre}
                  {vigente.paso ? ` · paso ${vigente.paso[0]} de ${vigente.paso[1]}` : ''}
                </b>
              </span>
              <span className="mac-banda__abrir">Abrir</span>
            </button>
          ) : null}

          <div className="mac-lienzo" onPointerDown={bajar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
            <div className="mac-lienzo__mundo" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
              <svg className="mac-lienzo__flechas" width="2400" height="900" aria-hidden="true">
                <defs>
                  <marker id="mac-punta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0 0L10 5L0 10z" fill="#6e6e73" />
                  </marker>
                </defs>
                <path d={`M${zonas[0].x + zonas[0].w + 6} ${medio(zonas[0])} L ${zonas[1].x - 8} ${medio(zonas[1])}`} markerEnd="url(#mac-punta)" />
                <path d={`M${zonas[1].x + zonas[1].w + 6} ${medio(zonas[1])} L ${zonas[2].x - 8} ${medio(zonas[2])}`} markerEnd="url(#mac-punta)" />
                <path d={`M${zonas[1].x + 140} ${zonas[1].y + 236} C ${zonas[1].x + 140} ${zonas[1].y + 270}, ${franco.x + 80} ${franco.y - 30}, ${franco.x + 80} ${franco.y - 8}`} markerEnd="url(#mac-punta)" />
              </svg>

              {zonas.map((z) => (
                <section key={z.id} className="mac-zona" style={{ left: z.x, top: z.y, width: z.w, '--zona': COACHES[z.id].color }}>
                  <header>
                    <span className="mac-av" style={{ width: 26, height: 26, fontSize: 10, background: COACHES[z.id].color, color: COACHES[z.id].tinta }} aria-hidden="true">
                      {COACHES[z.id].ini}
                    </span>
                    <span>
                      <b>{COACHES[z.id].nombre}</b>
                      <small>{COACHES[z.id].rol}</small>
                    </span>
                  </header>
                  <div className="mac-zona__hojas">
                    {z.hojas.length ? z.hojas.map((r) => <Hoja key={r.id} r={r} sel={sel === r.id} onSel={setSel} />) : <p className="mac-vacio">Todavía no te dio ningún roadmap.</p>}
                  </div>
                </section>
              ))}

              <section className="mac-zona mac-zona--gris" style={{ left: franco.x, top: franco.y, width: franco.w, '--zona': '#8e8e93' }}>
                <header>
                  <span className="mac-av" style={{ width: 26, height: 26, fontSize: 10, background: COACHES.franco.color, color: COACHES.franco.tinta }} aria-hidden="true">
                    {COACHES.franco.ini}
                  </span>
                  <span>
                    <b>{COACHES.franco.nombre}</b>
                    <small>{COACHES.franco.rol}</small>
                  </span>
                </header>
                {bloqueado ? (
                  <div className="mac-bloqueado">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
                      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
                    </svg>
                    <span>
                      <b>Roadmap de Sistemas</b> · Métricas, software y laboratorios. Incluido en High.
                    </span>
                  </div>
                ) : (
                  <div className="mac-zona__hojas">
                    {sistemas.map((r) => (
                      <Hoja key={r.id} r={r} sel={sel === r.id} onSel={setSel} />
                    ))}
                  </div>
                )}
              </section>
            </div>

            <div className="mac-herramientas" role="toolbar" aria-label="Lienzo">
              <button type="button" aria-label="Alejar" onClick={() => acercar(-0.1)}>
                −
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button type="button" aria-label="Acercar" onClick={() => acercar(0.1)}>
                +
              </button>
              <i />
              <label>
                <input type="checkbox" checked={historial} onChange={(e) => setHistorial(e.target.checked)} />
                Historial
              </label>
            </div>
          </div>
        </section>

        <aside className="mac-inspector" aria-label="Información del roadmap">
          {elegido ? (
            <>
              <div className="mac-preview">
                <span className="mac-doc mac-doc--grande" aria-hidden="true">
                  {elegido.estado === 'vigente' ? <span className="mac-doc__cinta">Vigente</span> : null}
                </span>
                <b>{elegido.titulo}</b>
                <small>Documento de Google</small>
              </div>
              <p className="mac-seccion">Información</p>
              <div className="mac-grupo">
                <div className="mac-fila">
                  <span>Estado</span>
                  <b className={elegido.estado === 'vigente' ? 'mac-rojo' : ''}>{ESTADO[elegido.estado]}</b>
                </div>
                <div className="mac-fila">
                  <span>Tipo</span>
                  <b>{TIPO[elegido.tipo] ?? '—'}</b>
                </div>
                <div className="mac-fila">
                  <span>Coach</span>
                  <b>{COACHES[elegido.coach].nombre}</b>
                </div>
                <div className="mac-fila">
                  <span>Fecha</span>
                  <b>{elegido.fecha}</b>
                </div>
                {elegido.paso ? (
                  <div className="mac-fila">
                    <span>Avance</span>
                    <b>
                      Paso {elegido.paso[0]} de {elegido.paso[1]}
                    </b>
                  </div>
                ) : null}
              </div>
              {elegido.link ? (
                <a href={elegido.link} target="_blank" rel="noopener noreferrer" className="mac-boton">
                  Abrir documento
                </a>
              ) : (
                <button type="button" className="mac-boton" disabled>
                  Abrir documento
                </button>
              )}
              {elegido.estado === 'reemplazado' ? <p className="mac-nota">Quedó como historial. El que seguís ahora es {vigente?.titulo}.</p> : null}
            </>
          ) : (
            <p className="mac-nota">Tocá un roadmap del lienzo para ver su información.</p>
          )}
        </aside>
      </div>
    </MacVentana>
  )
}
