import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchMiRoadmap, fetchRoadmap, marcarPaso } from '../api/roadmap'
import AppHeader from '../components/AppHeader'
import { useAuth } from '../context/AuthContext'
import '../styles/frentes.css'
import '../styles/classroom-rediseno.css'
import '../styles/roadmap-rediseno.css'
import { getUserInitials } from '../utils/user'

// El roadmap del cliente como una ruta, en el lenguaje de Material (papel, vidrio, números grandes y la
// línea como progreso):
//   1. "Tu próximo paso": el primer paso pendiente del cliente en el roadmap a seguir, enorme, con "Listo".
//   2. "Tu mapa": un camino vertical que zigzaguea, con un punto por roadmap (un color por coach, un anillo
//      que se llena con el avance). Tocar un punto abre su cartel ahí mismo con los pasos, en dos columnas:
//      "Lo hacés vos" y "Lo hace ATV". Filtro por coach y "Ocultar reemplazados".
// Los datos y las acciones son los mismos de siempre: fetchMiRoadmap / fetchRoadmap y marcarPaso.

// Un color por coach, en el orden en que entraron (los mismos del tablero anterior).
const COLORES = ['#4f7fd8', '#2e9d6e', '#d8a43a', '#9a6fd6', '#d8644f', '#3aa7b5']
const fechaCorta = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }).replace('.', '')
const fechaLarga = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
const nombreDoc = (d) => (d.versiones > 1 ? `${d.titulo} · v${d.version}` : d.titulo)
const primerNombre = (n = '') => n.split(' ')[0]

function Cara({ coach, size = 28 }) {
  return coach.foto_url ? (
    <img className="rr-cara" src={coach.foto_url} alt="" width={size} height={size} referrerPolicy="no-referrer" />
  ) : (
    <span className="rr-cara rr-cara--ini" style={{ width: size, height: size }} aria-hidden="true">
      {getUserInitials(coach.nombre)}
    </span>
  )
}

