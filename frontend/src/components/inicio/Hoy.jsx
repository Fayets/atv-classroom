import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchProgramas, fetchSopsClassroom, request } from '../../api/client'
import { fetchCanales, fetchMensajes } from '../../api/mensajes'
import { fetchMiRoadmap } from '../../api/roadmap'
import { useMensajeria } from '../../context/MensajeriaContext'
import { tituloLindo } from '../../utils/frentes'
import { haceCuanto } from '../../utils/mensajes'
import { getModuloCoverUrl } from '../../utils/modules'
import { Chevron } from '../frentes/piezas'
import '../../styles/anillo-programa.css'

// Las piezas del inicio del cliente (rediseño 2026-11, ver styles/inicio.css):
//   - AnilloPrograma: el tiempo del programa como un anillo con el texto girando alrededor. No va en el inicio: se usa
//     en Mi cuenta (la credencial). Recibe la cuenta de fetchCuenta() (api/cuenta); estilos en anillo-programa.css.
//   - BandaPaso: el próximo paso del roadmap en una banda roja a todo el ancho.
//   - TuSemana: seguir la clase, el chat con ATV, los SOPs y el avance del material.
// Los datos se piden una sola vez en useHoy() y se reparten.

const iniciales = (n) => (n || '').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()

// Del roadmap vigente, el primer paso que le toca al cliente (no los que hace ATV).
function proximoPaso(datos) {
  const doc = datos?.principal
  if (!doc) return null
  const grupo = datos.grupos?.find((g) => g.docs.some((d) => d.id === doc.id))
  const pasos = doc.pasos || []
  const paso = pasos.find((p) => !p.hecho && p.quien !== 'atv') || pasos.find((p) => !p.hecho)
  return {
    doc,
    coach: grupo?.coach?.nombre,
    texto: paso?.texto || (pasos.length ? null : doc.titulo),
    hechos: doc.paso_actual || 0,
    total: doc.pasos_total || pasos.length || 0,
  }
}

export function useHoy() {
  const { habilitada } = useMensajeria()
  const [roadmap, setRoadmap] = useState(undefined)
  const [clase, setClase] = useState(undefined)
  const [chat, setChat] = useState(null)
  const [sops, setSops] = useState(null)
  const [modulos, setModulos] = useState(null)

  useEffect(() => {
    fetchMiRoadmap().then(setRoadmap).catch(() => setRoadmap(null))
    request('/api/programas/continuar').then(setClase).catch(() => setClase(null))
    fetchSopsClassroom()
      .then((m) => setSops(Array.isArray(m) ? m.reduce((n, x) => n + x.sops.length, 0) : null))
      .catch(() => null)
    fetchProgramas().then((ps) => setModulos(ps || [])).catch(() => null)
  }, [])

  useEffect(() => {
    if (!habilitada) return
    fetchCanales()
      .then((cs) => setChat((cs || []).find((c) => c.tipo === 'cliente') || null))
      .catch(() => null)
  }, [habilitada])

  // El avance de todo el material: clases hechas sobre el total de los módulos abiertos.
  let avance = null
  if (modulos) {
    const abiertos = modulos.filter((p) => !p.bloqueado && p.total_clases)
    const total = abiertos.reduce((n, p) => n + p.total_clases, 0)
    const hechas = abiertos.reduce((n, p) => n + (p.total_clases * (p.porcentaje_progreso || 0)) / 100, 0)
    avance = total ? { pct: Math.round((hechas / total) * 100), modulos: abiertos.length } : null
  }
  const modulo = clase && modulos ? modulos.find((m) => m.id === clase.programa_id) : null
  return { paso: proximoPaso(roadmap), clase, modulo, chat, sops, avance }
}

