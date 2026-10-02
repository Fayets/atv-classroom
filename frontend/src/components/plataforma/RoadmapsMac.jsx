import { useState } from 'react'
import { CLIENTE_DEMO, COACHES, usePlataforma } from '../../context/PlataformaDemo'
import MacVentana from './MacVentana'

const ORDEN = ['juan', 'juampi', 'nick', 'franco']
const ESTADO = { vigente: 'Vigente', reemplazado: 'Reemplazado', complementario: 'Complementario', base: 'Inicial' }
const TIPO = { inicial: 'Roadmap inicial', revision: 'Revisión mensual', complementario: 'Complementario' }

function Archivo({ r, sel, onSel }) {
  return (
    <button type="button" className={`mac-archivo mac-archivo--${r.estado}${sel ? ' is-sel' : ''}`} onClick={() => onSel(r.id)} aria-pressed={sel}>
      <span className="mac-doc" aria-hidden="true">
        {r.estado === 'vigente' ? <span className="mac-doc__cinta">Vigente</span> : null}
      </span>
      <span className="mac-archivo__nombre">{r.titulo}</span>
      <span className="mac-archivo__meta">{r.estado === 'reemplazado' ? 'Reemplazado' : r.fecha}</span>
    </button>
  )
}

// Roadmaps con estética de Finder: cada coach es una sección y cada roadmap un archivo.
export default function RoadmapsMac() {
  const { cliente, roadmapsDe, vigenteDe } = usePlataforma()
  const yo = cliente(CLIENTE_DEMO)
  const todos = roadmapsDe(CLIENTE_DEMO)
  const vigente = vigenteDe(CLIENTE_DEMO)
  const [filtro, setFiltro] = useState('todos')
  const [sel, setSel] = useState(vigente?.id ?? null)
  const [historial, setHistorial] = useState(true)
  const elegido = todos.find((r) => r.id === sel)

  const grupos = ORDEN.filter((id) => filtro === 'todos' || filtro === id).map((id) => ({
    id,
    archivos: todos.filter((r) => r.coach === id && (historial || r.estado !== 'reemplazado')),
    bloqueado: id === 'franco' && yo.nivel !== 'high' && !todos.some((r) => r.coach === 'franco'),
  }))

  return (
    <MacVentana titulo="Roadmaps">
      <div className="mac-tres">
        <aside className="mac-lateral" aria-label="Coaches">
          <p className="mac-seccion">Roadmaps</p>
          <button type="button" className={`mac-item${filtro === 'todos' ? ' is-on' : ''}`} onClick={() => setFiltro('todos')}>
            <span className="mac-ico" aria-hidden="true">
              ▦
            </span>
            <span className="mac-item__nombre">Todos</span>
            <span className="mac-cuenta">{todos.length}</span>
          </button>
          {vigente ? (
            <button
              type="button"
              className="mac-item"
              onClick={() => {
                setFiltro('todos')
                setSel(vigente.id)
              }}
            >
              <span className="mac-ico mac-rojo" aria-hidden="true">
                ●
              </span>
              <span className="mac-item__nombre">Vigente</span>
            </button>
          ) : null}
          <p className="mac-seccion">Coaches</p>
          {ORDEN.map((id) => (
            <button key={id} type="button" className={`mac-item${filtro === id ? ' is-on' : ''}`} onClick={() => setFiltro(id)}>
              <span className="mac-av" style={{ width: 20, height: 20, fontSize: 9, background: COACHES[id].color, color: COACHES[id].tinta }} aria-hidden="true">
                {COACHES[id].ini}
              </span>
              <span className="mac-item__nombre">{COACHES[id].nombre}</span>
              <span className="mac-cuenta">{todos.filter((r) => r.coach === id).length || ''}</span>
            </button>
          ))}
        </aside>

        <section className="mac-principal">
          <header className="mac-barra mac-barra--finder">
            <b>{filtro === 'todos' ? 'Todos los roadmaps' : COACHES[filtro].nombre}</b>
            <span className="mac-barra__sub">
              {todos.length} archivos · uno vigente
            </span>
            <label className="mac-toggle">
              <input type="checkbox" checked={historial} onChange={(e) => setHistorial(e.target.checked)} />
              <span>Mostrar historial</span>
            </label>
          </header>

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

          <div className="mac-archivos" onClick={(e) => e.target === e.currentTarget && setSel(null)}>
            {grupos.map((g) => (
              <section key={g.id} className="mac-grupo-archivos" aria-label={COACHES[g.id].nombre}>
                <h3>
                  {COACHES[g.id].nombre} <span>{COACHES[g.id].rol}</span>
                </h3>
                {g.bloqueado ? (
                  <div className="mac-bloqueado">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
                      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
                    </svg>
                    <span>
                      <b>Roadmap de Sistemas</b> · Métricas, software y laboratorios. Incluido en High.
                    </span>
                  </div>
                ) : g.archivos.length ? (
                  <div className="mac-cuadricula">
                    {g.archivos.map((r) => (
                      <Archivo key={r.id} r={r} sel={sel === r.id} onSel={setSel} />
                    ))}
                  </div>
                ) : (
                  <p className="mac-vacio">Sin roadmaps de {COACHES[g.id].nombre}.</p>
                )}
              </section>
            ))}
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
            <p className="mac-nota">Elegí un roadmap para ver su información.</p>
          )}
        </aside>
      </div>
    </MacVentana>
  )
}
