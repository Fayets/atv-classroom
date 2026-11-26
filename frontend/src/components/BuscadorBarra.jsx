import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchSopsClassroom } from '../api/client'
import { tituloLindo } from '../utils/frentes'

// El buscador de la barra lateral: funciona solo (no lleva al Inicio). Al tocarlo se abre un panel con
// sugerencias y, a medida que escribís, filtra secciones, módulos, SOPs y (equipo) carpetas: con "S" ya aparece
// "SOPs". Flechas para moverse, Enter para ir, Esc para cerrar. Ctrl K / ⌘K lo abre desde cualquier pantalla.

// Palabras con las que también se encuentra cada sección ("procesos" → SOPs, "perfil" → Mi cuenta).
const SINONIMOS = {
  '/': 'inicio home guia preguntar trabando',
  '/classroom': 'material clases modulos cursos videos classroom',
  '/classroom?vista=sops': 'sops sop procesos plantillas documentos biblioteca',
  '/roadmap': 'roadmap plan pasos hoja de ruta proximo paso',
  '/tools': 'tools herramientas ia',
  '/mensajes': 'mensajes chat coach equipo canales',
  '/mensajes?v=directos': 'mensajes directos dm privados',
  '/cuenta': 'mi cuenta perfil configuracion foto dispositivos notificaciones plan',
  '/consultas': 'consultas cerebro preguntas clientes',
}

const normal = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// Los SOPs se piden una vez, la primera vez que se abre el buscador.
let sopsCache = null
function useSops(activo) {
  const [sops, setSops] = useState(() => (Array.isArray(sopsCache) ? sopsCache : null))
  useEffect(() => {
    if (!activo || Array.isArray(sopsCache)) return undefined
    if (!sopsCache) {
      sopsCache = fetchSopsClassroom()
        .then((d) => (sopsCache = (Array.isArray(d) ? d : []).flatMap((m) => m.sops.map((s) => ({ ...s, modulo: m.modulo, programa_id: m.programa_id })))))
        .catch(() => (sopsCache = null))
    }
    let vivo = true
    Promise.resolve(sopsCache).then((d) => vivo && Array.isArray(d) && setSops(d))
    return () => {
      vivo = false
    }
  }, [activo])
  return sops
}

// Qué tan bien coincide: empieza igual > alguna palabra empieza igual > lo contiene > solo por sinónimo.
function puntaje(q, texto, extra = '') {
  const t = normal(texto)
  if (t.startsWith(q)) return 4
  if (t.split(/[\s›·/-]+/).some((p) => p.startsWith(q))) return 3
  if (t.includes(q)) return 2
  if (q.split(/\s+/).every((p) => normal(extra).includes(p))) return 1
  return 0
}

