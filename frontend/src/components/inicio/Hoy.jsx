import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchProgramas, fetchSopsClassroom, request } from '../../api/client'
import { fetchCuenta } from '../../api/cuenta'
import { fetchCanales } from '../../api/mensajes'
import { fetchMiRoadmap } from '../../api/roadmap'
import { useMensajeria } from '../../context/MensajeriaContext'
import { tituloLindo } from '../../utils/frentes'

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

// "Hoy" en el inicio del cliente: su próximo paso del roadmap y la clase en la que quedó.
function haceCuanto(iso) {
  const min = Math.round((Date.now() - new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`).getTime()) / 60000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  if (min < 24 * 60) return `hace ${Math.round(min / 60)} h`
  const d = Math.round(min / 1440)
  return d === 1 ? 'ayer' : `hace ${d} días`
}

export function Hoy() {
  const { habilitada } = useMensajeria()
  const [roadmap, setRoadmap] = useState(undefined)
  const [clase, setClase] = useState(undefined)
  const [chat, setChat] = useState(null)
  const [sops, setSops] = useState(null)
  const [avance, setAvance] = useState(null)

  useEffect(() => {
    fetchMiRoadmap().then(setRoadmap).catch(() => setRoadmap(null))
    request('/api/programas/continuar').then(setClase).catch(() => setClase(null))
    fetchSopsClassroom()
      .then((m) => setSops(Array.isArray(m) ? m.reduce((n, x) => n + x.sops.length, 0) : null))
      .catch(() => null)
    // El avance de todo el material: clases hechas sobre el total de los módulos abiertos.
    fetchProgramas()
      .then((ps) => {
        const abiertos = (ps || []).filter((p) => !p.bloqueado && p.total_clases)
        const total = abiertos.reduce((n, p) => n + p.total_clases, 0)
        const hechas = abiertos.reduce((n, p) => n + (p.total_clases * (p.porcentaje_progreso || 0)) / 100, 0)
        setAvance(total ? Math.round((hechas / total) * 100) : null)
      })
      .catch(() => null)
  }, [])

  useEffect(() => {
    if (!habilitada) return
    fetchCanales()
      .then((cs) => setChat((cs || []).find((c) => c.tipo === 'cliente') || null))
      .catch(() => null)
  }, [habilitada])

  const paso = proximoPaso(roadmap)
  if (!paso && !clase && !chat) return null
  const pct = paso?.total ? Math.round((paso.hechos / paso.total) * 100) : 0

  return (
    <div className="im-hoy">
      {paso && paso.texto ? (
        <section className="im-hoy__bloque">
          <h2 className="im-hoy__etq">Tu próximo paso</h2>
          <Link to="/roadmap" className="im-paso">
            <span className="im-paso__coach">
              {paso.coach ? <i aria-hidden="true">{iniciales(paso.coach)}</i> : null}
              {paso.doc.titulo}
              {paso.coach ? ` · ${paso.coach}` : ''}
            </span>
            <b>{paso.texto}</b>
            {paso.total ? (
              <span className="im-barra" aria-hidden="true">
                <i style={{ transform: `scaleX(${pct / 100})` }} />
              </span>
            ) : null}
            <span className="im-paso__pie">
              <span>{paso.total ? `${paso.hechos} de ${paso.total} pasos hechos` : 'Tu roadmap'}</span>
              <span className="im-paso__ver">Ver roadmap</span>
            </span>
          </Link>
        </section>
      ) : null}

      {chat ? (
        <section className="im-hoy__bloque">
          <h2 className="im-hoy__etq">Tu chat con ATV</h2>
          {!chat.no_leidos || !chat.ultimo ? (
            <Link to={`/mensajes?c=${chat.id}`} className="im-chat-ult im-chat-ult--vacio">Sin mensajes nuevos</Link>
          ) : (
          <Link to={`/mensajes?c=${chat.id}`} className="im-chat-ult">
            <span className="im-chat-ult__av" aria-hidden="true">{iniciales(chat.ultimo.autor_nombre || 'ATV')}</span>
            <span className="im-chat-ult__tx">
              <span className="im-chat-ult__cab">
                <b>{(chat.ultimo.autor_nombre || 'ATV').split(' ')[0]}</b>
                <small>{chat.ultimo.creado_en ? haceCuanto(chat.ultimo.creado_en) : ''}</small>
              </span>
              <span className="im-chat-ult__msj">{chat.ultimo.texto || '📎 Archivo'}</span>
            </span>
            <span className="im-chat-ult__nuevos">{chat.no_leidos}</span>
          </Link>
          )}
        </section>
      ) : null}

      {clase ? (
        <section className="im-hoy__bloque">
          <h2 className="im-hoy__etq">{clase.empezada ? 'Seguí donde quedaste' : 'Empezá por acá'}</h2>
          <Link to={`/classroom/${clase.programa_id}?clase=${clase.clase_id}`} className="im-seguir">
            <span className="im-seguir__play" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            </span>
            <span className="im-seguir__tx">
              <small>
                {clase.modulo} · Clase {clase.numero} de {clase.total}
              </small>
              <b>{tituloLindo(clase.titulo)}</b>
              <span className="im-barra" aria-hidden="true">
                <i style={{ transform: `scaleX(${clase.porcentaje / 100})` }} />
              </span>
            </span>
          </Link>
        </section>
      ) : null}

      {sops || avance != null ? (
        <div className="im-accesos">
          {sops ? (
            <Link to="/classroom?vista=sops" className="im-acceso">
              <small>Biblioteca de SOPs</small>
              <b>{sops}</b>
              <span>Ver estantes ›</span>
            </Link>
          ) : null}
          {avance != null ? (
            <Link to="/classroom" className="im-acceso">
              <small>Tu avance en el material</small>
              <b>{avance}%</b>
              <span>Ver módulos ›</span>
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

// Abajo de todo: cuánto del programa pasó y cuántos días quedan.
export function Programa() {
  const [c, setC] = useState(null)
  useEffect(() => {
    fetchCuenta().then(setC).catch(() => null)
  }, [])
  if (!c || c.tipo !== 'cliente' || c.dias_restantes == null) return null
  const total = c.duracion_dias || 0
  const pasado = total ? Math.min(1, Math.max(0, (total - c.dias_restantes) / total)) : 0
  return (
    <div className="im-programa">
      <span>{c.plan_nombre ? `Programa ${c.plan_nombre}` : 'Programa'}</span>
      {total ? (
        <span className="im-barra is-oscura" aria-hidden="true">
          <i style={{ transform: `scaleX(${pasado})` }} />
        </span>
      ) : (
        <span className="im-programa__esp" />
      )}
      <span>{c.dias_restantes > 0 ? `${c.dias_restantes} ${c.dias_restantes === 1 ? 'día' : 'días'}` : 'Vencido'}</span>
    </div>
  )
}
