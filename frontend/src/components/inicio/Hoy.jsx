import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { request } from '../../api/client'
import { fetchCuenta } from '../../api/cuenta'
import { fetchMiRoadmap } from '../../api/roadmap'
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
export function Hoy() {
  const [roadmap, setRoadmap] = useState(undefined)
  const [clase, setClase] = useState(undefined)

  useEffect(() => {
    fetchMiRoadmap().then(setRoadmap).catch(() => setRoadmap(null))
    request('/api/programas/continuar').then(setClase).catch(() => setClase(null))
  }, [])

  const paso = proximoPaso(roadmap)
  if (!paso && !clase) return null
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
