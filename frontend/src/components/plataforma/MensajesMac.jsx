import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CANALES, CLIENTE_DEMO, COACHES, NIVELES, usePlataforma } from '../../context/PlataformaDemo'
import MacVentana from './MacVentana'

const EQUIPO = ['juampi', 'juan', 'nick']

function Av({ coach, size = 32 }) {
  const c = COACHES[coach]
  return (
    <span className="mac-av" style={{ width: size, height: size, background: c.color, color: c.tinta }} aria-hidden="true">
      {c.ini}
    </span>
  )
}

function Fila({ etiqueta, valor, tono }) {
  return (
    <div className="mac-fila">
      <span>{etiqueta}</span>
      <b className={tono ? `mac-${tono}` : ''}>{valor}</b>
    </div>
  )
}

function Burbujas({ cliente, coach }) {
  const { conversacion, roadmap, enviar } = usePlataforma()
  const mensajes = conversacion(cliente, coach)
  const [texto, setTexto] = useState('')
  const fin = useRef(null)

  useEffect(() => {
    fin.current?.scrollIntoView({ block: 'end' })
  }, [mensajes.length, coach])

  function mandar(e) {
    e.preventDefault()
    if (!texto.trim()) return
    enviar(cliente, coach, { de: 'cliente', tipo: 'texto', texto: texto.trim() })
    setTexto('')
  }

  return (
    <>
      <div className="mac-hilo" role="log" aria-live="polite">
        <span className="mac-hilo__dia">Hoy</span>
        {mensajes.map((m) => {
          const mio = m.de === 'cliente'
          if (m.tipo === 'roadmap') {
            const r = roadmap(m.roadmap)
            if (!r) return null
            return (
              <div key={m.id} className="mac-linea">
                <div className={`mac-adjunto${r.estado === 'vigente' ? ' is-vigente' : ''}`}>
                  <span className="mac-doc mac-doc--chico" aria-hidden="true" />
                  <span className="mac-adjunto__txt">
                    <b>{r.titulo}</b>
                    <small>
                      Roadmap de {COACHES[r.coach].nombre}
                      {r.estado === 'vigente' && m.reemplaza ? ` · reemplaza a ${m.reemplaza}` : ''}
                    </small>
                  </span>
                  {r.estado === 'vigente' ? <span className="mac-pill mac-pill--rojo">Vigente</span> : r.estado === 'reemplazado' ? <span className="mac-pill">Reemplazado</span> : null}
                  <Link to="/roadmaps" className="mac-adjunto__abrir">
                    Abrir
                  </Link>
                </div>
              </div>
            )
          }
          if (m.tipo === 'sop') {
            return (
              <div key={m.id} className={`mac-linea${mio ? ' is-mio' : ''}`}>
                <div className="mac-adjunto">
                  <span className="mac-doc mac-doc--chico mac-doc--azul" aria-hidden="true" />
                  <span className="mac-adjunto__txt">
                    <b>{m.titulo}</b>
                    <small>Completado desde el classroom</small>
                  </span>
                </div>
              </div>
            )
          }
          return (
            <div key={m.id} className={`mac-linea${mio ? ' is-mio' : ''}`}>
              <div className={`mac-burbuja${mio ? ' is-mio' : ''}`} title={m.hora}>
                {m.texto}
              </div>
            </div>
          )
        })}
        <span className="mac-hilo__leido">Leído {mensajes[mensajes.length - 1]?.hora}</span>
        <span ref={fin} />
      </div>
      <form className="mac-redactar" onSubmit={mandar}>
        <label htmlFor="mac-mensaje" className="sr-only">
          Mensaje para {COACHES[coach].nombre}
        </label>
        <input id="mac-mensaje" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={`Mensaje para ${COACHES[coach].nombre}`} autoComplete="off" />
        <button type="submit" disabled={!texto.trim()} aria-label="Enviar">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" />
          </svg>
        </button>
      </form>
    </>
  )
}

