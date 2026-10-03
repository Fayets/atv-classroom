import { Fragment, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CANALES, CLIENTE_DEMO, COACHES, NIVELES, usePlataforma } from '../../context/PlataformaDemo'
import MacVentana from './MacVentana'

// Miembros del canal privado de cada cliente: el equipo que lo acompaña según su nivel.
const MIEMBROS = ['juampi', 'juan', 'nick']

function persona(autor, cliente) {
  if (autor === 'cliente') return { nombre: cliente.nombre.split(' ')[0], completo: cliente.nombre, color: 'var(--m-t1)', fondo: '#5a5a5f', tinta: '#fff', ini: cliente.nombre.slice(0, 2).toUpperCase(), rol: 'Cliente' }
  const c = COACHES[autor]
  return { nombre: c.nombre, completo: c.nombre, color: c.color, fondo: c.color, tinta: c.tinta, ini: c.ini, rol: c.rol, foto: c.foto }
}

function Av({ p, size = 36 }) {
  if (p.foto) return <img className="mac-av" src={p.foto} alt="" width={size} height={size} style={{ width: size, height: size }} />
  return (
    <span className="mac-av" style={{ width: size, height: size, background: p.fondo, color: p.tinta, fontSize: size > 30 ? 12 : 10 }} aria-hidden="true">
      {p.ini}
    </span>
  )
}

// Texto con menciones (@Nombre) resaltadas.
function ConMenciones({ texto, nombres }) {
  const partes = texto.split(/(@[A-Za-zÁÉÍÓÚáéíóúñÑ]+)/g)
  return partes.map((t, i) =>
    t.startsWith('@') && nombres.includes(t.slice(1)) ? (
      <span key={i} className="mac-mencion">
        {t}
      </span>
    ) : (
      <Fragment key={i}>{t}</Fragment>
    ),
  )
}

function Adjunto({ m }) {
  const { roadmap } = usePlataforma()
  if (m.tipo === 'sop') {
    return (
      <div className="mac-adjunto">
        <span className="mac-doc mac-doc--chico mac-doc--azul" aria-hidden="true" />
        <span className="mac-adjunto__txt">
          <b>{m.titulo}</b>
          <small>SOP completado desde el classroom</small>
        </span>
      </div>
    )
  }
  const r = roadmap(m.roadmap)
  if (!r) return null
  return (
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
  )
}

