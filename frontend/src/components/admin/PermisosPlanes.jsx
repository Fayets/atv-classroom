import { useEffect, useMemo, useState } from 'react'
import { bloquearVideo, fetchAdminPrograma, fetchAdminProgramas, fetchPermisos, guardarPermisos } from '../../api/admin'
import { guardarCupos } from '../../api/equipo'
import '../../styles/permisos.css'

// Pantalla Permisos del admin: qué parte del classroom ve cada plan (la maqueta C) y, desde "Elegir por
// clase", el video de cada clase por plan (la maqueta A). El equipo de ATV ve todo siempre.

const SUB = {
  clases: 'Los módulos y sus videos',
  sops: 'Documentos, planillas y plantillas de cada clase',
  roadmaps: 'Su plan de trabajo armado desde las llamadas',
  chat: 'Su canal privado con el equipo',
  comunidad: 'Canales #general, #wins, anuncios del plan',
  ia: 'La guía que responde y lleva a la clase o SOP',
}
const GRUPOS = [
  ['Contenido', ['clases', 'sops', 'roadmaps']],
  ['Acompañamiento', ['chat', 'comunidad', 'ia']],
]
const NOTA = { '1a1': 'solo pedir 1 a 1' }

function Interruptor({ valor, valores, onChange, etiqueta }) {
  const siguiente = valores[(valores.indexOf(valor) + 1) % valores.length]
  return (
    <button
      type="button"
      className={`pm-switch is-${valor}`}
      role="switch"
      aria-checked={valor !== 'no'}
      aria-label={etiqueta}
      onClick={() => onChange(siguiente)}
    >
      <span />
    </button>
  )
}

