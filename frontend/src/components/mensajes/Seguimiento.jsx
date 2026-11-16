import { useEffect, useMemo, useState } from 'react'
import Avatar from './Avatar'
import {
  buscarClientesSeguimiento,
  cancelarEnvioSeguimiento,
  crearEnvioSeguimiento,
  fetchEnviosSeguimiento,
  fetchOpcionesSeguimiento,
} from '../../api/seguimiento'
import { colorPersona } from '../../utils/mensajes'

// #seguimiento (solo Mauri): recordar las clases a nombre de otra cuenta, a canales de la comunidad o al chat
// de cada cliente de las ofertas elegidas. Ya o a la hora que elija.
const PLANTILLAS = {
  recordatorio: '@everyone {nombre}! hoy tenemos clase en vivo 🔥\ntraé la duda que te esté frenando esta semana que la resolvemos ahí',
  falto: '{nombre}! te extrañamos en la clase 🙌\nla idea es destrabar justo lo que te está frenando. en la próxima sumate y traé tu duda',
}
const CUANDO = [
  { id: 'ahora', nombre: 'Ahora' },
  { id: 'hora', nombre: 'Elegir día y hora' },
]

function aLocal(fecha) {
  const d = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000)
  return d.toISOString().slice(0, 16)
}
const formato = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const ESTADOS = { pendiente: 'Programado', enviando: 'Saliendo', enviado: 'Enviado', cancelado: 'Cancelado', error: 'Falló' }

