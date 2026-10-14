import { useEffect, useMemo, useRef, useState } from 'react'
import { request } from '../../api/client'

// El contexto del cliente para el que agarra la próxima 1 a 1 (el "pase de guardia"): se abre a un clic
// desde el panel del chat. Arriba, un tablero tipo Miro con el timeline en horizontal (de lo más viejo a
// lo más nuevo, arranca mostrando lo último); abajo, todo el contexto: lo que no puede faltar, lo que
// le debe ATV y lo que quedó de su lado. Lo arma el backend con el chat, el onboarding, Fathom y los roadmaps.
const fetchContexto = (clienteId) => request(`/api/contexto/clientes/${clienteId}`)

const ETAPA = { arrancando: 'Arrancando', validando: 'Validando', vendiendo: 'Vendiendo', escalando: 'Escalando' }
const TIPO = { llamada: '1 a 1', roadmap: 'Roadmap', alta: 'Ingreso', cliente: 'Cliente', equipo: 'Equipo', riesgo: 'Alerta' }
const fecha = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '')
const diasDesde = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : null)
const corto = (t, n = 110) => {
  const limpio = (t || '').split(/[:(]/)[0].trim() || t || ''
  return limpio.length > n ? `${limpio.slice(0, n - 1).trimEnd()}…` : limpio
}
const claseDe = (e) => (e.tipo === 'chat' ? (e.riesgo ? 'riesgo' : e.de === 'cliente' ? 'cliente' : 'equipo') : e.tipo)

function Lista({ titulo, items, tono }) {
  const [todas, setTodas] = useState(false)
  if (!items.length) return null
  const visibles = todas ? items : items.slice(0, 4)
  return (
    <section className="ctx-lista">
      <p className="ctx-eti">{titulo}</p>
      <ul className={`ctx-grupo is-${tono}`}>
        {visibles.map((x, i) => (
          <li key={i}>
            <i aria-hidden="true" />
            <div>
              <span>{corto(x.texto, 160)}</span>
              {x.fuente ? <small>{x.fuente} · {fecha(x.desde)}</small> : null}
            </div>
          </li>
        ))}
      </ul>
      {items.length > 4 ? (
        <button type="button" className="ctx-mas" onClick={() => setTodas((t) => !t)}>
          {todas ? 'Ver menos' : `Ver los ${items.length}`}
        </button>
      ) : null}
    </section>
  )
}

// Lo que se ve en la tarjeta del tablero: corto, para leer de un vistazo.
function resumen(e) {
  if (e.tipo === 'llamada') return e.resumida ? e.temas.slice(0, 3) : ['Todavía sin resumir']
  if (e.tipo === 'chat') return e.items.slice(0, 2).map((h) => h.texto)
  if (e.tipo === 'alta') return (e.items || []).slice(0, 2)
  return []
}

function Tarjeta({ e, activa, alElegir }) {
  const clase = claseDe(e)
  return (
    <li className={`ctx-paso is-${clase}`}>
      <span className="ctx-paso__fecha">{fecha(e.fecha)}</span>
      <span className="ctx-paso__punto" aria-hidden="true" />
      <button type="button" className={`ctx-tarjeta${activa ? ' is-activa' : ''}`} onClick={alElegir} aria-pressed={activa}>
        <span className="ctx-tarjeta__tipo">
          {TIPO[clase]}
          {e.tipo === 'llamada' && e.duracion ? ` · ${e.duracion} min` : ''}
        </span>
        <b>{e.titulo}</b>
        {e.tipo === 'roadmap' ? (
          <span className="ctx-avance">
            <i>
              <b style={{ transform: `scaleX(${e.total ? e.hechos / e.total : 0})` }} />
            </i>
            <small>
              {e.hechos}/{e.total}
            </small>
          </span>
        ) : (
          <ul>
            {resumen(e).map((t, i) => (
              <li key={i}>{corto(t, 90)}</li>
            ))}
          </ul>
        )}
      </button>
    </li>
  )
}

// El detalle de la tarjeta elegida: todo lo que se habló, con las citas.
function Detalle({ e }) {
  return (
    <div className={`ctx-detalle is-${claseDe(e)}`}>
      <h4>
        {fecha(e.fecha)} · {e.titulo}
        {e.tipo === 'llamada' && e.url ? (
          <a href={e.url} target="_blank" rel="noopener noreferrer">
            Grabación ↗
          </a>
        ) : null}
      </h4>
      {e.tipo === 'chat' ? (
        <ul className="ctx-hechos">
          {e.items.map((h, i) => (
            <li key={i} className={`is-${h.tipo}`}>
              {/* "Se le recomendó" sobra cuando el que habla es del equipo: el texto ya lo dice. */}
              {e.de === 'equipo' && h.tipo === 'recomendacion' ? null : <b>{h.etiqueta}</b>} {h.texto}
              {h.cita ? <q>{h.cita}</q> : null}
            </li>
          ))}
          {e.mas ? <li className="ctx-hechos__mas">y {e.mas} más ese día</li> : null}
        </ul>
      ) : null}
      {e.tipo === 'llamada' ? (
        e.resumida ? (
          <div className="ctx-detalle__columnas">
            <div>
              <p className="ctx-sub">De qué se habló</p>
              <ul className="ctx-hechos">
                {e.temas.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
            {e.decisiones.length ? (
              <div>
                <p className="ctx-sub">Se decidió</p>
                <ul className="ctx-hechos">
                  {e.decisiones.map((d, i) => (
                    <li key={i}>
                      {d.texto}
                      <q>{d.cita}</q>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {e.inquietudes.length ? (
              <div>
                <p className="ctx-sub">Lo que le preocupa</p>
                <ul className="ctx-hechos">
                  {e.inquietudes.map((d, i) => (
                    <li key={i} className="is-objecion">
                      {d.texto}
                      <q>{d.cita}</q>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="ctx-vacio">Todavía sin resumir: se resume la próxima vez que abras el contexto.</p>
        )
      ) : null}
      {e.tipo === 'roadmap' ? (
        <p className="ctx-detalle__texto">
          {e.quien ? `Lo armó ${e.quien}` : 'Roadmap'}
          {e.area ? ` · ${e.area}` : ''} · {e.hechos} de {e.total} pasos hechos
        </p>
      ) : null}
      {e.tipo === 'alta' && e.items?.length ? (
        <ul className="ctx-hechos">
          {e.items.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

// El tablero: se arrastra con el mouse o se mueve con la rueda. Mueve el scroll nativo (nada de estado
// por cuadro), así va a la misma frecuencia que la pantalla.
function Tablero({ eventos, elegido, alElegir }) {
  const lienzo = useRef(null)
  const movio = useRef(false)

  useEffect(() => {
    const el = lienzo.current
    if (!el) return undefined
    el.scrollLeft = el.scrollWidth // arranca mostrando lo último
    const rueda = (ev) => {
      if (Math.abs(ev.deltaY) <= Math.abs(ev.deltaX)) return
      ev.preventDefault()
      el.scrollLeft += ev.deltaY
    }
    el.addEventListener('wheel', rueda, { passive: false })
    return () => el.removeEventListener('wheel', rueda)
  }, [eventos])

  function arrastrar(ev) {
    if (ev.button !== 0) return
    const el = lienzo.current
    const inicio = ev.clientX
    const desde = el.scrollLeft
    movio.current = false
    const mover = (m) => {
      const dx = m.clientX - inicio
      if (!movio.current && Math.abs(dx) < 4) return // un clic en una tarjeta no es un arrastre
      if (!movio.current) el.classList.add('is-moviendo')
      movio.current = true
      el.scrollLeft = desde - dx
    }
    const soltar = () => {
      el.classList.remove('is-moviendo')
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  return (
    <div ref={lienzo} className="ctx-tablero" onPointerDown={arrastrar}>
      <ol className="ctx-linea">
        {eventos.map((e, i) => (
          <Tarjeta
            key={`${e.tipo}-${e.fecha}-${i}`}
            e={e}
            activa={elegido === i}
            alElegir={() => {
              if (!movio.current) alElegir(elegido === i ? null : i)
            }}
          />
        ))}
        <li className="ctx-paso is-hoy" aria-hidden="true">
          <span className="ctx-paso__fecha">Hoy</span>
          <span className="ctx-paso__punto" />
        </li>
      </ol>
    </div>
  )
}

export default function ContextoCliente({ clienteId, abierto, alCerrar }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [visible, setVisible] = useState(false)
  const [montado, setMontado] = useState(abierto)
  const [elegido, setElegido] = useState(null)
  const hoja = useRef(null)

  useEffect(() => {
    if (!abierto) {
      // Se va con la misma animación y recién después se desarma.
      setVisible(false)
      const t = setTimeout(() => setMontado(false), 280)
      return () => clearTimeout(t)
    }
    setMontado(true)
    // Dos cuadros después de montarse, para que la animación arranque desde afuera.
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => setVisible(true))
    })
    return () => cancelAnimationFrame(id)
  }, [abierto])

  useEffect(() => {
    if (!abierto) return
    setError('')
    setElegido(null)
    fetchContexto(clienteId)
      .then(setDatos)
      .catch((e) => setError(e.message || 'No se pudo armar el contexto.'))
  }, [abierto, clienteId])

  useEffect(() => {
    if (!abierto) return undefined
    const tecla = (e) => e.key === 'Escape' && alCerrar()
    window.addEventListener('keydown', tecla)
    hoja.current?.focus()
    return () => window.removeEventListener('keydown', tecla)
  }, [abierto, alCerrar])

  // En el tablero se lee de izquierda a derecha: lo más viejo primero. Memo: si cambiara en cada render,
  // el tablero volvería a saltar al final cada vez que tocás una tarjeta.
  const eventos = useMemo(() => (datos ? [...datos.eventos].reverse() : []), [datos])

  if (!montado) return null
  const c = datos?.cliente
  const dias = diasDesde(c?.desde)

  return (
    <div className={`ctx${visible ? ' is-visible' : ''}`}>
      <section ref={hoja} className="ctx-hoja" role="dialog" aria-label="Contexto del cliente" tabIndex={-1}>
        <header className="ctx-cabeza">
          <div>
            <p className="ctx-eti">Contexto antes de tu llamada</p>
            <h2>{c?.nombre || 'Cargando…'}</h2>
            {datos ? (
              <div className="ctx-chips">
                {c.plan ? <span>{c.plan.charAt(0).toUpperCase() + c.plan.slice(1)}</span> : null}
                {dias != null ? <span>{dias} días en ATV</span> : null}
                {c.perfil?.etapa ? <span className="is-verde">{ETAPA[c.perfil.etapa] || c.perfil.etapa}</span> : null}
                {c.atendieron.length ? <span className="is-azul">Lo atendieron: {c.atendieron.join(', ')}</span> : null}
                {c.perfil?.tono_cliente ? <span>Cómo es: {c.perfil.tono_cliente}</span> : null}
              </div>
            ) : null}
          </div>
          <button type="button" className="ctx-cerrar" onClick={alCerrar} aria-label="Cerrar">
            ×
          </button>
        </header>

        <div className="ctx-cuerpo">
          {error ? <p className="ctx-vacio">{error}</p> : null}
          {!datos && !error ? <p className="ctx-vacio">Armando el contexto… (si tiene una llamada nueva, la resume ahora)</p> : null}

          {datos ? (
            <>
              {eventos.length ? (
                <Tablero eventos={eventos} elegido={elegido} alElegir={setElegido} />
              ) : (
                <p className="ctx-vacio">Todavía no hay historia: el cerebro la arma con el chat, el onboarding y las llamadas.</p>
              )}
              {elegido != null && eventos[elegido] ? (
                <Detalle e={eventos[elegido]} />
              ) : eventos.length ? (
                <p className="ctx-ayuda">Tocá una tarjeta para ver todo lo que se habló. Arrastrá el tablero para ir hacia atrás.</p>
              ) : null}

              <div className="ctx-contexto">
                <div className="ctx-col">
                  {c.perfil?.que_vende || c.perfil?.nicho_texto ? (
                    <section>
                      <p className="ctx-eti">Quién es</p>
                      <p className="ctx-quien">{c.perfil.que_vende || c.perfil.nicho_texto}</p>
                      {c.perfil.objetivo ? <p className="ctx-quien is-suave">Quiere: {c.perfil.objetivo}</p> : null}
                    </section>
                  ) : null}
                  {datos.alertas.length ? (
                    <section className="ctx-alertas">
                      <p className="ctx-eti">Lo que tenés que saber sí o sí</p>
                      {datos.alertas.map((a, i) => (
                        <div key={i} className={`ctx-alerta is-${a.nivel}`}>
                          <i aria-hidden="true">!</i>
                          <div>
                            <p>{a.texto}</p>
                            {a.cita ? <q>{a.cita}</q> : null}
                            <small>{a.fuente === 'llamada' ? 'En la última llamada' : `Chat · ${fecha(a.fecha)}`}</small>
                          </div>
                        </div>
                      ))}
                    </section>
                  ) : null}
                </div>
                <div className="ctx-col">
                  {datos.roadmap ? (
                    <section>
                      <p className="ctx-eti">Roadmap vigente</p>
                      <div className="ctx-avance is-grande">
                        <span>{datos.roadmap.titulo}</span>
                        <i>
                          <b style={{ transform: `scaleX(${datos.roadmap.total ? datos.roadmap.hechos / datos.roadmap.total : 0})` }} />
                        </i>
                        <small>
                          {datos.roadmap.hechos} de {datos.roadmap.total}
                        </small>
                      </div>
                    </section>
                  ) : null}
                  <Lista titulo="Lo que le debe ATV" items={datos.debe_atv} tono="atv" />
                </div>
                <div className="ctx-col">
                  <Lista titulo="Lo que quedó de su lado" items={datos.debe_cliente} tono="cliente" />
                  <Lista titulo="No repetir: no le funcionó" items={datos.no_repetir} tono="mal" />
                </div>
              </div>
              <p className="ctx-pie">Se arma solo con el chat, el onboarding, las llamadas de Fathom y los roadmaps.</p>
            </>
          ) : null}
        </div>
      </section>
    </div>
  )
}