// Mensajes con estética de macOS: barra lateral, hilo y un inspector a la derecha.
export default function MensajesMac() {
  const { cliente, conversacion, vigenteDe } = usePlataforma()
  const yo = cliente(CLIENTE_DEMO)
  const vigente = vigenteDe(CLIENTE_DEMO)
  const nivel = NIVELES[yo.nivel]
  const [activo, setActivo] = useState({ tipo: 'coach', id: 'juampi' })
  const [verLista, setVerLista] = useState(true)
  const [busca, setBusca] = useState('')

  const abrir = (sel) => {
    setActivo(sel)
    setVerLista(false)
  }
  const coach = activo.tipo === 'coach' ? COACHES[activo.id] : null
  const canal = activo.tipo === 'canal' ? CANALES.find((c) => c.id === activo.id) : null
  const q = busca.trim().toLowerCase()

  return (
    <MacVentana titulo="Mensajes">
      <div className={`mac-tres${verLista ? ' ver-lista' : ' ver-detalle'}`}>
        <aside className="mac-lateral" aria-label="Conversaciones">
          <label htmlFor="mac-buscar" className="sr-only">
            Buscar
          </label>
          <input id="mac-buscar" className="mac-buscar" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar" />
          <p className="mac-seccion">Equipo ATV</p>
          {EQUIPO.filter((id) => !q || COACHES[id].nombre.toLowerCase().includes(q)).map((id) => {
            const msgs = conversacion(CLIENTE_DEMO, id)
            const ultimo = msgs[msgs.length - 1]
            const on = activo.tipo === 'coach' && activo.id === id
            return (
              <button key={id} type="button" className={`mac-item mac-item--conv${on ? ' is-on' : ''}`} onClick={() => abrir({ tipo: 'coach', id })}>
                {id === 'juampi' && !on ? <span className="mac-punto" aria-label="Sin leer" /> : <span className="mac-punto is-vacio" />}
                <Av coach={id} size={34} />
                <span className="mac-item__txt">
                  <span className="mac-item__fila">
                    <b>{COACHES[id].nombre}</b>
                    <time>{ultimo?.hora}</time>
                  </span>
                  <span className="mac-item__sub">{ultimo?.tipo === 'roadmap' ? 'Roadmap adjunto' : ultimo?.tipo === 'sop' ? 'SOP adjunto' : ultimo?.texto}</span>
                </span>
              </button>
            )
          })}
          <p className="mac-seccion">Canales</p>
          {CANALES.filter((c) => !q || c.nombre.includes(q)).map((c) => (
            <button key={c.id} type="button" className={`mac-item mac-item--canal${activo.tipo === 'canal' && activo.id === c.id ? ' is-on' : ''}`} onClick={() => abrir({ tipo: 'canal', id: c.id })}>
              <span className="mac-hash" aria-hidden="true">
                #
              </span>
              <span className="mac-item__nombre">{c.nombre}</span>
              {c.nuevo ? <span className="mac-cuenta">{c.posts.length}</span> : null}
            </button>
          ))}
        </aside>

        <section className="mac-principal">
          <header className="mac-barra">
            <button type="button" className="mac-atras" onClick={() => setVerLista(true)} aria-label="Volver">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7.5 2.5L4 6l3.5 3.5" />
              </svg>
            </button>
            <span className="mac-barra__para">Para:</span>
            <b>{coach ? coach.nombre : `#${canal.nombre}`}</b>
            <span className="mac-barra__sub">{coach ? `${coach.rol} · responde en ${coach.responde}` : 'Solo publica el equipo de ATV'}</span>
          </header>
          {coach ? (
            <Burbujas cliente={CLIENTE_DEMO} coach={coach.id} />
          ) : (
            <div className="mac-hilo">
              {canal.posts.map((p) => (
                <article key={p.id} className="mac-post">
                  <header>
                    <Av coach={p.autor} size={26} />
                    <b>{COACHES[p.autor].nombre}</b>
                    <time>{p.fecha}</time>
                  </header>
                  <h3>{p.titulo}</h3>
                  <p>{p.texto}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="mac-inspector" aria-label="Tu programa">
          <p className="mac-seccion">Programa</p>
          <div className="mac-grupo">
            <Fila etiqueta="Nivel" valor={nivel.nombre} />
            <Fila etiqueta="Mes" valor={`${yo.mes} de ${nivel.meses}`} />
            <Fila etiqueta="Incluye" valor={nivel.incluye} />
          </div>
          <p className="mac-seccion">Roadmap vigente</p>
          {vigente ? (
            <Link to="/roadmaps" className="mac-grupo mac-grupo--link">
              <span className="mac-vig">
                <span className="mac-doc mac-doc--chico" aria-hidden="true" />
                <span>
                  <b>{vigente.titulo}</b>
                  <small>
                    {COACHES[vigente.coach].nombre} · {vigente.paso ? `paso ${vigente.paso[0]} de ${vigente.paso[1]}` : vigente.fecha}
                  </small>
                </span>
              </span>
            </Link>
          ) : (
            <div className="mac-grupo">
              <Fila etiqueta="Estado" valor="Sin asignar" />
            </div>
          )}
          <p className="mac-seccion">Próximo 1-1</p>
          <div className="mac-grupo">
            <Fila etiqueta="Cuándo" valor="Jue 8/10 · 18:00" />
            <Fila etiqueta="Con" valor="Juampi" />
          </div>
          <p className="mac-seccion">SOPs</p>
          <div className="mac-grupo">
            <Fila etiqueta="Completos" valor={`${yo.sops[0]} de ${yo.sops[1]}`} />
            <div className="mac-progreso" aria-hidden="true">
              <i style={{ width: `${(yo.sops[0] / yo.sops[1]) * 100}%` }} />
            </div>
          </div>
          <button type="button" className="mac-aviso" onClick={() => abrir({ tipo: 'canal', id: 'lo-nuevo' })}>
            <span className="mac-aviso__icono" aria-hidden="true">
              ✦
            </span>
            <span>
              <b>Llega en octubre</b>
              <small>Agente de setting con IA, configurado con tus llamadas.</small>
            </span>
          </button>
        </aside>
      </div>
    </MacVentana>
  )
}