function Tilde({ hecho }) {
  return (
    <span className={`rr-tilde${hecho ? ' is-hecho' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" /></svg>
    </span>
  )
}

// Una columna: los pasos de quien los hace, numerados como el índice de Material, sin caja alrededor.
function Columna({ titulo, pasos, numeros, coach, enviando, alTildar }) {
  if (!pasos.length) return null
  const hechos = pasos.filter((p) => p.hecho).length
  return (
    <section className="rr-columna" aria-label={titulo}>
      <h3>
        {titulo} <span className="num">{hechos} de {pasos.length}</span>
      </h3>
      <ol className="rr-pasos">
        {pasos.map((p) => (
          <li key={p.id}>
            <label className={`rr-paso${p.hecho ? ' is-hecho' : ''}`} title={p.hecho && p.hecho_por?.nombre ? `Lo tildó ${p.hecho_por.nombre}` : undefined}>
              <input type="checkbox" checked={p.hecho} disabled={enviando === p.id} onChange={() => alTildar(p)} />
              <span className="rr-paso__num num">{String(numeros[p.id]).padStart(2, '0')}</span>
              <span className="rr-paso__texto">
                {p.texto}
                {p.quien === 'atv' ? <small>Lo hace {coach} · se tilda cuando esté</small> : null}
              </span>
              <Tilde hecho={p.hecho} />
            </label>
          </li>
        ))}
      </ol>
    </section>
  )
}

// El mapa: un camino que baja zigzagueando, con un punto por roadmap (del primero al que hay que seguir).
// Cada punto es un anillo que se llena con su avance, del color de su coach, con su cartel al costado.
// Tocar un punto abre su cartel ahí mismo, a lo ancho, con los pasos adentro: el detalle está donde
// tocaste. El tramo recorrido es sólido; después del que hay que seguir, punteado hacia la próxima llamada.
// Es vertical: en el celular entra entero, sin scroll de costado.
function Mapa({ recorrido, doc, principal, colores, coaches, filtro, setFiltro, coachFiltro, setCoachFiltro, alElegir, total, vigentes, children }) {
  const lista = useRef(null)
  const puntos = useRef(new Map())
  const [camino, setCamino] = useState(null) // { ancho, alto, hecho, falta }
  const enOrden = [...recorrido].reverse() // del primero al último
  const iAhora = enOrden.findIndex((d) => d.id === principal?.id)
  // El trazado depende de qué puntos hay, no del arreglo (que se arma de nuevo en cada render): si no,
  // medir → guardar → render → medir sería un bucle.
  const ids = enOrden.map((d) => d.id).join(',')
  const orden = useRef(enOrden)
  orden.current = enOrden

  // El camino se dibuja uniendo los centros de los puntos con curvas; se vuelve a medir cuando algo
  // cambia de tamaño (un cartel que se abre, la pantalla que gira).
  const trazar = useCallback(() => {
    const caja = lista.current?.getBoundingClientRect()
    if (!caja || !ids) {
      setCamino(null)
      return
    }
    const centros = orden.current
      .map((d) => puntos.current.get(d.id))
      .filter(Boolean)
      .map((el) => {
        const r = el.getBoundingClientRect()
        return { x: r.left + r.width / 2 - caja.left, y: r.top + r.height / 2 - caja.top }
      })
    if (!centros.length) {
      setCamino(null)
      return
    }
    const tramo = (desde, hasta) => {
      let d = `M ${desde[0].x} ${desde[0].y}`
      for (let i = 1; i < desde.length; i++) {
        const a = desde[i - 1]
        const b = desde[i]
        // Curvas en S: salen y llegan en vertical, con un mínimo de recorrido, para que se lea como un camino.
        const medio = Math.max((b.y - a.y) * 0.6, 70)
        d += ` C ${a.x} ${a.y + medio}, ${b.x} ${b.y - medio}, ${b.x} ${b.y}`
      }
      return hasta ? `${d} ${hasta}` : d
    }
    const corte = iAhora >= 0 ? iAhora : centros.length - 1
    const ultimo = centros[centros.length - 1]
    // Después del último punto, el camino sigue punteado hasta el cartel de la próxima llamada.
    const fin = { x: caja.width / 2, y: caja.height - 18 }
    const cola = ` C ${ultimo.x} ${ultimo.y + 70}, ${fin.x} ${fin.y - 70}, ${fin.x} ${fin.y}`
    const nuevo = {
      ancho: Math.round(caja.width),
      alto: Math.round(caja.height),
      hecho: tramo(centros.slice(0, corte + 1)),
      falta: tramo(centros.slice(corte), cola),
    }
    // Solo se guarda si cambió: así medir no dispara otro render sin fin.
    setCamino((viejo) => (viejo && JSON.stringify(viejo) === JSON.stringify(nuevo) ? viejo : nuevo))
  }, [ids, iAhora])

  useLayoutEffect(() => {
    trazar()
  }, [trazar, doc?.id])

  useEffect(() => {
    const el = lista.current
    if (!el) return undefined
    const observador = new ResizeObserver(() => trazar())
    observador.observe(el)
    return () => observador.disconnect()
  }, [trazar])

  return (
    <section className="rr-mapa" aria-label="Tu mapa">
      <header className="rr-mapa__cab">
        <div>
          <h2>Tu mapa</h2>
          <p>Cada punto es un roadmap. Tocalo para abrirlo y ver sus pasos.</p>
        </div>
        <div className="rr-mapa__leyenda" role="group" aria-label="Filtrar el mapa">
          {coaches.length > 1
            ? coaches.map((c, i) => (
                <button
                  key={c.id ?? 'atv'}
                  type="button"
                  className={coachFiltro === c.id ? 'is-on' : ''}
                  aria-pressed={coachFiltro === c.id}
                  onClick={() => setCoachFiltro(coachFiltro === c.id ? null : c.id)}
                  style={{ '--color': colores[i] }}
                >
                  <i aria-hidden="true" />
                  {primerNombre(c.nombre)}
                </button>
              ))
            : null}
          {total > vigentes ? (
            <button type="button" className={filtro === 'vigente' ? 'is-on' : ''} aria-pressed={filtro === 'vigente'} onClick={() => setFiltro(filtro === 'vigente' ? 'todo' : 'vigente')}>
              Ocultar reemplazados
            </button>
          ) : null}
        </div>
      </header>

      <div className="rr-mapa__terreno">
        {camino ? (
          <svg className="rr-camino" width={camino.ancho} height={camino.alto} viewBox={`0 0 ${camino.ancho} ${camino.alto}`} aria-hidden="true">
            <path className="rr-camino__fondo" d={camino.falta} />
            <path className="rr-camino__falta" d={camino.falta} />
            <path className="rr-camino__fondo" d={camino.hecho} />
            <path className="rr-camino__hecho" d={camino.hecho} />
          </svg>
        ) : null}

        <ol className="rr-puntos" ref={lista}>
          {enOrden.map((d, i) => {
            const c = coaches.findIndex((x) => x.id === d.coach.id)
            const pct = d.pasos_total ? (d.paso_actual || 0) / d.pasos_total : 0
            const abierto = d.id === doc?.id
            const ahora = d.id === principal?.id
            return (
              <li
                key={d.id}
                className={`rr-lugar${i % 2 ? ' is-derecha' : ' is-izquierda'}${abierto ? ' is-abierto' : ''}${ahora ? ' is-ahora' : ''}${d.estado === 'reemplazado' ? ' is-viejo' : ''}`}
                style={{ '--color': colores[c] || '#8a867f', '--avance': pct }}
              >
                <button
                  type="button"
                  className="rr-lugar__boton"
                  onClick={() => alElegir(ahora ? null : d.id)}
                  aria-expanded={abierto}
                  aria-label={`${nombreDoc(d)} con ${primerNombre(d.coach.nombre)}, ${fechaLarga(d.fecha)}${d.pasos_total ? `, ${d.paso_actual || 0} de ${d.pasos_total} pasos` : ''}`}
                >
                  <span className="rr-lugar__punto" ref={(el) => (el ? puntos.current.set(d.id, el) : puntos.current.delete(d.id))} aria-hidden="true">
                    <span className="num">{d.pasos_total ? Math.round(pct * 100) : ''}</span>
                  </span>
                  <span className="rr-lugar__cartel">
                    <span className="rr-lugar__arriba">
                      {i === 0 ? 'Empezaste' : ahora ? 'Estás acá' : fechaCorta(d.fecha)}
                    </span>
                    <b>{nombreDoc(d)}</b>
                    <span className="rr-lugar__meta">
                      <Cara coach={d.coach} size={18} />
                      {primerNombre(d.coach.nombre)}
                      {d.estado === 'reemplazado' ? ' · reemplazado' : d.pasos_total ? <span className="num"> · {d.paso_actual || 0} de {d.pasos_total}</span> : null}
                    </span>
                  </span>
                </button>
                {abierto ? <div className="rr-lugar__abierto">{children}</div> : null}
              </li>
            )
          })}
        </ol>

        {enOrden.length ? (
          <p className="rr-mapa__proximo">
            <span aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></svg>
            </span>
            Tu próxima llamada suma el siguiente roadmap
          </p>
        ) : null}
      </div>

      {!recorrido.length ? <p className="rr-detalle__sin">No hay roadmaps con ese filtro.</p> : null}
    </section>
  )
}

export default function RoadmapPage() {
  const { isEquipo } = useAuth()
  const [params] = useSearchParams()
  const clienteId = Number(params.get('cliente')) || null
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('todo') // 'todo' | 'vigente'
  const [coachFiltro, setCoachFiltro] = useState(null)
  const [elegido, setElegido] = useState(null) // id del documento que muestran los carriles; null = el principal
  const [plegado, setPlegado] = useState(false) // tocar el punto que ya está abierto lo cierra
  const [enviando, setEnviando] = useState(null)

  useEffect(() => {
    if (isEquipo && !clienteId) {
      setError('Este link muestra el roadmap del cliente que lo abre. Abrilo desde el chat del cliente para ver el suyo.')
      return
    }
    const pedir = isEquipo && clienteId ? fetchRoadmap(clienteId) : fetchMiRoadmap()
    pedir.then(setDatos).catch((e) => setError(e.message || 'No se pudo cargar el roadmap.'))
  }, [isEquipo, clienteId])

  // Todos los documentos con su coach, del más nuevo al más viejo.
  const todos = useMemo(() => {
    if (!datos) return []
    return datos.grupos
      .flatMap((g) => g.docs.map((d) => ({ ...d, coach: g.coach })))
      .sort((a, b) => (a.fecha === b.fecha ? b.id - a.id : a.fecha < b.fecha ? 1 : -1))
  }, [datos])

  const principal = useMemo(() => (datos?.principal ? todos.find((d) => d.id === datos.principal.id) || null : null), [datos, todos])
  const doc = (elegido && todos.find((d) => d.id === elegido)) || principal
  const recorrido = todos.filter((d) => (filtro === 'todo' || d.estado === 'vigente') && (coachFiltro == null || d.coach.id === coachFiltro))

  async function tildar(p, documento = doc) {
    setEnviando(p.id)
    try {
      setDatos(await marcarPaso(documento.id, p.id, !p.hecho))
    } catch (e) {
      setError(e.message || 'No se pudo guardar el paso.')
    } finally {
      setEnviando(null)
    }
  }

  if (error) {
    return (
      <div className="app-shell im-root cr-root rr-root">
        <AppHeader />
        <p className="rr-vacio">{error}</p>
      </div>
    )
  }
  if (!datos) {
    return (
      <div className="app-shell im-root cr-root rr-root">
        <AppHeader />
        <p className="rr-vacio">Cargando el roadmap…</p>
      </div>
    )
  }

  const pasosPrincipal = principal?.pasos || []
  const proximo = pasosPrincipal.find((p) => p.quien !== 'atv' && !p.hecho) || null
  const pendientesAtv = pasosPrincipal.filter((p) => p.quien === 'atv' && !p.hecho).length
  const pasos = doc?.pasos || []
  const numeros = Object.fromEntries(pasos.map((p, i) => [p.id, i + 1]))
  const coaches = datos.grupos.map((g) => g.coach)
  const colores = coaches.map((_, i) => COLORES[i % COLORES.length])

  return (
    <div className="app-shell im-root cr-root rr-root">
      <AppHeader />
      <main className="rr">
        <header className="rr-cab">
          <h1>{isEquipo ? `Roadmap de ${primerNombre(datos.cliente?.nombre) || 'cliente'}` : 'Tu roadmap'}</h1>
          <p>
            <span className="num">{datos.vigentes}</span> {datos.vigentes === 1 ? 'vigente' : 'vigentes'} ·{' '}
            <span className="num">{datos.total}</span> {datos.total === 1 ? 'documento' : 'documentos'}
            {coaches.length ? ` · con ${coaches.map((c) => primerNombre(c.nombre)).join(', ')}` : ''}
          </p>
        </header>

        {!todos.length ? (
          <div className="rr-vacio-caja">
            <img className="marca-foto-vacio" src="/marca/fotos/escaladores-nieve.webp" alt="" />
            <b>Todavía no hay nada en tu roadmap</b>
            <span>Después de cada llamada, tu coach suma acá los próximos pasos.</span>
          </div>
        ) : (
          <>
            {/* 1. Tu próximo paso */}
            {principal ? (
              <section className="rr-ahora" aria-label="Tu próximo paso">
                <div className="rr-ahora__texto">
                  <small>
                    {proximo ? 'Tu próximo paso' : pasosPrincipal.length ? 'Hiciste todo lo tuyo' : 'El roadmap a seguir'}
                  </small>
                  <h2>
                    {proximo
                      ? proximo.texto
                      : pasosPrincipal.length
                        ? pendientesAtv
                          ? `Falta lo de ATV: ${pendientesAtv} ${pendientesAtv === 1 ? 'paso' : 'pasos'}`
                          : 'Roadmap completo'
                        : nombreDoc(principal)}
                  </h2>
                  <p className="rr-ahora__de">
                    <Cara coach={principal.coach} size={22} />
                    {nombreDoc(principal)} con <span className="rr-firma">{primerNombre(principal.coach.nombre)}</span> · {fechaLarga(principal.fecha)}
                  </p>
                </div>
                <div className="rr-ahora__acciones">
                  {proximo ? (
                    <button type="button" className="rr-listo" onClick={() => tildar(proximo, principal)} disabled={enviando === proximo.id}>
                      <Tilde hecho={false} />
                      {enviando === proximo.id ? 'Guardando…' : 'Listo'}
                    </button>
                  ) : null}
                  {principal.fathom_url ? (
                    <a className="rr-boton" href={principal.fathom_url} target="_blank" rel="noopener noreferrer">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
                      Ver la llamada
                    </a>
                  ) : null}
                  {principal.url ? (
                    <a className="rr-boton" href={principal.url} target="_blank" rel="noopener noreferrer">Abrir documento</a>
                  ) : null}
                </div>
                {principal.pasos_total ? (
                  <span className="rr-ahora__avance" role="progressbar" aria-valuemin={0} aria-valuemax={principal.pasos_total} aria-valuenow={principal.paso_actual || 0} aria-label="Avance del roadmap a seguir">
                    <i style={{ transform: `scaleX(${(principal.paso_actual || 0) / principal.pasos_total})` }} />
                  </span>
                ) : null}
              </section>
            ) : null}

            {/* 2. Tu mapa: un camino con un punto por roadmap; el elegido se abre ahí mismo con sus pasos */}
            <Mapa
              recorrido={recorrido}
              doc={plegado ? null : doc}
              principal={principal}
              colores={colores}
              coaches={coaches}
              filtro={filtro}
              setFiltro={setFiltro}
              coachFiltro={coachFiltro}
              setCoachFiltro={setCoachFiltro}
              alElegir={(id) => {
                // El punto que ya está abierto se cierra; cualquier otro (o el mismo, si estaba cerrado) se abre.
                if (!plegado && (id ?? principal?.id) === doc?.id) {
                  setPlegado(true)
                  return
                }
                setPlegado(false)
                setElegido(id)
              }}
              total={datos.total}
              vigentes={datos.vigentes}
            >
              {doc ? (
                <article className="rr-detalle__cuerpo" key={doc.id}>
                  <header className="rr-detalle__cab">
                    <div>
                      <h2>{nombreDoc(doc)}</h2>
                      <p>
                        {doc.tipo_nombre} con {primerNombre(doc.coach.nombre)} · {fechaLarga(doc.fecha)}
                        {doc.estado === 'reemplazado' ? ' · reemplazado por uno más nuevo' : doc.id === principal?.id ? ' · el que tenés que seguir' : ''}
                      </p>
                    </div>
                    <div className="rr-detalle__links">
                      {doc.id !== principal?.id && doc.fathom_url ? <a className="rr-enlace" href={doc.fathom_url} target="_blank" rel="noopener noreferrer">Ver la llamada</a> : null}
                      {doc.id !== principal?.id && doc.url && pasos.length ? <a className="rr-enlace" href={doc.url} target="_blank" rel="noopener noreferrer">Abrir documento</a> : null}
                      {doc.id !== principal?.id && principal ? (
                        <button type="button" className="rr-enlace is-fuerte" onClick={() => setElegido(null)}>Volver al actual</button>
                      ) : null}
                    </div>
                  </header>
                  {pasos.length ? (
                    <div className="rr-columnas">
                      <Columna titulo="Lo hacés vos" pasos={pasos.filter((p) => p.quien !== 'atv')} numeros={numeros} coach={primerNombre(doc.coach.nombre)} enviando={enviando} alTildar={(p) => tildar(p)} />
                      <Columna titulo="Lo hace ATV" pasos={pasos.filter((p) => p.quien === 'atv')} numeros={numeros} coach={primerNombre(doc.coach.nombre)} enviando={enviando} alTildar={(p) => tildar(p)} />
                    </div>
                  ) : (
                    <p className="rr-detalle__sin">
                      Este roadmap está en un documento aparte.{' '}
                      {doc.url ? <a href={doc.url} target="_blank" rel="noopener noreferrer">Abrilo acá</a> : null}
                    </p>
                  )}
                </article>
              ) : null}
            </Mapa>
          </>
        )}
      </main>
    </div>
  )
}