// El canal privado del cliente, como en Discord: avatar, nombre, hora, respuestas y menciones.
// `yo` es "cliente" o el id del coach que está mirando.
export function CanalPrivado({ c, yo = 'cliente' }) {
  const { conversacion, mensaje, enviar } = usePlataforma()
  const mensajes = conversacion(c.id)
  const [texto, setTexto] = useState('')
  const [respondiendo, setRespondiendo] = useState(null)
  const fin = useRef(null)
  const inputRef = useRef(null)
  const nombres = [c.nombre.split(' ')[0], ...MIEMBROS.map((id) => COACHES[id].nombre.split(' ')[0])]

  useEffect(() => {
    fin.current?.scrollIntoView({ block: 'end' })
  }, [mensajes.length])

  function mandar(e) {
    e.preventDefault()
    if (!texto.trim()) return
    enviar(c.id, yo === 'cliente' ? null : yo, { de: yo === 'cliente' ? 'cliente' : 'coach', tipo: 'texto', texto: texto.trim(), responde: respondiendo?.id })
    setTexto('')
    setRespondiendo(null)
  }

  return (
    <>
      <div className="mac-discord" role="log" aria-live="polite">
        <div className="mac-discord__inicio">
          <span className="mac-discord__hash">#</span>
          <b>Este es el comienzo de #{c.canal}</b>
          <span>{yo === 'cliente' ? 'Tu canal privado con el equipo de ATV. Lo ven vos y tus coaches.' : `Canal privado de ${c.nombre} con el equipo de ATV.`}</span>
        </div>
        {mensajes.map((m, i) => {
          const p = persona(m.autor, c)
          const previo = mensajes[i - 1]
          const agrupado = previo && previo.autor === m.autor && !m.responde && previo.hora === m.hora
          const citado = m.responde ? mensaje(c.id, m.responde) : null
          const miNombre = yo === 'cliente' ? c.nombre.split(' ')[0] : COACHES[yo].nombre.split(' ')[0]
          const menciona = m.tipo === 'texto' && m.autor !== yo && m.texto.includes(`@${miNombre}`)
          return (
            <div key={m.id} className={`mac-dmsg${agrupado ? ' is-agrupado' : ''}${menciona ? ' is-mencion' : ''}`}>
              {citado ? (
                <div className="mac-dmsg__cita">
                  <span className="mac-dmsg__codo" aria-hidden="true" />
                  <Av p={persona(citado.autor, c)} size={16} />
                  <b style={{ color: persona(citado.autor, c).color }}>@{persona(citado.autor, c).nombre}</b>
                  <span>{citado.texto ?? citado.titulo ?? 'Adjunto'}</span>
                </div>
              ) : null}
              <div className="mac-dmsg__fila">
                {agrupado ? <time className="mac-dmsg__hora-lateral">{m.hora}</time> : <Av p={p} />}
                <div className="mac-dmsg__cuerpo">
                  {agrupado ? null : (
                    <div className="mac-dmsg__head">
                      <b style={{ color: p.color }}>{p.completo}</b>
                      {m.autor !== 'cliente' ? <span className="mac-rol">ATV</span> : null}
                      <time>{m.hora}</time>
                    </div>
                  )}
                  {m.tipo === 'texto' ? (
                    <p>
                      <ConMenciones texto={m.texto} nombres={nombres} />
                    </p>
                  ) : (
                    <Adjunto m={m} />
                  )}
                </div>
                <button
                  type="button"
                  className="mac-dmsg__responder"
                  onClick={() => {
                    setRespondiendo({ id: m.id, nombre: p.nombre })
                    inputRef.current?.focus()
                  }}
                >
                  Responder
                </button>
              </div>
            </div>
          )
        })}
        <span ref={fin} />
      </div>
      <form className="mac-dredactar" onSubmit={mandar}>
        {respondiendo ? (
          <div className="mac-dredactar__resp">
            <span>
              Respondiendo a <b>{respondiendo.nombre}</b>
            </span>
            <button type="button" onClick={() => setRespondiendo(null)} aria-label="Cancelar respuesta">
              ✕
            </button>
          </div>
        ) : null}
        <div className="mac-dredactar__caja">
          <button type="button" className="mac-dredactar__mas" aria-label="Adjuntar un SOP o archivo" onClick={() => enviar(c.id, yo === 'cliente' ? null : yo, { de: yo === 'cliente' ? 'cliente' : 'coach', tipo: 'sop', titulo: 'SOP · Seguimiento post-call' })}>
            +
          </button>
          <label htmlFor="mac-mensaje" className="sr-only">
            Mensaje para #{c.canal}
          </label>
          <input ref={inputRef} id="mac-mensaje" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={`Enviar mensaje a #${c.canal}`} autoComplete="off" />
        </div>
      </form>
    </>
  )
}

function Fila({ etiqueta, valor }) {
  return (
    <div className="mac-fila">
      <span>{etiqueta}</span>
      <b>{valor}</b>
    </div>
  )
}