function General({ datos, onCambiar, cambios, onClases }) {
  const planes = datos.planes
  const valorDe = (clave, plan) => cambios[`${plan}|${clave}`] ?? datos.permisos.find((p) => p.clave === clave).por_plan[plan]
  return (
    <div className="pm-tabla" role="table">
      <div className="pm-fila pm-cabeza" role="row">
        <span role="columnheader">Qué ve</span>
        {planes.map((p) => <span key={p.id} role="columnheader">{p.nombre}</span>)}
      </div>
      {GRUPOS.map(([grupo, claves]) => (
        <div key={grupo} role="rowgroup">
          <div className="pm-grupo">{grupo}</div>
          {claves.map((clave) => {
            const permiso = datos.permisos.find((p) => p.clave === clave)
            return (
              <div key={clave} className="pm-fila" role="row">
                <div className="pm-que">
                  <b>{permiso.nombre}</b>
                  <small>{SUB[clave]}</small>
                  {clave === 'clases' ? <button type="button" className="pm-link" onClick={onClases}>Elegir por clase ›</button> : null}
                </div>
                {planes.map((p) => {
                  const v = valorDe(clave, p.id)
                  return (
                    <div key={p.id} className="pm-celda" role="cell">
                      <Interruptor valor={v} valores={permiso.valores} etiqueta={`${permiso.nombre} · ${p.nombre}`} onChange={(nv) => onCambiar(`${p.id}|${clave}`, nv)} />
                      {NOTA[v] ? <small className="pm-nota">{NOTA[v]}</small> : null}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      ))}
      <div className="pm-grupo">Cuenta</div>
      <div className="pm-fila" role="row">
        <div className="pm-que">
          <b>Equipo del cliente</b>
          <small>Setters y closers que entran con su cuenta</small>
        </div>
        {planes.map((p) => {
          const clave = `${p.id}|equipo`
          const v = cambios[clave] ?? datos.equipo[p.id]
          return (
            <div key={p.id} className="pm-celda" role="cell">
              <input
                className="pm-cupo"
                type="number"
                min="0"
                max="100"
                value={v}
                aria-label={`Cupo de equipo · ${p.nombre}`}
                onChange={(e) => onCambiar(clave, Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              />
              <small className="pm-nota">{Number(v) === 0 ? 'sin equipo' : 'personas'}</small>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Detalle de Clases: filas = clases del módulo, columnas = planes; tildado = ve el video.
function PorClase({ planes, onVolver }) {
  const [modulos, setModulos] = useState([])
  const [moduloId, setModuloId] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [bloqueos, setBloqueos] = useState({}) // claseId → [planes bloqueados], solo lo que cambió
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchAdminProgramas().then((l) => {
      setModulos(l)
      setModuloId((id) => id ?? l[0]?.id ?? null)
    }).catch((e) => setError(e.message))
  }, [])
  useEffect(() => {
    if (!moduloId) return
    setDetalle(null)
    fetchAdminPrograma(moduloId).then(setDetalle).catch((e) => setError(e.message))
  }, [moduloId])

  const clases = useMemo(() => (detalle?.secciones || []).flatMap((s) => s.clases), [detalle])
  const bloqueadoPara = (c) => bloqueos[c.id] ?? c.video_bloqueado_para ?? []
  const ve = (c, plan) => !bloqueadoPara(c).includes(plan)
  const poner = (lista, plan, ver) => {
    setBloqueos((b) => {
      const nuevo = { ...b }
      for (const c of lista) {
        const actual = new Set(b[c.id] ?? c.video_bloqueado_para ?? [])
        if (ver) actual.delete(plan)
        else actual.add(plan)
        nuevo[c.id] = planes.map((p) => p.id).filter((id) => actual.has(id))
      }
      return nuevo
    })
  }
  const todoA = (lista, soloPlanes) => {
    setBloqueos((b) => {
      const nuevo = { ...b }
      for (const c of lista) nuevo[c.id] = planes.map((p) => p.id).filter((id) => !soloPlanes.includes(id))
      return nuevo
    })
  }
  const cambiadas = Object.keys(bloqueos).filter((id) => {
    const c = clases.find((x) => String(x.id) === id)
    return c && bloqueos[id].join() !== (c.video_bloqueado_para || []).join()
  })

  async function guardar() {
    setGuardando(true)
    setError('')
    try {
      for (const id of cambiadas) await bloquearVideo(id, bloqueos[id])
      setDetalle(await fetchAdminPrograma(moduloId))
      setBloqueos({})
      setModulos(await fetchAdminProgramas())
    } catch (e) {
      setError(e.message || 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  const marca = (lista, plan) => {
    const n = lista.filter((c) => ve(c, plan)).length
    return n === lista.length ? 'si' : n === 0 ? 'no' : 'medio'
  }
  const Casilla = ({ estado, onClick, etiqueta }) => (
    <button type="button" className={`pm-check is-${estado}`} aria-label={etiqueta} aria-pressed={estado === 'si'} onClick={onClick}>
      {estado === 'si' ? '✓' : estado === 'medio' ? '–' : ''}
    </button>
  )

  return (
    <div className="pm-clases">
      <aside className="pm-modulos">
        <button type="button" className="pm-link pm-volver" onClick={onVolver}>‹ Permisos generales</button>
        {modulos.map((m) => (
          <button key={m.id} type="button" className={`pm-modulo${m.id === moduloId ? ' is-on' : ''}`} onClick={() => setModuloId(m.id)}>
            {m.titulo}
          </button>
        ))}
      </aside>
      <section className="pm-panel">
        <div className="pm-panel__cabeza">
          <div>
            <b>{detalle?.titulo || '…'}</b>
            <small>Tildado = ve el video · los SOPs los ven todos</small>
          </div>
          <div className="pm-atajos">
            <button type="button" className="pm-atajo" onClick={() => todoA(clases, ['2k'])}>Todo el módulo: solo 2K</button>
            <button type="button" className="pm-atajo" onClick={() => todoA(clases, planes.map((p) => p.id))}>Todo el módulo: todos</button>
          </div>
        </div>
        <div className="pm-tabla pm-tabla--clases" role="table">
          <div className="pm-fila pm-cabeza" role="row">
            <span role="columnheader">Clase</span>
            {planes.map((p) => <span key={p.id} role="columnheader">{p.nombre}</span>)}
          </div>
          {(detalle?.secciones || []).map((s) => (
            <div key={s.id} role="rowgroup">
              <div className="pm-fila pm-seccion" role="row">
                <span>{s.titulo}</span>
                {planes.map((p) => {
                  const est = marca(s.clases, p.id)
                  return (
                    <div key={p.id} className="pm-celda" role="cell">
                      <Casilla estado={est} etiqueta={`${s.titulo} · ${p.nombre}`} onClick={() => poner(s.clases, p.id, est !== 'si')} />
                    </div>
                  )
                })}
              </div>
              {s.clases.map((c) => (
                <div key={c.id} className="pm-fila" role="row">
                  <span className="pm-clase">{c.titulo}</span>
                  {planes.map((p) => (
                    <div key={p.id} className="pm-celda" role="cell">
                      <Casilla estado={ve(c, p.id) ? 'si' : 'no'} etiqueta={`${c.titulo} · ${p.nombre}`} onClick={() => poner([c], p.id, !ve(c, p.id))} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
        {error ? <p className="pm-error" role="alert">{error}</p> : null}
        <div className="pm-pie">
          <span>{cambiadas.length ? <><b>{cambiadas.length} {cambiadas.length === 1 ? 'clase cambiada' : 'clases cambiadas'}</b> sin guardar</> : 'Sin cambios'}</span>
          <button type="button" className="pm-guardar" disabled={!cambiadas.length || guardando} onClick={guardar}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </section>
    </div>
  )
}

export default function PermisosPlanes() {
  const [datos, setDatos] = useState(null)
  const [cambios, setCambios] = useState({})
  const [vista, setVista] = useState('general')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchPermisos().then(setDatos).catch((e) => setError(e.message))
  }, [])

  const pendientes = Object.keys(cambios).length
  async function guardar() {
    setGuardando(true)
    setError('')
    try {
      const permisos = []
      const cupos = {}
      for (const [k, v] of Object.entries(cambios)) {
        const [plan, clave] = k.split('|')
        if (clave === 'equipo') cupos[datos.plan_cupo[plan]] = Number(v)
        else permisos.push({ plan, clave, valor: v })
      }
      if (Object.keys(cupos).length) await guardarCupos(cupos)
      setDatos(await guardarPermisos(permisos))
      setCambios({})
    } catch (e) {
      setError(e.message || 'No se pudieron guardar los permisos.')
    } finally {
      setGuardando(false)
    }
  }

  if (!datos) return <p className="pm-cargando">{error || 'Cargando permisos…'}</p>
  if (vista === 'clases') return <PorClase planes={datos.planes} onVolver={() => setVista('general')} />
  return (
    <section className="pm-panel">
      <General datos={datos} cambios={cambios} onCambiar={(k, v) => setCambios((c) => ({ ...c, [k]: v }))} onClases={() => setVista('clases')} />
      {error ? <p className="pm-error" role="alert">{error}</p> : null}
      <div className="pm-pie">
        <span>{pendientes ? <><b>{pendientes} {pendientes === 1 ? 'cambio' : 'cambios'}</b> sin guardar</> : 'Valen al instante para todos los clientes de ese plan. El equipo de ATV ve todo.'}</span>
        <button type="button" className="pm-guardar" disabled={!pendientes || guardando} onClick={guardar}>
          {guardando ? 'Guardando…' : 'Guardar permisos'}
        </button>
      </div>
    </section>
  )
}