// ---------------------------------------------------------------- Anillo del programa
// Como el sello de Cora: el texto gira alrededor de un anillo. El arco rojo es lo que ya pasó del programa;
// al centro, los días que quedan.
export function AnilloPrograma({ cuenta }) {
  if (!cuenta || cuenta.tipo !== 'cliente' || cuenta.dias_restantes == null) return null
  const total = cuenta.duracion_dias || 0
  const pasado = total ? Math.min(1, Math.max(0, (total - cuenta.dias_restantes) / total)) : 0
  const dias = Math.max(0, cuenta.dias_restantes)
  const plan = cuenta.plan_nombre ? `Programa ${cuenta.plan_nombre}` : 'Tu programa'
  const frase = `${plan} · ${dias > 0 ? `te quedan ${dias} ${dias === 1 ? 'día' : 'días'}` : 'acceso vencido'} · `
  const R = 62
  const largo = 2 * Math.PI * R
  return (
    <div className="in-anillo" role="img" aria-label={`${plan}: ${dias > 0 ? `te quedan ${dias} días` : 'acceso vencido'}`}>
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <defs>
          <path id="in-anillo-txt" d="M100,100 m-86,0 a86,86 0 1,1 172,0 a86,86 0 1,1 -172,0" />
        </defs>
        <g className="in-anillo__giro">
          <text>
            <textPath href="#in-anillo-txt" textLength={2 * Math.PI * 86 - 4} lengthAdjust="spacing">
              {frase.repeat(2).toUpperCase()}
            </textPath>
          </text>
        </g>
        <circle className="in-anillo__pista" cx="100" cy="100" r={R} />
        <circle
          className="in-anillo__arco"
          cx="100"
          cy="100"
          r={R}
          strokeDasharray={`${largo * pasado} ${largo}`}
          transform="rotate(-90 100 100)"
        />
      </svg>
      <span className="in-anillo__centro">
        <b className="num">{dias}</b>
        <small>{dias === 1 ? 'día' : 'días'}</small>
      </span>
    </div>
  )
}

