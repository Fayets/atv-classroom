import { useEffect, useRef, useState } from 'react'
import { request } from '../../api/client'

// El contexto del cliente para el que agarra la próxima 1 a 1 (el "pase de guardia"): se abre a un clic
// desde el panel del chat y cuenta qué pasó, de lo más nuevo a lo más viejo. El Miro dice qué hacer;
// esto dice cómo se llegó hasta acá. Lo arma el backend con el chat, el onboarding, Fathom y los roadmaps.
const fetchContexto = (clienteId) => request(`/api/contexto/clientes/${clienteId}`)

const ETAPA = { arrancando: 'Arrancando', validando: 'Validando', vendiendo: 'Vendiendo', escalando: 'Escalando' }
const fecha = (iso) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '')
const diasDesde = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : null)
const corto = (t, n = 110) => {
  const limpio = (t || '').split(/[:(]/)[0].trim() || t || ''
  return limpio.length > n ? `${limpio.slice(0, n - 1).trimEnd()}…` : limpio
}

function Lista({ titulo, items, vacio, tono }) {
  const [todas, setTodas] = useState(false)
  if (!items.length) return null
  const visibles = todas ? items : items.slice(0, 3)
  return (
    <div className="ctx-lista">
      <p className="ctx-eti">{titulo}</p>
      <ul className={`ctx-grupo is-${tono}`}>
        {visibles.map((x, i) => (
          <li key={i}>
            <i aria-hidden="true" />
            <div>
              <span>{corto(x.texto, 140)}</span>
              {x.fuente ? <small>{x.fuente} · {fecha(x.desde)}</small> : null}
            </div>
          </li>
        ))}
      </ul>
      {items.length > 3 ? (
        <button type="button" className="ctx-mas" onClick={() => setTodas((t) => !t)}>
          {todas ? 'Ver menos' : `Ver los ${items.length}`}
        </button>
      ) : null}
      {!items.length && vacio ? <p className="ctx-vacio">{vacio}</p> : null}
    </div>
  )
}

function Evento({ e }) {
  const clase = e.tipo === 'chat' ? (e.riesgo ? 'riesgo' : e.de === 'cliente' ? 'cliente' : 'equipo') : e.tipo
  return (
    <li className={`ctx-evento is-${clase}`}>
      <time>{fecha(e.fecha)}</time>
      <span className="ctx-punto" aria-hidden="true" />
      <div className="ctx-evento__cuerpo">
        <h4>
          {e.titulo}
          {e.tipo === 'llamada' && e.duracion ? <small>{e.duracion} min</small> : null}
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
            <div className="ctx-llamada">
              {e.temas.length ? (
                <ul className="ctx-hechos">
                  {e.temas.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              ) : null}
              {e.decisiones.length ? (
                <>
                  <p className="ctx-sub">Se decidió</p>
                  <ul className="ctx-hechos">
                    {e.decisiones.map((d, i) => (
                      <li key={i}>
                        {d.texto}
                        <q>{d.cita}</q>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {e.inquietudes.length ? (
                <>
                  <p className="ctx-sub">Lo que le preocupa</p>
                  <ul className="ctx-hechos">
                    {e.inquietudes.map((d, i) => (
                      <li key={i} className="is-objecion">
                        {d.texto}
                        <q>{d.cita}</q>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : (
            <p className="ctx-vacio">Todavía sin resumir: se resume la próxima vez que abras el contexto.</p>
          )
        ) : null}

        {e.tipo === 'roadmap' ? (
          <div className="ctx-avance">
            <span>
              {e.quien ? `${e.quien}${e.area ? ` · ${e.area}` : ''}` : e.area}
            </span>
            <i>
              <b style={{ transform: `scaleX(${e.total ? e.hechos / e.total : 0})` }} />
            </i>
            <small>
              {e.hechos} de {e.total}
            </small>
          </div>
        ) : null}

        {e.tipo === 'alta' && e.items?.length ? (
          <ul className="ctx-hechos">
            {e.items.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  )
}

export default function ContextoCliente({ clienteId, abierto, alCerrar }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [visible, setVisible] = useState(false)
  const [montado, setMontado] = useState(abierto)
  const hoja = useRef(null)

  useEffect(() => {
    if (!abierto) {
      // Se va deslizando y recién después se desarma.
      setVisible(false)
      const t = setTimeout(() => setMontado(false), 280)
      return () => clearTimeout(t)
    }
    setMontado(true)
    // Dos cuadros después de montarse, para que el deslizamiento arranque desde afuera.
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => setVisible(true))
    })
    return () => cancelAnimationFrame(id)
  }, [abierto])

  useEffect(() => {
    if (!abierto) return
    setError('')
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

  if (!montado) return null
  const c = datos?.cliente
  const dias = diasDesde(c?.desde)

  return (
    <div className={`ctx${visible ? ' is-visible' : ''}`}>
      <button type="button" className="ctx-velo" aria-label="Cerrar el contexto" onClick={alCerrar} />
      <aside ref={hoja} className="ctx-hoja" role="dialog" aria-label="Contexto del cliente" tabIndex={-1}>
        <header className="ctx-cabeza">
          <div>
            <p className="ctx-eti">Contexto antes de tu llamada</p>
            <h2>{c?.nombre || 'Cargando…'}</h2>
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
              <div className="ctx-chips">
                {c.plan ? <span>{c.plan.charAt(0).toUpperCase() + c.plan.slice(1)}</span> : null}
                {dias != null ? <span>{dias} días en ATV</span> : null}
                {c.perfil?.etapa ? <span className="is-verde">{ETAPA[c.perfil.etapa] || c.perfil.etapa}</span> : null}
                {c.atendieron.length ? <span className="is-azul">Lo atendieron: {c.atendieron.join(', ')}</span> : null}
              </div>
              {c.perfil?.que_vende || c.perfil?.nicho_texto ? <p className="ctx-quien">{c.perfil.que_vende || c.perfil.nicho_texto}</p> : null}
              {c.perfil?.tono_cliente ? <p className="ctx-tono">Cómo es: {c.perfil.tono_cliente}</p> : null}

              {datos.alertas.length ? (
                <div className="ctx-alertas">
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
                </div>
              ) : null}

              {datos.roadmap ? (
                <div className="ctx-avance is-grande">
                  <span>
                    Roadmap vigente: <b>{datos.roadmap.titulo}</b>
                  </span>
                  <i>
                    <b style={{ transform: `scaleX(${datos.roadmap.total ? datos.roadmap.hechos / datos.roadmap.total : 0})` }} />
                  </i>
                  <small>
                    {datos.roadmap.hechos} de {datos.roadmap.total}
                  </small>
                </div>
              ) : null}

              <div className="ctx-dos">
                <Lista titulo="Lo que le debe ATV" items={datos.debe_atv} tono="atv" />
                <Lista titulo="Lo que quedó de su lado" items={datos.debe_cliente} tono="cliente" />
              </div>
              {datos.no_repetir.length ? <Lista titulo="No repetir: no le funcionó" items={datos.no_repetir} tono="mal" /> : null}

              <p className="ctx-eti ctx-eti--timeline">Qué pasó</p>
              {datos.eventos.length ? (
                <ol className="ctx-timeline">
                  {datos.eventos.map((e, i) => (
                    <Evento key={`${e.tipo}-${e.fecha}-${i}`} e={e} />
                  ))}
                </ol>
              ) : (
                <p className="ctx-vacio">Todavía no hay historia: el cerebro la arma con el chat, el onboarding y las llamadas.</p>
              )}
              <p className="ctx-pie">Se arma solo con el chat, el onboarding, las llamadas de Fathom y los roadmaps.</p>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  )
}