// Mensajes con estética de macOS y lógica de Discord: tu canal privado y los canales de la comunidad.
export default function MensajesMac() {
  const { cliente, conversacion, vigenteDe } = usePlataforma()
  const yo = cliente(CLIENTE_DEMO)
  const vigente = vigenteDe(CLIENTE_DEMO)
  const nivel = NIVELES[yo.nivel]
  const [activo, setActivo] = useState('privado')
  const [verLista, setVerLista] = useState(true)
  const msgs = conversacion(CLIENTE_DEMO)
  const ultimo = msgs[msgs.length - 1]
  const canal = activo === 'privado' ? null : CANALES.find((c) => c.id === activo)

  const abrir = (id) => {
    setActivo(id)
    setVerLista(false)
  }

  return (
    <MacVentana titulo="Mensajes">
      <div className={`mac-tres${verLista ? ' ver-lista' : ' ver-detalle'}`}>
        <aside className="mac-lateral" aria-label="Canales">
          <p className="mac-seccion">Tu canal</p>
          <button type="button" className={`mac-item mac-item--conv${activo === 'privado' ? ' is-on' : ''}`} onClick={() => abrir('privado')}>
            <span className="mac-hash mac-hash--grande" aria-hidden="true">
              #
            </span>
            <span className="mac-item__txt">
              <span className="mac-item__fila">
                <b>{yo.canal}</b>
                <time>{ultimo?.hora}</time>
              </span>
              <span className="mac-item__sub">
                {ultimo ? `${persona(ultimo.autor, yo).nombre}: ${ultimo.texto ?? 'adjunto'}` : 'Sin mensajes'}
              </span>
            </span>
            {activo !== 'privado' ? <span className="mac-cuenta mac-cuenta--rojo">2</span> : null}
          </button>
          <p className="mac-seccion">Comunidad ATV</p>
          {CANALES.map((c) => (
            <button key={c.id} type="button" className={`mac-item mac-item--canal${activo === c.id ? ' is-on' : ''}`} onClick={() => abrir(c.id)}>
              <span className="mac-hash" aria-hidden="true">
                #
              </span>
              <span className="mac-item__nombre">{c.nombre}</span>
              {c.nuevo ? <span className="mac-cuenta">{c.posts.length}</span> : null}
            </button>
          ))}
        </aside>

        <section className="mac-principal">
          <header className="mac-barra mac-barra--canal">
            <button type="button" className="mac-atras" onClick={() => setVerLista(true)} aria-label="Volver">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7.5 2.5L4 6l3.5 3.5" />
              </svg>
            </button>
            <span className="mac-hash" aria-hidden="true">
              #
            </span>
            <b>{canal ? canal.nombre : yo.canal}</b>
            <span className="mac-barra__sub">{canal ? 'Solo publica el equipo de ATV' : `Canal privado · ${MIEMBROS.length + 1} miembros`}</span>
          </header>
          {canal ? (
            <div className="mac-discord">
              {canal.posts.map((p) => {
                const per = persona(p.autor, yo)
                return (
                  <div key={p.id} className="mac-dmsg">
                    <div className="mac-dmsg__fila">
                      <Av p={per} />
                      <div className="mac-dmsg__cuerpo">
                        <div className="mac-dmsg__head">
                          <b style={{ color: per.color }}>{per.completo}</b>
                          <span className="mac-rol">ATV</span>
                          <time>{p.fecha}</time>
                        </div>
                        <p>
                          <b className="mac-post__titulo">{p.titulo}</b>
                          <br />
                          {p.texto}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <CanalPrivado c={yo} />
          )}
        </section>

        <aside className="mac-inspector" aria-label="Miembros y programa">
          <p className="mac-seccion">Equipo ATV — {MIEMBROS.length}</p>
          <div className="mac-miembros">
            {MIEMBROS.map((id) => {
              const p = persona(id, yo)
              return (
                <div key={id} className="mac-miembro">
                  <span className="mac-miembro__av">
                    <Av p={p} size={30} />
                    <i className={id === 'franco' ? '' : 'is-online'} />
                  </span>
                  <span>
                    <b style={{ color: p.color }}>{p.nombre}</b>
                    <small>{p.rol}</small>
                  </span>
                </div>
              )
            })}
          </div>
          <p className="mac-seccion">Cliente — 1</p>
          <div className="mac-miembros">
            <div className="mac-miembro">
              <span className="mac-miembro__av">
                <Av p={persona('cliente', yo)} size={30} />
                <i className="is-online" />
              </span>
              <span>
                <b>{yo.nombre}</b>
                <small>
                  {nivel.nombre} · mes {yo.mes} de {nivel.meses}
                </small>
              </span>
            </div>
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
        </aside>
      </div>
    </MacVentana>
  )
}