// ---------------------------------------------------------------- Banda del próximo paso
// Como los bloques de color de Nubank: una banda roja de borde a borde con el paso en grande.
export function BandaPaso({ paso }) {
  if (!paso?.texto) return null
  const segmentos = Math.min(paso.total || 0, 12)
  return (
    <section className="in-banda" aria-labelledby="in-banda-t">
      <div className="in-banda__marco">
        <div className="in-banda__txt">
          <p className="in-banda__etq">
            <span>Tu próximo paso</span>
            {paso.coach ? (
              <span className="in-banda__coach">
                <i aria-hidden="true">{iniciales(paso.coach)}</i>
                {paso.doc.titulo} con {paso.coach}
              </span>
            ) : (
              <span className="in-banda__coach">{paso.doc.titulo}</span>
            )}
          </p>
          <h2 id="in-banda-t">{paso.texto}</h2>
        </div>
        <div className="in-banda__lado">
          {segmentos ? (
            <>
              <span className="in-banda__cuenta num" aria-hidden="true">
                {paso.hechos}
                <small>/{paso.total}</small>
              </span>
              <span className="in-banda__segs" aria-label={`${paso.hechos} de ${paso.total} pasos hechos`}>
                {Array.from({ length: segmentos }, (_, i) => (
                  <i key={i} className={i < paso.hechos ? 'is-hecho' : i === paso.hechos ? 'is-ahora' : ''} />
                ))}
              </span>
            </>
          ) : null}
          {/* Celular: el coach baja acá, como una línea chica (arriba, en la etiqueta, se oculta). */}
          <span className="in-banda__coach-bajo">
            {paso.coach ? <i aria-hidden="true">{iniciales(paso.coach)}</i> : null}
            {paso.doc.titulo}
            {paso.coach ? <> · con {paso.coach}</> : null}
          </span>
          <Link to="/roadmap" className="in-banda__ir">
            Ver mi roadmap <Chevron />
          </Link>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- Tu semana
function Seguir({ clase, modulo }) {
  const portada = modulo ? getModuloCoverUrl(modulo) : null
  return (
    <Link to={`/classroom/${clase.programa_id}?clase=${clase.clase_id}`} className="in-card in-seguir">
      <span className="in-seguir__portada" aria-hidden="true">
        {portada ? <img src={portada} alt="" loading="lazy" decoding="async" /> : null}
        <span className="in-seguir__play">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        </span>
      </span>
      <span className="in-seguir__txt">
        <small className="in-card__etq">{clase.empezada ? 'Seguí donde quedaste' : 'Empezá por acá'}</small>
        <b>{tituloLindo(clase.titulo)}</b>
        <span className="in-seguir__donde">
          {clase.modulo} · Clase {clase.numero} de {clase.total}
        </span>
        <span className="in-seguir__barra" aria-hidden="true">
          <i style={{ transform: `scaleX(${(clase.porcentaje || 0) / 100})` }} />
        </span>
      </span>
    </Link>
  )
}

// Los últimos 2 mensajes que te mandó el equipo en tu chat (reales: se piden al canal y se suman los que llegan en
// vivo). En celular se muestra solo el último (inicio.css).
function useUltimosDelEquipo(canalId) {
  const { suscribir } = useMensajeria()
  const [ultimos, setUltimos] = useState(null)
  const delEquipo = (m) => m && !m.borrado && m.texto && m.autor?.tipo !== 'cliente'
  useEffect(() => {
    if (!canalId) return undefined
    let vivo = true
    fetchMensajes(canalId)
      .then((r) => vivo && setUltimos((r?.mensajes || []).filter(delEquipo).slice(-2)))
      .catch(() => vivo && setUltimos(null))
    const dejar = suscribir?.((ev) => {
      if (ev.tipo === 'mensaje' && ev.mensaje?.canal_id === canalId && delEquipo(ev.mensaje)) {
        setUltimos((l) => [...(l || []).filter((m) => m.id !== ev.mensaje.id), ev.mensaje].slice(-2))
      }
    })
    return () => {
      vivo = false
      dejar?.()
    }
  }, [canalId, suscribir])
  return ultimos
}

function Chat({ chat }) {
  const nuevos = chat.no_leidos || 0
  const ultimos = useUltimosDelEquipo(chat.id)
  // Si todavía no llegaron (o falló el pedido), el último mensaje que trae la lista de canales.
  const u = chat.ultimo
  const lista = ultimos?.length
    ? ultimos.map((m) => ({ id: m.id, nombre: m.autor?.nombre, texto: m.texto, cuando: m.creado_en }))
    : u?.texto && u.de !== 'cliente'
      ? [{ id: 'ultimo', nombre: u.autor_nombre, texto: u.texto, cuando: u.creado_en }]
      : []
  return (
    <Link to={`/mensajes?c=${chat.id}`} className={`in-card in-chat${nuevos ? ' is-nuevos' : ''}`}>
      <small className="in-card__etq">
        Tu chat con ATV
        {nuevos ? <span className="in-chat__cuenta num">{nuevos > 99 ? '99+' : nuevos}</span> : null}
      </small>
      {lista.length ? (
        <span className="in-chat__globos">
          {lista.map((m) => (
            <span key={m.id} className="in-chat__globo">
              <span className="in-chat__quien">
                <i aria-hidden="true">{iniciales(m.nombre)}</i>
                {m.nombre}
                <span>{haceCuanto(m.cuando)}</span>
              </span>
              <span className="in-chat__texto">{m.texto}</span>
            </span>
          ))}
        </span>
      ) : (
        <span className="in-chat__vacio">Escribile al equipo: te responde tu coach.</span>
      )}
      <span className="in-card__ir">
        {nuevos ? `Leer ${nuevos === 1 ? 'el mensaje nuevo' : `los ${nuevos} nuevos`}` : 'Abrir el chat'} <Chevron />
      </span>
    </Link>
  )
}

function Sops({ total }) {
  return (
    <Link to="/classroom?vista=sops" className="in-card in-sops">
      <small className="in-card__etq">Biblioteca de SOPs</small>
      <span className="in-sops__pila" aria-hidden="true">
        <i />
        <i />
        <i>
          <span />
          <span />
          <span />
        </i>
      </span>
      <b>
        <span className="num">{total}</span> SOPs listos para copiar
      </b>
      <span className="in-card__ir">
        Buscar un SOP <Chevron />
      </span>
    </Link>
  )
}

function Avance({ avance }) {
  const R = 30
  const largo = 2 * Math.PI * R
  return (
    <Link to="/classroom" className="in-card in-avance">
      <small className="in-card__etq">Tu avance en el material</small>
      <span className="in-avance__fila">
        <svg viewBox="0 0 76 76" aria-hidden="true">
          <circle cx="38" cy="38" r={R} className="in-avance__pista" />
          <circle cx="38" cy="38" r={R} className="in-avance__arco" strokeDasharray={`${(largo * avance.pct) / 100} ${largo}`} transform="rotate(-90 38 38)" />
        </svg>
        <span>
          <b className="num">{avance.pct}%</b>
          <span>de {avance.modulos} módulos abiertos</span>
        </span>
      </span>
      <span className="in-card__ir">
        Ver los módulos <Chevron />
      </span>
    </Link>
  )
}

export function TuSemana({ clase, modulo, chat, sops, avance }) {
  if (!clase && !chat && !sops && !avance) return null
  return (
    <section className="in-semana" aria-labelledby="in-semana-t">
      <h2 id="in-semana-t" className="in-titulo">Tu semana</h2>
      <div className="in-bento">
        {clase ? <Seguir clase={clase} modulo={modulo} /> : null}
        {chat ? <Chat chat={chat} /> : null}
        {sops ? <Sops total={sops} /> : null}
        {avance ? <Avance avance={avance} /> : null}
      </div>
    </section>
  )
}
