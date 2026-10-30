import { useEffect, useMemo, useRef, useState } from 'react'
import { request } from '../../api/client'

// El contexto del cliente para el que agarra la próxima 1 a 1 (el "pase de guardia"): se abre a un clic
// desde el panel del chat. En 10 segundos: dónde está, qué le falta entregar, qué le debemos y qué se trabó.
// Arriba lo pendiente (Trabado y los tres paneles); abajo el historial en el tablero tipo Miro, un post-it
// por mes que se despliega en sus eventos. Lo arma el backend con el chat, el onboarding, Fathom y los roadmaps.
const fetchContexto = (clienteId) => request(`/api/contexto/clientes/${clienteId}`)
const cerrarCompromiso = (clienteId, clave, cerrado) =>
  request('/api/contexto/compromisos/cierre', { method: 'POST', body: JSON.stringify({ cliente_id: clienteId, clave, cerrado }) })

const ETAPA = { arrancando: 'Arrancando', validando: 'Validando', vendiendo: 'Vendiendo', escalando: 'Escalando' }
const TIPO = { llamada: '1 a 1', roadmap: 'Roadmap', alta: 'Ingreso', logro: 'Logro', objecion: 'Objeción', compromiso: 'Compromiso', silencio: 'Silencio', entrega: 'Entregó', migracion: 'Migración' }
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const FILTROS = [
  ['todo', 'Todo', () => true],
  ['llamada', 'Llamadas', (e) => e.tipo === 'llamada'],
  ['logro', 'Logros', (e) => e.tipo === 'logro'],
  ['objecion', 'Objeciones', (e) => e.tipo === 'objecion'],
  ['compromiso', 'Compromisos', (e) => e.tipo === 'compromiso'],
]
const fecha = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '')
const diasDesde = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : null)
const hoyIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
const corto = (t, n = 110) => {
  const limpio = (t || '').split(/[:(]/)[0].trim() || t || ''
  return limpio.length > n ? `${limpio.slice(0, n - 1).trimEnd()}…` : limpio
}
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`
const FUENTE = { chat: 'el chat', llamada: 'una llamada', wins: '#wins' }
// De dónde sale un logro u objeción cuando no es solo del chat: "en #wins", "chat y #wins"…
const deDonde = (e) => {
  const f = (e.fuente || []).filter((x) => FUENTE[x])
  if (!f.length || (f.length === 1 && f[0] === 'chat')) return ''
  return f.length === 1 ? ` · en ${FUENTE[f[0]]}` : ` · ${f.map((x) => (x === 'chat' ? 'chat' : x === 'llamada' ? 'llamada' : '#wins')).join(' y ')}`
}

// Un compromiso con su origen, su plazo y el botón para darlo por cumplido (los del roadmap se tildan allá).
function Compromiso({ c, alCambiar }) {
  const cerrado = c.estado === 'cerrado'
  return (
    <li className={`ctx-cp is-${c.estado}`}>
      <div>
        <span>{corto(c.texto, 170)}</span>
        <small>
          {c.origen} · {fecha(c.desde)}
          {c.plazo ? (c.estado === 'vencido' ? ` · vencía el ${fecha(c.plazo)}` : ` · vence el ${fecha(c.plazo)}`) : ''}
          {cerrado && c.cerrado_por ? ` · cerrado por ${c.cerrado_por}` : ''}
        </small>
      </div>
      {c.cerrable ? (
        <button type="button" className="ctx-cp__boton" onClick={() => alCambiar(c, !cerrado)}>
          {cerrado ? 'Deshacer' : 'Cumplido'}
        </button>
      ) : null}
    </li>
  )
}

function Panel({ titulo, items, vacio, alCambiar, children }) {
  const [todas, setTodas] = useState(false)
  const visibles = todas ? items : items.slice(0, 5)
  const abiertos = items.filter((c) => c.estado !== 'cerrado').length
  return (
    <section className="ctx-panel">
      <p className="ctx-eti">
        {titulo}
        {items.length ? <span className="ctx-eti__n">{abiertos}</span> : null}
      </p>
      {items.length ? (
        <ul className="ctx-cps">
          {visibles.map((c) => (
            <Compromiso key={c.clave} c={c} alCambiar={alCambiar} />
          ))}
        </ul>
      ) : (
        <p className="ctx-panel__vacio">{vacio}</p>
      )}
      {items.length > 5 ? (
        <button type="button" className="ctx-mas" onClick={() => setTodas((t) => !t)}>
          {todas ? 'Ver menos' : `Ver los ${items.length}`}
        </button>
      ) : null}
      {children}
    </section>
  )
}

// Lo que se ve en el post-it de un evento: corto, para leer de un vistazo.
function resumen(e) {
  if (e.tipo === 'llamada') return e.resumida ? e.temas.slice(0, 3) : ['Todavía sin resumir']
  if (e.tipo === 'alta' || e.tipo === 'entrega') return (e.items || []).slice(0, 2)
  return []
}

function Tarjeta({ e, activa, alElegir, cliente }) {
  return (
    <li className={`ctx-paso is-${e.tipo}${e.riesgo ? ' is-riesgo' : ''}`}>
      <span className="ctx-paso__fecha">{fecha(e.fecha)}</span>
      <span className="ctx-paso__punto" aria-hidden="true" />
      <button type="button" className={`ctx-tarjeta${activa ? ' is-activa' : ''}`} onClick={alElegir} aria-pressed={activa}>
        <span className="ctx-tarjeta__tipo">
          {e.tipo === 'compromiso' ? `Compromiso de ${e.lado === 'atv' ? 'ATV' : cliente}` : TIPO[e.tipo]}
          {e.tipo === 'llamada' && e.duracion ? ` · ${e.duracion} min` : ''}
          {e.tipo === 'logro' || e.tipo === 'objecion' ? deDonde(e) : ''}
        </span>
        <b>{corto(e.titulo, 120)}</b>
        {e.tipo === 'roadmap' ? (
          <span className="ctx-avance">
            <i>
              <b style={{ transform: `scaleX(${e.total ? e.hechos / e.total : 0})` }} />
            </i>
            <small>
              {e.hechos}/{e.total}
            </small>
          </span>
        ) : e.tipo === 'compromiso' ? (
          <span className={`ctx-estado is-${e.estado}`}>
            {e.estado === 'vencido' ? `Vencía el ${fecha(e.plazo)}` : e.estado === 'cerrado' ? 'Cumplido' : e.plazo ? `Vence el ${fecha(e.plazo)}` : 'Abierto'}
          </span>
        ) : e.tipo === 'silencio' ? (
          <span className={`ctx-estado is-${e.estado}`}>{e.estado === 'abierto' ? 'Sigue sin escribir' : 'Volvió a escribir'}</span>
        ) : (
          <ul>
            {resumen(e).map((t, i) => (
              <li key={i}>{corto(t, 90)}</li>
            ))}
          </ul>
        )}
        {e.tipo === 'llamada' && e.coordinacion ? <small className="ctx-tarjeta__menor">{plural(e.coordinacion, 'mensaje', 'mensajes')} para coordinarla</small> : null}
      </button>
    </li>
  )
}

// El detalle del post-it elegido: todo lo que se habló, con las citas.
function Detalle({ e, cliente }) {
  return (
    <div className={`ctx-detalle is-${e.tipo}`}>
      <h4>
        {fecha(e.fecha)} · {e.tipo === 'compromiso' ? `Compromiso de ${e.lado === 'atv' ? 'ATV' : cliente}: ` : ''}
        {e.titulo}
        {e.tipo === 'llamada' && e.url ? (
          <a href={e.url} target="_blank" rel="noopener noreferrer">
            Grabación ↗
          </a>
        ) : null}
      </h4>
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
      {e.cita?.length ? (
        <ul className="ctx-hechos">
          {e.cita.map((c, i) => (
            <li key={i}>
              <q>{c}</q>
            </li>
          ))}
        </ul>
      ) : null}
      {e.tipo === 'roadmap' ? (
        <p className="ctx-detalle__texto">
          {e.quien ? `Lo armó ${e.quien}` : 'Roadmap'}
          {e.area ? ` · ${e.area}` : ''} · {e.hechos} de {e.total} pasos hechos
        </p>
      ) : null}
      {(e.tipo === 'alta' || e.tipo === 'entrega') && e.items?.length ? (
        <ul className="ctx-hechos">
          {e.items.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      ) : null}
      {e.fuente?.length > 1 ? <p className="ctx-detalle__texto">Lo contó en {e.fuente.filter((x) => FUENTE[x]).map((x) => FUENTE[x]).join(' y ')}.</p> : null}
    </div>
  )
}

function porMes(eventos) {
  const meses = new Map()
  eventos.forEach((e) => {
    const clave = e.fecha.slice(0, 7)
    if (!meses.has(clave)) meses.set(clave, [])
    meses.get(clave).push(e)
  })
  return [...meses.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
}

// El post-it del mes: sus números y el último logro. Tocarlo despliega sus eventos sobre la línea.
function Mes({ clave, todos, abierto, alTocar }) {
  const [anio, mes] = clave.split('-')
  const cuenta = (t) => todos.filter((e) => e.tipo === t).length
  const logros = todos.filter((e) => e.tipo === 'logro')
  const pendientes = todos.filter((e) => e.tipo === 'compromiso' && e.estado !== 'cerrado').length
  const silencio = todos.filter((e) => e.tipo === 'silencio').reduce((n, e) => Math.max(n, e.dias || 0), 0)
  return (
    <li className={`ctx-paso is-mes${abierto ? ' is-abierto' : ''}`}>
      <span className="ctx-paso__fecha">
        {MESES[Number(mes) - 1]} {anio}
      </span>
      <span className="ctx-paso__punto" aria-hidden="true" />
      <button type="button" className="ctx-tarjeta ctx-mes" onClick={alTocar} aria-expanded={abierto}>
        <span className="ctx-mes__nombre">
          {MESES[Number(mes) - 1]}
          <small>{abierto ? 'Juntar' : `Ver ${todos.length}`}</small>
        </span>
        <span className="ctx-mes__cifras">
          {cuenta('llamada') ? <span>{plural(cuenta('llamada'), 'llamada', 'llamadas')}</span> : null}
          {logros.length ? <span className="is-verde">{plural(logros.length, 'logro', 'logros')}</span> : null}
          {cuenta('objecion') ? <span>{plural(cuenta('objecion'), 'objeción', 'objeciones')}</span> : null}
          {pendientes ? <span className="is-rojo">{plural(pendientes, 'pendiente', 'pendientes')}</span> : null}
          {silencio ? <span>{silencio} días sin señales</span> : null}
        </span>
        {logros.length ? <span className="ctx-mes__logro">Último logro: {corto(logros[0].titulo, 90)}</span> : null}
      </button>
    </li>
  )
}

// El tablero: se arrastra con el mouse o se mueve con la rueda. Mueve el scroll nativo (nada de estado
// por cuadro), así va a la misma frecuencia que la pantalla.
function Tablero({ meses, todosPorMes, abiertos, alTocarMes, elegido, alElegir, cliente }) {
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
  }, [meses])

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

  const siNoMovio = (fn) => () => {
    if (!movio.current) fn()
  }

  return (
    <div ref={lienzo} className="ctx-tablero" onPointerDown={arrastrar}>
      <ol className="ctx-linea">
        {meses.map(([clave, eventos]) => (
          <MesConEventos
            key={clave}
            clave={clave}
            eventos={eventos}
            todos={todosPorMes.get(clave) || eventos}
            abierto={abiertos.has(clave)}
            alTocar={siNoMovio(() => alTocarMes(clave))}
            elegido={elegido}
            alElegir={(id) => siNoMovio(() => alElegir(elegido === id ? null : id))()}
            cliente={cliente}
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

function MesConEventos({ clave, eventos, todos, abierto, alTocar, elegido, alElegir, cliente }) {
  return (
    <>
      <Mes clave={clave} todos={todos} abierto={abierto} alTocar={alTocar} />
      {abierto
        ? [...eventos].reverse().map((e) => <Tarjeta key={e.id} e={e} activa={elegido === e.id} alElegir={() => alElegir(e.id)} cliente={cliente} />)
        : null}
    </>
  )
}

const MESES_CIERRE = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export default function ContextoCliente({ clienteId, abierto, alCerrar }) {
  const [datos, setDatos] = useState(null)
  const [compromisos, setCompromisos] = useState([])
  const [error, setError] = useState('')
  const [visible, setVisible] = useState(false)
  const [montado, setMontado] = useState(abierto)
  const [elegido, setElegido] = useState(null)
  const [filtro, setFiltro] = useState('todo')
  const [mesesAbiertos, setMesesAbiertos] = useState(() => new Set())
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
    setMesesAbiertos(new Set())
    fetchContexto(clienteId)
      .then((d) => {
        setDatos(d)
        setCompromisos(d.compromisos || [])
      })
      .catch((e) => setError(e.message || 'No se pudo armar el contexto.'))
  }, [abierto, clienteId])

  useEffect(() => {
    if (!abierto) return undefined
    const tecla = (e) => e.key === 'Escape' && alCerrar()
    window.addEventListener('keydown', tecla)
    hoja.current?.focus()
    return () => window.removeEventListener('keydown', tecla)
  }, [abierto, alCerrar])

  // Los eventos de compromiso siguen el estado que se cambia acá con "Cumplido".
  const eventos = useMemo(() => {
    if (!datos) return []
    const estado = new Map(compromisos.map((c) => [`cp:${c.clave}`, c.estado]))
    return datos.eventos.map((e) => (estado.has(e.id) ? { ...e, estado: estado.get(e.id) } : e))
  }, [datos, compromisos])
  const todosPorMes = useMemo(() => new Map(porMes(eventos)), [eventos])
  const meses = useMemo(() => {
    const pasa = FILTROS.find((f) => f[0] === filtro)?.[2] || (() => true)
    return porMes(eventos.filter(pasa))
  }, [eventos, filtro])

  async function cambiar(c, cerrado) {
    const antes = compromisos
    const hoy = hoyIso()
    const estado = cerrado ? 'cerrado' : c.plazo && c.plazo < hoy ? 'vencido' : 'abierto'
    setCompromisos((lista) => lista.map((x) => (x.clave === c.clave ? { ...x, estado, cerrado_por: cerrado ? 'vos' : null } : x)))
    try {
      const r = await cerrarCompromiso(clienteId, c.clave, cerrado)
      setCompromisos((lista) => lista.map((x) => (x.clave === c.clave ? { ...x, cerrado_por: r.cerrado_por } : x)))
    } catch (e) {
      setCompromisos(antes)
      setError(e.message || 'No se pudo guardar.')
    }
  }

  if (!montado) return null
  const c = datos?.cliente
  const dias = diasDesde(c?.desde)
  const nombre = (c?.nombre || 'Cliente').split(' ')[0]
  // Lo que ya estaba cerrado al abrir no vuelve arriba; lo que se cierra ahora queda tachado para deshacer.
  const delPanel = compromisos.filter((x) => x.en_panel)
  const trabado = delPanel.filter((x) => x.estado === 'vencido')
  const deAtv = delPanel.filter((x) => x.lado === 'atv')
  const deCliente = delPanel.filter((x) => x.lado !== 'atv')
  const elegidoEv = elegido ? eventos.find((e) => e.id === elegido) : null
  const ultimoMsj = diasDesde(c?.ultimo_mensaje)

  return (
    <div className={`ctx${visible ? ' is-visible' : ''}`}>
      <section ref={hoja} className="ctx-hoja" role="dialog" aria-label="Contexto del cliente" tabIndex={-1}>
        <header className="ctx-cabeza">
          <div className="ctx-cabeza__quien">
            <h2>{c?.nombre || 'Cargando…'}</h2>
            {datos ? (
              <div className="ctx-chips is-columna">
                {c.plan ? <span>{c.plan.charAt(0).toUpperCase() + c.plan.slice(1)}</span> : null}
                {c.vence ? <span>Vence {fecha(c.vence)}</span> : null}
                {dias != null ? <span>{dias} días en ATV</span> : null}
                {c.perfil?.etapa ? <span className="is-verde">{ETAPA[c.perfil.etapa] || c.perfil.etapa}</span> : null}
              </div>
            ) : null}
          </div>
          {datos ? (
            c.negocio ? (
              <div className="ctx-negocio">
                {['oferta', 'avatar'].map((k) => (
                  <div key={k}>
                    <p className="ctx-eti">{k === 'oferta' ? 'Oferta' : 'Avatar'}</p>
                    <p title={c.negocio[k]}>{c.negocio[k] || '—'}</p>
                    {c.negocio[`${k}_periodo`] ? <small>Del cierre de {MESES_CIERRE[Number(c.negocio[`${k}_periodo`].slice(5)) - 1]}</small> : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="ctx-negocio is-vacio"><p>Todavía no completó un cierre de mes: sin oferta ni avatar cargados.</p></div>
            )
          ) : null}
          <button type="button" className="ctx-cerrar" onClick={alCerrar} aria-label="Cerrar">
            ×
          </button>
        </header>

        <div className="ctx-cuerpo">
          {error ? <p className="ctx-vacio">{error}</p> : null}
          {!datos && !error ? <p className="ctx-vacio">Armando el contexto… (si tiene una llamada nueva, la resume ahora)</p> : null}

          {datos ? (
            <>
              {datos.alertas.length ? (
                <div className="ctx-franja" role="alert">
                  {datos.alertas.map((a, i) => (
                    <div key={i}>
                      <b>{a.texto}</b>
                      {a.cita ? <q>{a.cita}</q> : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {trabado.length ? (
                <section className="ctx-trabado">
                  <p className="ctx-eti">
                    Trabado <span className="ctx-eti__n">{trabado.length}</span>
                  </p>
                  <ul className="ctx-cps">
                    {trabado.map((x) => (
                      <Compromiso key={x.clave} c={{ ...x, origen: `${x.lado === 'atv' ? 'Debe ATV' : `Debe ${nombre}`} · ${x.origen}` }} alCambiar={cambiar} />
                    ))}
                  </ul>
                </section>
              ) : null}

              <div className="ctx-contexto">
                <section className="ctx-panel">
                  <p className="ctx-eti">Quién es</p>
                  {c.perfil?.que_vende || c.perfil?.nicho_texto ? <p className="ctx-quien">{c.perfil.que_vende || c.perfil.nicho_texto}</p> : null}
                  {c.perfil?.objetivo ? <p className="ctx-quien is-suave">Quiere: {c.perfil.objetivo}</p> : null}
                  <dl className="ctx-datos">
                    <dt>Roadmap</dt>
                    <dd>{datos.roadmap ? `${datos.roadmap.titulo} · ${datos.roadmap.hechos}/${datos.roadmap.total}` : 'Sin roadmap cargado'}</dd>
                    <dt>Última llamada</dt>
                    <dd>
                      {c.ultima_llamada
                        ? `${fecha(c.ultima_llamada.fecha)} con ${c.ultima_llamada.quien}${c.ultima_llamada.duracion ? ` · ${c.ultima_llamada.duracion} min` : ''}`
                        : 'Ninguna en Fathom'}
                    </dd>
                    <dt>Último mensaje</dt>
                    <dd>{ultimoMsj == null ? 'Sin mensajes' : ultimoMsj === 0 ? 'Hoy' : `Hace ${plural(ultimoMsj, 'día', 'días')}`}</dd>
                    {c.atendieron.length ? (
                      <>
                        <dt>Lo atendieron</dt>
                        <dd>{c.atendieron.join(', ')}</dd>
                      </>
                    ) : null}
                    {c.perfil?.tono_cliente ? (
                      <>
                        <dt>Cómo es</dt>
                        <dd>{c.perfil.tono_cliente}</dd>
                      </>
                    ) : null}
                  </dl>
                </section>
                <Panel titulo="Lo que le debe ATV" items={deAtv} vacio="Nada pendiente de nuestro lado." alCambiar={cambiar} />
                <Panel titulo="Lo que quedó de su lado" items={deCliente} vacio="Nada pendiente de su lado." alCambiar={cambiar}>
                  {datos.no_repetir.length ? (
                    <div className="ctx-norepetir">
                      <p className="ctx-eti">No repetir: no le funcionó</p>
                      <ul className="ctx-hechos">
                        {datos.no_repetir.map((x, i) => (
                          <li key={i}>{corto(x.texto, 160)}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </Panel>
              </div>

              <div className="ctx-historial">
                <p className="ctx-eti">Historial</p>
                <div className="ctx-filtros" role="tablist" aria-label="Qué mostrar en el tablero">
                  {FILTROS.map(([id, nombreFiltro, pasa]) => {
                    const n = eventos.filter(pasa).length
                    if (!n) return null
                    return (
                      <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={filtro === id}
                        className={filtro === id ? 'is-on' : ''}
                        onClick={() => {
                          setFiltro(id)
                          setElegido(null)
                        }}
                      >
                        {nombreFiltro}
                        <small>{n}</small>
                      </button>
                    )
                  })}
                </div>
              </div>
              {meses.length ? (
                <Tablero
                  meses={meses}
                  todosPorMes={todosPorMes}
                  abiertos={mesesAbiertos}
                  alTocarMes={(m) =>
                    setMesesAbiertos((s) => {
                      const n = new Set(s)
                      if (n.has(m)) n.delete(m)
                      else n.add(m)
                      return n
                    })
                  }
                  elegido={elegido}
                  alElegir={setElegido}
                  cliente={nombre}
                />
              ) : (
                <p className="ctx-vacio">Todavía no hay historia: el cerebro la arma con el chat, el onboarding y las llamadas.</p>
              )}
              {elegidoEv ? <Detalle e={elegidoEv} cliente={nombre} /> : null}
            </>
          ) : null}
        </div>
      </section>
    </div>
  )
}
