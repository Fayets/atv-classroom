import { useState } from 'react'
import { Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { Chevron } from '../components/frentes/piezas'
import MensajesMac from '../components/plataforma/MensajesMac'
import { Avatar, Chat } from '../components/plataforma/piezas'
import { CANALES, CLIENTE_DEMO, COACHES, NIVELES, usePlataforma } from '../context/PlataformaDemo'
import '../styles/frentes.css'
import '../styles/plataforma.css'

const EQUIPO = ['juampi', 'juan', 'nick']

function Canal({ canal }) {
  return (
    <div className="pf-canal">
      {canal.posts.map((p) => (
        <article key={p.id} className="pf-post">
          <header>
            <Avatar coach={p.autor} size={30} />
            <b>{COACHES[p.autor].nombre}</b>
            <time>{p.fecha}</time>
          </header>
          <h3>{p.titulo}</h3>
          <p>{p.texto}</p>
        </article>
      ))}
      <p className="pf-muted pf-canal__pie">Solo el equipo de ATV publica en este canal.</p>
    </div>
  )
}

// Mensajes del cliente: su equipo ATV, los canales, el chat y su programa al costado.
export default function MensajesPage() {
  const { cliente, conversacion, vigenteDe, estilo } = usePlataforma()
  const yo = cliente(CLIENTE_DEMO)
  const vigente = vigenteDe(CLIENTE_DEMO)
  const [activo, setActivo] = useState({ tipo: 'coach', id: 'juampi' })
  const [verLista, setVerLista] = useState(true)
  const nivel = NIVELES[yo.nivel]

  function abrir(sel) {
    setActivo(sel)
    setVerLista(false)
  }

  const coach = activo.tipo === 'coach' ? COACHES[activo.id] : null
  const canal = activo.tipo === 'canal' ? CANALES.find((c) => c.id === activo.id) : null

  if (estilo === 'mac') return <MensajesMac />

  return (
    <div className="app-shell im-root">
      <AppHeader />
      <main className={`pf-mensajes${verLista ? ' ver-lista' : ' ver-chat'}`}>
        <aside className="pf-lista" aria-label="Conversaciones">
          <p className="pf-eyebrow">Tu equipo ATV</p>
          {EQUIPO.map((id) => {
            const msgs = conversacion(CLIENTE_DEMO, id)
            const ultimo = msgs[msgs.length - 1]
            const sinLeer = id === 'juampi' && activo.id !== 'juampi' ? 2 : 0
            return (
              <button key={id} type="button" className={`pf-conv${activo.tipo === 'coach' && activo.id === id ? ' is-on' : ''}`} onClick={() => abrir({ tipo: 'coach', id })}>
                <Avatar coach={id} />
                <span className="pf-conv__txt">
                  <span className="pf-conv__fila">
                    <b>{COACHES[id].nombre}</b>
                    <time>{ultimo?.hora}</time>
                  </span>
                  <span className="pf-conv__ultimo">{ultimo?.tipo === 'roadmap' ? 'Te asignó un roadmap' : ultimo?.tipo === 'sop' ? 'SOP enviado' : ultimo?.texto}</span>
                </span>
                {sinLeer ? <span className="pf-badge">{sinLeer}</span> : null}
              </button>
            )
          })}
          <p className="pf-eyebrow">Canales</p>
          {CANALES.map((c) => (
            <button key={c.id} type="button" className={`pf-canal-item${activo.tipo === 'canal' && activo.id === c.id ? ' is-on' : ''}`} onClick={() => abrir({ tipo: 'canal', id: c.id })}>
              <span>
                <i>#</i> {c.nombre}
              </span>
              {c.nuevo ? <span className="pf-tag-nuevo">Nuevo</span> : null}
            </button>
          ))}
        </aside>

        <section className="pf-centro">
          <div className="pf-centro__head">
            <button type="button" className="pf-volver" onClick={() => setVerLista(true)} aria-label="Volver a las conversaciones">
              <Chevron dir="left" />
            </button>
            {coach ? (
              <>
                <Avatar coach={coach.id} />
                <span className="pf-centro__titulo">
                  <b>{coach.nombre}</b>
                  <span>
                    {coach.rol} · suele responder en {coach.responde}
                  </span>
                </span>
              </>
            ) : (
              <span className="pf-centro__titulo">
                <b>#{canal.nombre}</b>
                <span>Canal de ATV</span>
              </span>
            )}
          </div>
          {coach && vigente ? (
            <Link to="/roadmaps" className="pf-vigente-movil">
              <span className="pf-eyebrow pf-eyebrow--rojo">Roadmap vigente</span>
              <b>
                {vigente.titulo} · paso {vigente.paso?.[0]} de {vigente.paso?.[1]}
              </b>
            </Link>
          ) : null}
          {coach ? <Chat key={coach.id} cliente={CLIENTE_DEMO} coach={coach.id} yo="cliente" placeholder={`Escribile a ${coach.nombre}…`} /> : <Canal canal={canal} />}
        </section>

        <aside className="pf-lado" aria-label="Tu programa">
          <div className="pf-box">
            <span className="pf-eyebrow">Tu programa</span>
            <b className="pf-box__big">
              {nivel.nombre} · mes {yo.mes} de {nivel.meses}
            </b>
            <span className="mt-bar" aria-hidden="true">
              <i style={{ transform: `scaleX(${yo.mes / nivel.meses})` }} />
            </span>
            <span className="pf-muted">{nivel.incluye}</span>
          </div>
          {vigente ? (
            <Link to="/roadmaps" className="pf-box pf-box--rojo">
              <span className="pf-eyebrow pf-eyebrow--rojo">Roadmap vigente</span>
              <b>{vigente.titulo}</b>
              <span className="pf-muted">
                De {COACHES[vigente.coach].nombre} · {vigente.fecha === 'Hoy' ? 'actualizado hoy' : vigente.fecha}
                {vigente.paso ? ` · paso ${vigente.paso[0]} de ${vigente.paso[1]}` : ''}
              </span>
            </Link>
          ) : null}
          <div className="pf-box">
            <span className="pf-eyebrow">Próximo 1-1</span>
            <b>Jueves 8/10 · 18:00</b>
            <span className="pf-muted">Con Juampi · traé el SOP corregido</span>
          </div>
          <div className="pf-box">
            <span className="pf-eyebrow">Tus SOPs</span>
            <span className="pf-fila">
              <span>Completos</span>
              <b className="num">
                {yo.sops[0]} de {yo.sops[1]}
              </b>
            </span>
            <span className="mt-bar pf-bar-ok" aria-hidden="true">
              <i style={{ transform: `scaleX(${yo.sops[0] / yo.sops[1]})` }} />
            </span>
          </div>
          <button type="button" className="pf-box pf-box--ok" onClick={() => abrir({ tipo: 'canal', id: 'lo-nuevo' })}>
            <span className="pf-eyebrow pf-eyebrow--ok">Llega en octubre</span>
            <b>Agente de setting con IA</b>
            <span className="pf-muted">Configurado con tus llamadas de Fathom.</span>
          </button>
        </aside>
      </main>
    </div>
  )
}