export default function BuscadorBarra({ secciones, modulos, carpetas = [], atajo, Icono, riel, abrirExterno }) {
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [pos, setPos] = useState(null)
  const boton = useRef(null)
  const campo = useRef(null)
  const sops = useSops(abierto)

  function abrir() {
    const r = boton.current?.getBoundingClientRect()
    if (r) setPos({ top: r.top, left: r.left, ancho: Math.max(r.width, 360) })
    setQ('')
    setSel(0)
    setAbierto(true)
  }
  const cerrar = () => setAbierto(false)

  // Ctrl K / ⌘K (y el pedido de otras pantallas, si lo hubiera).
  useEffect(() => {
    const tecla = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        abrir()
      }
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [])
  useEffect(() => {
    if (abrirExterno) abrir()
  }, [abrirExterno])
  useEffect(() => {
    if (abierto) setTimeout(() => campo.current?.focus(), 0)
  }, [abierto])

  // Todo lo que se puede buscar, con su tipo y a dónde lleva.
  const todo = useMemo(() => {
    const items = secciones.map((s) => ({ tipo: 'Secciones', label: s.label, sub: null, ir: s.to, extra: SINONIMOS[s.to] || '', icono: s.icono }))
    for (const m of modulos || []) {
      if (m.bloqueado || !m.total_clases) continue
      const pct = Math.round(m.porcentaje_progreso ?? 0)
      items.push({ tipo: 'Módulos', label: m.titulo, sub: `${m.total_clases} clases · ${pct}%`, ir: `/classroom/${m.id}`, extra: 'modulo', icono: 'material' })
    }
    for (const s of sops || []) {
      items.push({
        tipo: 'SOPs',
        label: tituloLindo(s.titulo),
        sub: `${s.modulo}${s.seccion ? ` › ${tituloLindo(s.seccion)}` : ''}`,
        ir: `/classroom/${s.programa_id}?clase=${s.clase_id}`,
        extra: `sop ${s.modulo} ${s.seccion || ''}`,
        icono: 'sop',
      })
    }
    for (const c of carpetas) items.push({ tipo: 'Carpetas', label: c.label, sub: null, accion: c.abrir, extra: 'carpeta', icono: 'carpeta' })
    return items
  }, [secciones, modulos, sops, carpetas])

  // Sin texto: sugerencias fijas (SOPs primero, después seguir el módulo en curso y las secciones).
  const resultados = useMemo(() => {
    const t = normal(q)
    if (!t) {
      const enCurso = (modulos || []).find((m) => !m.bloqueado && m.total_clases && (m.porcentaje_progreso ?? 0) > 0 && m.porcentaje_progreso < 100)
      const base = todo.filter((i) => i.tipo === 'Secciones')
      const sopsSec = base.find((i) => i.ir === '/classroom?vista=sops')
      return [
        ...(sopsSec ? [{ ...sopsSec, tipo: 'Sugerencias' }] : []),
        ...(enCurso ? [{ tipo: 'Sugerencias', label: `Seguí con ${enCurso.titulo}`, sub: `${enCurso.porcentaje_progreso}% hecho`, ir: `/classroom/${enCurso.id}`, icono: 'material' }] : []),
        ...base.filter((i) => i !== sopsSec).slice(0, 5).map((i) => ({ ...i, tipo: 'Sugerencias' })),
      ]
    }
    const mejores = todo
      .map((i) => ({ ...i, p: puntaje(t, `${i.label} ${i.sub || ''}`, `${i.label} ${i.extra}`) }))
      .filter((i) => i.p > 0)
      .sort((a, b) => b.p - a.p || (a.tipo === 'Secciones' ? -1 : b.tipo === 'Secciones' ? 1 : 0))
      .slice(0, 9)
    // Agrupados por tipo (cada título una sola vez), en el orden en que aparece el mejor de cada tipo.
    const tipos = [...new Set(mejores.map((i) => i.tipo))]
    return tipos.flatMap((tipo) => mejores.filter((i) => i.tipo === tipo))
  }, [q, todo, modulos])

  useEffect(() => setSel(0), [q])

  function elegir(item) {
    if (!item) return
    cerrar()
    if (item.accion) item.accion()
    else navigate(item.ir)
  }

  function teclas(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(resultados.length - 1, s + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(0, s - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      elegir(resultados[sel])
    } else if (e.key === 'Escape') {
      cerrar()
    }
  }

  let grupoPrevio = null
  return (
    <>
      <button type="button" ref={boton} className="sb-buscar" onClick={abrir} title={riel ? 'Buscar' : undefined} aria-haspopup="dialog" aria-expanded={abierto}>
        <Icono n="buscar" />
        <span>Buscar</span>
        <kbd title="Atajo de teclado para abrir el buscador">{atajo}</kbd>
      </button>
      {abierto && pos
        ? createPortal(
            <>
              <div className="bq-fondo" onClick={cerrar} aria-hidden="true" />
              <div
                className="bq-panel"
                role="dialog"
                aria-label="Buscar"
                style={{ top: pos.top, left: pos.left, width: `min(${pos.ancho}px, calc(100vw - ${pos.left + 12}px))` }}
              >
                <div className="bq-campo">
                  <Icono n="buscar" />
                  <input
                    ref={campo}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={teclas}
                    placeholder="Buscá una sección, un módulo o un SOP"
                    aria-label="Buscar"
                    aria-controls="bq-lista"
                    aria-activedescendant={resultados[sel] ? `bq-${sel}` : undefined}
                    autoComplete="off"
                    spellCheck="false"
                  />
                  <kbd>Esc</kbd>
                </div>
                <ul id="bq-lista" className="bq-lista" role="listbox">
                  {resultados.length ? (
                    resultados.map((item, i) => {
                      const cabecera = item.tipo !== grupoPrevio ? item.tipo : null
                      grupoPrevio = item.tipo
                      return (
                        <li key={`${item.tipo}-${item.label}-${i}`} role="presentation">
                          {cabecera ? <p className="bq-grupo">{cabecera}</p> : null}
                          <button
                            type="button"
                            id={`bq-${i}`}
                            role="option"
                            aria-selected={i === sel}
                            className={`bq-item${i === sel ? ' is-sel' : ''}`}
                            onMouseEnter={() => setSel(i)}
                            onClick={() => elegir(item)}
                          >
                            <span className="bq-item__ico"><Icono n={item.icono || 'buscar'} /></span>
                            <span className="bq-item__txt">
                              <b>{item.label}</b>
                              {item.sub ? <small>{item.sub}</small> : null}
                            </span>
                            <span className="bq-item__ir" aria-hidden="true">↵</span>
                          </button>
                        </li>
                      )
                    })
                  ) : (
                    <li className="bq-vacio">No encontramos nada con «{q}». Probá con otra palabra.</li>
                  )}
                </ul>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  )
}
