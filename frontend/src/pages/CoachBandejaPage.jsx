import { useState } from 'react'
import AppHeader from '../components/AppHeader'
import { Chevron } from '../components/frentes/piezas'
import { CanalPrivado } from '../components/plataforma/MensajesMac'
import { AsignarRoadmap, Avatar, Chat, NivelChip } from '../components/plataforma/piezas'
import { COACH_DEMO, NIVELES, usePlataforma } from '../context/PlataformaDemo'
import '../styles/frentes.css'
import '../styles/plataforma.css'

const FILTROS = [
  ['esperando', 'Esperando'],
  ['todos', 'Todos'],
  ['riesgo', 'En riesgo'],
]

const iniciales = (nombre) =>
  nombre
    .split(/[\s·]+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

// Bandeja del coach: quién espera respuesta, métricas del día y la ficha del cliente.
export default function CoachBandejaPage() {
  const { clientes, esperando, conversacion, vigenteDe, roadmapsDe, enviar, estilo } = usePlataforma()
  const [filtro, setFiltro] = useState('esperando')
  const [activo, setActivo] = useState('federico')
  const [asignando, setAsignando] = useState(false)
  const [verLista, setVerLista] = useState(true)

  const visibles = clientes.filter((c) => (filtro === 'esperando' ? esperando[c.id] : filtro === 'riesgo' ? c.salud === 'riesgo' : true))
  const c = clientes.find((x) => x.id === activo)
  const vigente = vigenteDe(activo)
  const historial = roadmapsDe(activo).length - (vigente ? 1 : 0)
  const enRiesgo = clientes.filter((x) => x.salud === 'riesgo').length

  return (
    <div className="app-shell im-root">
      <AppHeader />
      <main className={`pf-bandeja${verLista ? ' ver-lista' : ' ver-chat'}`}>
        <div className="pf-metricas">
          <div className={`pf-metrica${Object.keys(esperando).length ? ' is-alerta' : ''}`}>
            <span>Sin responder</span>
            <b className="num">{Object.keys(esperando).length}</b>
          </div>
          <div className="pf-metrica">
            <span>Tu tiempo de respuesta hoy</span>
            <b className="num">1 h 12 m</b>
          </div>
          <div className="pf-metrica">
            <span>Clientes a cargo</span>
            <b className="num">{clientes.length}</b>
          </div>
          <div className="pf-metrica">
            <span>En riesgo (sin actividad +7 días)</span>
            <b className="num pf-warn">{enRiesgo}</b>
          </div>
        </div>

        <div className="pf-bandeja__grid">
          <aside className="pf-lista" aria-label="Clientes">
            <div className="pf-chips pf-chips--filtro" role="group" aria-label="Filtrar">
              {FILTROS.map(([id, nombre]) => (
                <button key={id} type="button" className={filtro === id ? 'is-on' : ''} aria-pressed={filtro === id} onClick={() => setFiltro(id)}>
                  {nombre}
                </button>
              ))}
            </div>
            {visibles.length ? (
              visibles.map((x) => {
                const msgs = conversacion(x.id, COACH_DEMO)
                const ultimo = msgs[msgs.length - 1]
                return (
                  <button
                    key={x.id}
                    type="button"
                    className={`pf-conv${x.id === activo ? ' is-on' : ''}${!esperando[x.id] ? ' is-calmo' : ''}`}
                    onClick={() => {
                      setActivo(x.id)
                      setVerLista(false)
                    }}
                  >
                    <Avatar iniciales={iniciales(x.nombre)} />
                    <span className="pf-conv__txt">
                      <span className="pf-conv__fila">
                        <b>{x.nombre}</b>
                        <time className={esperando[x.id] ? 'pf-rojo' : x.salud === 'riesgo' ? 'pf-warn' : ''}>{esperando[x.id] ?? (x.salud === 'riesgo' ? '9 días' : ultimo?.hora)}</time>
                      </span>
                      <span className="pf-conv__fila pf-conv__fila--sub">
                        <NivelChip nivel={x.nivel} />
                        <span className={`pf-conv__ultimo${x.salud === 'riesgo' ? ' pf-warn' : ''}`}>
                          {x.salud === 'riesgo' ? 'En riesgo · no escribe ni entra' : esperando[x.id] ? ultimo?.texto : 'Respondido'}
                        </span>
                      </span>
                    </span>
                  </button>
                )
              })
            ) : (
              <p className="pf-muted pf-vacio">No tenés a nadie esperando respuesta.</p>
            )}
          </aside>

          <section className="pf-centro">
            <div className="pf-centro__head">
              <button type="button" className="pf-volver" onClick={() => setVerLista(true)} aria-label="Volver a la lista">
                <Chevron dir="left" />
              </button>
              <span className="pf-centro__titulo">
                <b>{c.nombre}</b>
                <span>{esperando[c.id] ? `esperando respuesta hace ${esperando[c.id]}` : 'al día'}</span>
              </span>
              <button type="button" className="pc-btn pc-complete" onClick={() => setAsignando(true)}>
                Asignar roadmap
              </button>
              <button type="button" className="pc-btn pc-btn--ghost pf-solo-desk" onClick={() => enviar(c.id, COACH_DEMO, { de: 'coach', tipo: 'sop', titulo: 'SOP · Seguimiento post-call' })}>
                Enviar SOP
              </button>
            </div>
            {c.nivel === 'mid' ? <p className="pf-regla">Mid incluye revisión mensual con vos. Personalización extra es un upsell.</p> : null}
            {estilo === 'mac' || estilo === 'claro' ? (
              <CanalPrivado key={c.id} c={c} yo={COACH_DEMO} />
            ) : (
            <Chat
              key={c.id}
              cliente={c.id}
              coach={COACH_DEMO}
              yo="coach"
              placeholder={`Responderle a ${c.nombre.split(' ')[0]}…`}
              rapidas={['Dale, el jueves lo vemos', 'Revisado, avanzá con el siguiente paso']}
            />
            )}
          </section>

          <aside className="pf-lado" aria-label="Ficha del cliente">
            <div className="pf-ficha__head">
              <b>{c.nombre}</b>
              <span className="pf-muted">
                #{c.canal} · vence {c.vence}
              </span>
            </div>
            <div className="pf-datos">
              <div>
                <span>Nivel</span>
                <b>
                  {NIVELES[c.nivel].nombre} · mes {c.mes}/{NIVELES[c.nivel].meses}
                </b>
              </div>
              <div>
                <span>Salud</span>
                <b className={c.salud === 'riesgo' ? 'pf-warn' : 'pf-okc'}>{c.salud === 'riesgo' ? 'En riesgo' : 'Activo'}</b>
              </div>
              <div>
                <span>SOPs completos</span>
                <b className="num">
                  {c.sops[0]} de {c.sops[1]}
                </b>
              </div>
              <div>
                <span>Cierre de septiembre</span>
                <b className={c.cierre ? 'pf-okc' : 'pf-rojo'}>{c.cierre ? 'Completo' : 'Pendiente'}</b>
              </div>
            </div>
            <div className={`pf-box${vigente ? ' pf-box--rojo' : ''}`}>
              <span className={`pf-eyebrow${vigente ? ' pf-eyebrow--rojo' : ''}`}>Roadmap vigente</span>
              {vigente ? (
                <>
                  <b>{vigente.titulo}</b>
                  <span className="pf-muted">
                    {vigente.paso ? `Paso ${vigente.paso[0]} de ${vigente.paso[1]} · ` : ''}
                    {historial} {historial === 1 ? 'roadmap más' : 'roadmaps más'} en su historial
                  </span>
                </>
              ) : (
                <>
                  <b>Sin roadmap vigente</b>
                  <button type="button" className="pf-link" onClick={() => setAsignando(true)}>
                    Asignarle uno
                  </button>
                </>
              )}
            </div>
            <div className="pf-box">
              <span className="pf-eyebrow">Este mes en la plataforma</span>
              <span className="pf-fila">
                <span className="pf-muted">Mensajes enviados</span>
                <b className="num">{c.mensajesMes}</b>
              </span>
              <span className="pf-fila">
                <span className="pf-muted">Consultas a la guía</span>
                <b className="num">{c.consultasGuia}</b>
              </span>
              <span className="pf-fila">
                <span className="pf-muted">Clases implementadas</span>
                <b className="num">{c.implementadas}</b>
              </span>
            </div>
            {c.upsell ? (
              <div className="pf-box pf-box--oro">
                <span className="pf-eyebrow pf-eyebrow--oro">Upsell sugerido</span>
                <b>{c.upsell.titulo}</b>
                <span className="pf-muted">{c.upsell.motivo}</span>
              </div>
            ) : null}
          </aside>
        </div>
      </main>
      {asignando ? <AsignarRoadmap cliente={c.id} coach={COACH_DEMO} onCerrar={() => setAsignando(false)} /> : null}
    </div>
  )
}