export default function Seguimiento({ onVolver }) {
  const [opciones, setOpciones] = useState(null)
  const [error, setError] = useState('')
  const [cuenta, setCuenta] = useState(null)
  const [donde, setDonde] = useState('chat')
  const [canales, setCanales] = useState([])
  const [ofertas, setOfertas] = useState([])
  const [sueltos, setSueltos] = useState([])
  const [buscar, setBuscar] = useState('')
  const [encontrados, setEncontrados] = useState([])
  const [texto, setTexto] = useState(PLANTILLAS.recordatorio)
  const [cuando, setCuando] = useState('ahora')
  const [hora, setHora] = useState(() => aLocal(new Date(Date.now() + 60 * 60000)))
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [envios, setEnvios] = useState([])

  const recargarEnvios = () => fetchEnviosSeguimiento().then(setEnvios).catch(() => null)
  useEffect(() => {
    fetchOpcionesSeguimiento()
      .then((o) => {
        setOpciones(o)
        setCuenta(o.cuentas.find((c) => c.nombre?.toLowerCase().startsWith('juan'))?.id || o.cuentas[0]?.id || null)
      })
      .catch((e) => setError(e.message || 'No se pudo cargar.'))
    recargarEnvios()
  }, [])

  useEffect(() => {
    const q = buscar.trim()
    if (q.length < 2) {
      setEncontrados([])
      return undefined
    }
    const t = setTimeout(() => buscarClientesSeguimiento(q).then(setEncontrados).catch(() => setEncontrados([])), 250)
    return () => clearTimeout(t)
  }, [buscar])

  const yo = opciones?.cuentas.find((c) => c.id === cuenta)
  const everyone = /@(everyone|todos)\b/i.test(texto)
  const alcance = useMemo(() => {
    if (!opciones) return 0
    if (donde === 'canal') return canales.length
    return opciones.ofertas.filter((o) => ofertas.includes(o.id)).reduce((n, o) => n + o.clientes, 0) + sueltos.length
  }, [opciones, donde, canales, ofertas, sueltos])
  const ejemplo = donde === 'chat' ? (sueltos[0]?.nombre || 'Martina').split(' ')[0] : ''
  const vista = texto.replace(/\{\s*nombre\s*\}/gi, ejemplo).replace(/[ \t]{2,}/g, ' ').replace(/ !/g, '!').trim()

  const alternar = (lista, setLista, id) => setLista(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id])
  const alternarEveryone = () => setTexto((t) => (everyone ? t.replace(/@(everyone|todos)\s*/i, '') : `@everyone ${t}`))

  async function enviar() {
    setAviso('')
    setError('')
    if (cuando === 'hora' && new Date(hora) <= new Date()) {
      setError('Elegí una hora que todavía no pasó.')
      return
    }
    setEnviando(true)
    try {
      const r = await crearEnvioSeguimiento({
        cuenta_id: cuenta,
        destino: donde === 'canal' ? { donde, canales } : { donde, ofertas, clientes: sueltos.map((c) => c.id) },
        texto,
        cuando: cuando === 'hora' ? new Date(hora).toISOString() : null,
      })
      setAviso(r.ya ? `Listo: salieron ${r.enviados} mensajes a nombre de ${yo?.nombre}.` : `Programado para ${formato.format(new Date(hora))}.`)
      recargarEnvios()
    } catch (e) {
      setError(e.message || 'No se pudo enviar.')
    } finally {
      setEnviando(false)
    }
  }

  async function cancelar(id) {
    try {
      await cancelarEnvioSeguimiento(id)
      recargarEnvios()
    } catch (e) {
      setError(e.message || 'No se pudo cancelar.')
    }
  }

  if (!opciones) {
    return <div className="msj-vacio">{error || 'Cargando…'}</div>
  }
  const listo = cuenta && texto.trim() && alcance > 0 && !enviando
  return (
    <div className="seg">
      <header className="seg__head">
        <button type="button" className="seg__volver" onClick={onVolver} aria-label="Volver">‹</button>
        <h2># seguimiento</h2>
        <span>solo lo ves vos</span>
      </header>

      <div className="seg__cuerpo">
        <section className="seg__col">
          <div className="seg__bloque">
            <span className="seg__rotulo">Plantilla</span>
            <div className="seg__fila">
              <button type="button" className="seg__pastilla" onClick={() => setTexto(PLANTILLAS.recordatorio)}>Recordatorio de clase</button>
              <button type="button" className="seg__pastilla" onClick={() => setTexto(PLANTILLAS.falto)}>Faltaron</button>
            </div>
          </div>

          <div className="seg__bloque">
            <span className="seg__rotulo">Dónde</span>
            <div className="seg__segmento" role="tablist" aria-label="Dónde sale">
              <button type="button" role="tab" aria-selected={donde === 'chat'} className={donde === 'chat' ? 'is-on' : ''} onClick={() => setDonde('chat')}>Grupos de clientes</button>
              <button type="button" role="tab" aria-selected={donde === 'canal'} className={donde === 'canal' ? 'is-on' : ''} onClick={() => setDonde('canal')}>Canales</button>
            </div>
            <small className="seg__nota">
              {donde === 'chat' ? 'Como los grupos de la bandeja (Boost, Mid level, Entry…): le llega a cada cliente de esos grupos en su chat, con su nombre.' : 'Un mensaje por canal. Con @everyone les llega la notificación a todos los que lo ven.'}
            </small>
          </div>

          <div className="seg__bloque">
            <span className="seg__rotulo">A quién</span>
            {donde === 'chat'
              ? opciones.ofertas.map((o) => (
                  <label key={o.id} className={`seg__opcion${ofertas.includes(o.id) ? ' is-on' : ''}`}>
                    <input type="checkbox" checked={ofertas.includes(o.id)} onChange={() => alternar(ofertas, setOfertas, o.id)} />
                    <span><b>{o.nombre}</b><small>{o.clientes} clientes activos</small></span>
                  </label>
                ))
              : opciones.canales.map((c) => (
                  <label key={c.id} className={`seg__opcion${canales.includes(c.id) ? ' is-on' : ''}`}>
                    <input type="checkbox" checked={canales.includes(c.id)} onChange={() => alternar(canales, setCanales, c.id)} />
                    <span><b>#{c.nombre}</b></span>
                  </label>
                ))}
            {donde === 'chat' ? (
              <div className="seg__sueltos">
                <input type="search" placeholder="Sumar un cliente por nombre" value={buscar} onChange={(e) => setBuscar(e.target.value)} aria-label="Buscar cliente" />
                {encontrados.length ? (
                  <ul>
                    {encontrados.map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => { if (!sueltos.some((x) => x.id === c.id)) setSueltos([...sueltos, c]); setBuscar('') }}>
                          {c.nombre} <small>{c.plan || 'sin plan'}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {sueltos.length ? (
                  <div className="seg__chips">
                    {sueltos.map((c) => (
                      <button key={c.id} type="button" onClick={() => setSueltos(sueltos.filter((x) => x.id !== c.id))} aria-label={`Sacar a ${c.nombre}`}>
                        {c.nombre} ×
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <section className="seg__col seg__col--ancha">
          <div className="seg__bloque">
            <span className="seg__rotulo">Enviar como</span>
            <div className="seg__fila">
              {opciones.cuentas.map((c) => (
                <button key={c.id} type="button" className={`seg__cuenta${c.id === cuenta ? ' is-on' : ''}`} style={{ '--k': colorPersona(c.nombre) }} onClick={() => setCuenta(c.id)} aria-pressed={c.id === cuenta}>
                  <Avatar persona={{ tipo: 'equipo', nombre: c.nombre, foto_url: c.foto_url }} size={24} />
                  {c.nombre}
                </button>
              ))}
            </div>
          </div>

          <div className="seg__bloque">
            <div className="seg__fila seg__fila--entre">
              <label className="seg__rotulo" htmlFor="seg-texto">Mensaje</label>
              <button type="button" className={`seg__pastilla${everyone ? ' is-everyone' : ''}`} onClick={alternarEveryone} aria-pressed={everyone}>@everyone</button>
            </div>
            <textarea id="seg-texto" className="seg__texto" rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={4000} />
            <small className="seg__nota">{'{nombre}'} se completa con el nombre de cada cliente.</small>
          </div>

          <div className="seg__bloque">
            <span className="seg__rotulo">Así se ve</span>
            <div className="seg__vista">
              <Avatar persona={{ tipo: 'equipo', nombre: yo?.nombre, foto_url: yo?.foto_url }} size={34} />
              <div>
                <span><b style={{ color: colorPersona(yo?.nombre || '') }}>{yo?.nombre}</b> <em>ATV</em></span>
                <p>{vista}</p>
              </div>
            </div>
          </div>

          {error ? <p className="msj-error">{error}</p> : null}
          {aviso ? <p className="seg__ok">{aviso}</p> : null}

          <div className="seg__pie">
            <span>{alcance ? `${alcance} ${donde === 'canal' ? (alcance === 1 ? 'canal' : 'canales') : alcance === 1 ? 'cliente' : 'clientes'}` : 'Elegí a quién'}</span>
            <div className="seg__fila">
              <select value={cuando} onChange={(e) => setCuando(e.target.value)} aria-label="Cuándo sale">
                {CUANDO.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              {cuando === 'hora' ? <input type="datetime-local" value={hora} onChange={(e) => setHora(e.target.value)} aria-label="Día y hora" /> : null}
              <button type="button" className="seg__enviar" disabled={!listo} onClick={enviar}>
                {enviando ? 'Enviando…' : cuando === 'hora' ? `Programar como ${yo?.nombre || ''}` : `Enviar como ${yo?.nombre || ''}`}
              </button>
            </div>
          </div>

          {envios.length ? (
            <div className="seg__bloque">
              <span className="seg__rotulo">Últimos envíos</span>
              <ul className="seg__envios">
                {envios.map((e) => (
                  <li key={e.id}>
                    <span className={`seg__estado is-${e.estado}`}>{ESTADOS[e.estado] || e.estado}</span>
                    <span className="seg__envio-txt">
                      <b>{e.cuenta}</b> → {e.a_quien} · {formato.format(new Date(e.cuando))}
                      {e.estado === 'enviado' ? ` · ${e.enviados} mensajes` : ''}
                      <small>{e.texto}</small>
                    </span>
                    {e.estado === 'pendiente' ? <button type="button" onClick={() => cancelar(e.id)}>Cancelar</button> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}
