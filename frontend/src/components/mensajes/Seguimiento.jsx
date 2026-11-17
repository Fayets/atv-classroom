import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Avatar from './Avatar'
import SelectorEmojis from './SelectorEmojis'
import { CaraMas, SugerenciasMencion } from './Conversacion'
import {
  buscarClientesSeguimiento,
  cancelarEnvioSeguimiento,
  crearEnvioSeguimiento,
  fetchEnviosSeguimiento,
  fetchOpcionesSeguimiento,
} from '../../api/seguimiento'
import { colorPersona, normal } from '../../utils/mensajes'

// #seguimiento (admins y Mauri): recordar las clases a nombre de otra cuenta, a canales de la comunidad o al chat
// de cada cliente de las ofertas elegidas. Ya o a la hora que elija.
// Cada plantilla es una secuencia: un globito por mensaje.
const PLANTILLAS = {
  recordatorio: ['@everyone {nombre}! hoy tenemos clase en vivo 🔥', 'traé la duda que te esté frenando esta semana que la resolvemos ahí'],
  falto: ['{nombre}! te extrañamos en la clase 🙌', 'la idea es destrabar justo lo que te está frenando. en la próxima sumate y traé tu duda'],
}
const MAX_GLOBITOS = 10
const EVERYONE = { id: 0, nombre: 'everyone', area: 'A todos los que lo ven' }
const AL_CLIENTE = { id: 'cliente', nombre: 'Cliente', esCliente: true, detalle: 'Su nombre, en cada chat' }
// Lo que se pega con renglones en blanco en el medio son varios mensajes: uno por globito.
const partir = (texto) => texto.split(/\n[ \t]*\n+/).map((t) => t.trim()).filter(Boolean)
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
  const [globitos, setGlobitos] = useState(PLANTILLAS.recordatorio)
  const [activo, setActivo] = useState(0) // el globito donde está el cursor (ahí van el @ y los emojis)
  const [sugerencias, setSugerencias] = useState(null) // { lista, indice, desde, i }
  const [verEmojis, setVerEmojis] = useState(false)
  const cajas = useRef([])
  const cerrarEmojis = useCallback(() => setVerEmojis(false), [])
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
  const everyone = /@(everyone|todos)\b/i.test(globitos[0] || '')
  const alcance = useMemo(() => {
    if (!opciones) return 0
    if (donde === 'canal') return canales.length
    return opciones.ofertas.filter((o) => ofertas.includes(o.id)).reduce((n, o) => n + o.clientes, 0) + sueltos.length
  }, [opciones, donde, canales, ofertas, sueltos])
  const ejemplo = donde === 'chat' ? (sueltos[0]?.nombre || 'Martina').split(' ')[0] : ''
  const vista = globitos
    .map((g) => g.replace(/\{\s*nombre\s*\}/gi, ejemplo).replace(/[ \t]{2,}/g, ' ').replace(/ !/g, '!').trim())
    .filter(Boolean)

  const alternar = (lista, setLista, id) => setLista(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id])
  const alternarEveryone = () =>
    setGlobitos((l) => l.map((g, i) => (i ? g : everyone ? g.replace(/@(everyone|todos)\s*/i, '') : `@everyone ${g}`)))

  // ---------- globitos (modo secuencia) ----------
  const enfocar = (i, pos) =>
    requestAnimationFrame(() => {
      const el = cajas.current[i]
      if (!el) return
      el.focus()
      const p = pos ?? el.value.length
      el.setSelectionRange(p, p)
    })
  const cambiar = (i, valor) => setGlobitos((l) => l.map((g, j) => (j === i ? valor : g)))
  function agregar(despues = globitos.length - 1) {
    if (globitos.length >= MAX_GLOBITOS) return
    setGlobitos((l) => [...l.slice(0, despues + 1), '', ...l.slice(despues + 1)])
    setActivo(despues + 1)
    enfocar(despues + 1)
  }
  function quitar(i) {
    setGlobitos((l) => (l.length > 1 ? l.filter((_, j) => j !== i) : ['']))
    setActivo(Math.max(0, i - 1))
  }
  // Pegar una cadena con renglones en blanco la reparte en globitos, uno atrás del otro.
  function alPegar(e, i) {
    const pegado = e.clipboardData.getData('text')
    const partes = partir(pegado)
    if (partes.length < 2) return
    e.preventDefault()
    const el = e.target
    const antes = globitos[i].slice(0, el.selectionStart).trimEnd()
    const despues = globitos[i].slice(el.selectionEnd).trimStart()
    const nuevos = [antes ? `${antes} ${partes[0]}` : partes[0], ...partes.slice(1, -1), despues ? `${partes.at(-1)} ${despues}` : partes.at(-1)]
    setGlobitos((l) => [...l.slice(0, i), ...nuevos, ...l.slice(i + 1)].slice(0, MAX_GLOBITOS))
    const ultimo = Math.min(i + nuevos.length - 1, MAX_GLOBITOS - 1)
    setActivo(ultimo)
    enfocar(ultimo)
  }

  // ---------- @ y emojis ----------
  const equipo = useMemo(() => (opciones?.cuentas || []).map((c) => ({ ...c, rol: c.rol || 'admin' })), [opciones])
  function mencionesPara(antes, i) {
    const hallado = antes.match(/(^|\s)@([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]*)$/)
    if (!hallado) return null
    const q = normal(hallado[2])
    const empieza = (nombre) => !q || normal(nombre).split(/\s+/).some((x) => x.startsWith(q))
    const lista = [
      ...(!q || 'everyone'.startsWith(q) || 'todos'.startsWith(q) ? [EVERYONE] : []),
      ...(donde === 'chat' && (!q || 'cliente'.startsWith(q)) ? [AL_CLIENTE] : []),
      ...equipo.filter((m) => empieza(m.nombre)),
    ].slice(0, 7)
    return lista.length ? { lista, indice: 0, desde: antes.length - hallado[2].length - 1, i } : null
  }
  function elegir(m) {
    const { i, desde } = sugerencias
    const el = cajas.current[i]
    const caret = el?.selectionStart ?? globitos[i].length
    const marca = m.id === 0 ? '@everyone' : m.id === 'cliente' ? '@{nombre}' : `@${m.nombre.trim().split(/\s+/)[0]}`
    cambiar(i, `${globitos[i].slice(0, desde)}${marca} ${globitos[i].slice(caret)}`)
    setSugerencias(null)
    enfocar(i, desde + marca.length + 1)
  }
  function ponerEmoji(emoji) {
    const i = activo
    const el = cajas.current[i]
    const valor = globitos[i] || ''
    const desde = el?.selectionStart ?? valor.length
    const hasta = el?.selectionEnd ?? valor.length
    const sigue = valor.slice(hasta, hasta + 1)
    const extra = emoji + (sigue && !/\s/.test(sigue) ? ' ' : '')
    cambiar(i, `${valor.slice(0, desde)}${extra}${valor.slice(hasta)}`)
    enfocar(i, desde + extra.length)
  }
  function teclas(e, i) {
    if (sugerencias?.i === i) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const paso = e.key === 'ArrowDown' ? 1 : -1
        setSugerencias((x) => ({ ...x, indice: (x.indice + paso + x.lista.length) % x.lista.length }))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        elegir(sugerencias.lista[sugerencias.indice])
        return
      }
      if (e.key === 'Escape') {
        setSugerencias(null)
        return
      }
    }
    // Cmd/Ctrl + Enter: otro globito abajo.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      agregar(i)
    } else if (e.key === 'Backspace' && !globitos[i] && globitos.length > 1) {
      e.preventDefault()
      quitar(i)
      enfocar(Math.max(0, i - 1))
    }
  }

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
        mensajes: globitos.map((g) => g.trim()).filter(Boolean),
        cuando: cuando === 'hora' ? new Date(hora).toISOString() : null,
      })
      setAviso(r.ya ? `Listo: le llegó a ${r.enviados} ${donde === 'canal' ? 'canales' : 'chats'} a nombre de ${yo?.nombre}.` : `Programado para ${formato.format(new Date(hora))}.`)
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
  // Lo que falta para poder mandar: el botón queda activo y lo dice (al pasar el mouse y al tocarlo).
  const falta = !cuenta
    ? 'Elegí a nombre de quién sale'
    : !vista.length
      ? 'Escribí el mensaje'
      : alcance <= 0
        ? donde === 'canal' ? 'Elegí al menos un canal' : 'Elegí al menos un grupo o sumá un cliente'
        : ''
  return (
    <div className="seg">
      <header className="seg__head">
        <button type="button" className="seg__volver" onClick={onVolver} aria-label="Volver">‹</button>
        <h2># seguimiento</h2>
        <span>lo ven los admins</span>
      </header>

      <div className="seg__cuerpo">
        <section className="seg__col">
          <div className="seg__bloque">
            <span className="seg__rotulo">Plantilla</span>
            <div className="seg__fila">
              <button type="button" className="seg__pastilla" onClick={() => setGlobitos(PLANTILLAS.recordatorio)}>Recordatorio de clase</button>
              <button type="button" className="seg__pastilla" onClick={() => setGlobitos(PLANTILLAS.falto)}>Faltaron</button>
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
              <span className="seg__rotulo">{globitos.length > 1 ? `Secuencia · ${globitos.length} mensajes` : 'Mensaje'}</span>
              <div className="seg__fila">
                <button type="button" className={`seg__pastilla${everyone ? ' is-everyone' : ''}`} onClick={alternarEveryone} aria-pressed={everyone}>@everyone</button>
                <button type="button" className="seg__pastilla seg__emoji msj-emoji-abrir" onMouseDown={(e) => e.preventDefault()} onClick={() => setVerEmojis((v) => !v)} aria-label="Emojis" title="Emojis">
                  <CaraMas />
                </button>
              </div>
            </div>
            <div className="seg__globitos">
              {verEmojis ? <SelectorEmojis onElegir={ponerEmoji} onCerrar={cerrarEmojis} /> : null}
              {globitos.map((g, i) => (
                <div key={i} className={`seg__globito${i === activo ? ' is-activo' : ''}`}>
                  {sugerencias?.i === i ? <SugerenciasMencion sugerencias={sugerencias} onElegir={elegir} /> : null}
                  <span className="seg__num" aria-hidden="true">{i + 1}</span>
                  <textarea
                    ref={(el) => { cajas.current[i] = el }}
                    className="seg__texto"
                    rows={Math.min(6, Math.max(2, g.split('\n').length))}
                    value={g}
                    placeholder={i ? 'Siguiente mensaje' : 'Escribí el mensaje · @ para etiquetar'}
                    aria-label={`Mensaje ${i + 1}`}
                    onFocus={() => setActivo(i)}
                    onBlur={() => setTimeout(() => setSugerencias((x) => (x?.i === i ? null : x)), 120)}
                    onChange={(e) => {
                      cambiar(i, e.target.value)
                      setSugerencias(mencionesPara(e.target.value.slice(0, e.target.selectionStart), i))
                    }}
                    onKeyDown={(e) => teclas(e, i)}
                    onPaste={(e) => alPegar(e, i)}
                    maxLength={4000}
                  />
                  {globitos.length > 1 ? (
                    <button type="button" className="seg__quitar" onClick={() => quitar(i)} aria-label={`Sacar el mensaje ${i + 1}`} title="Sacar este mensaje">×</button>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="seg__fila seg__fila--entre">
              <button type="button" className="seg__pastilla" onClick={() => agregar()} disabled={globitos.length >= MAX_GLOBITOS}>+ Agregar mensaje</button>
              <small className="seg__nota">{'{nombre}'} se completa con el nombre de cada cliente · pegá varios párrafos y se separan solos</small>
            </div>
          </div>

          <div className="seg__bloque">
            <span className="seg__rotulo">Así se ve</span>
            <div className="seg__vista">
              <Avatar persona={{ tipo: 'equipo', nombre: yo?.nombre, foto_url: yo?.foto_url }} size={34} />
              <div>
                <span><b style={{ color: colorPersona(yo?.nombre || '') }}>{yo?.nombre}</b> <em>ATV</em></span>
                {vista.length ? vista.map((t, i) => <p key={i}>{t}</p>) : <p className="seg__vacio">Todavía no hay mensaje</p>}
              </div>
            </div>
          </div>

          {error ? <p className="msj-error">{error}</p> : null}
          {aviso ? <p className="seg__ok">{aviso}</p> : null}

          <div className="seg__pie">
            <span id="seg-falta">{falta || `${alcance} ${donde === 'canal' ? (alcance === 1 ? 'canal' : 'canales') : alcance === 1 ? 'cliente' : 'clientes'}${vista.length > 1 ? ` · ${vista.length} mensajes cada uno` : ''}`}</span>
            <div className="seg__fila">
              <select value={cuando} onChange={(e) => setCuando(e.target.value)} aria-label="Cuándo sale">
                {CUANDO.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              {cuando === 'hora' ? <input type="datetime-local" value={hora} onChange={(e) => setHora(e.target.value)} aria-label="Día y hora" /> : null}
              <button
                type="button"
                className={`seg__enviar${falta ? ' is-falta' : ''}`}
                disabled={enviando}
                title={falta || undefined}
                aria-describedby={falta ? 'seg-falta' : undefined}
                onClick={() => (falta ? setError(falta) : enviar())}
              >
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
                      {e.estado === 'enviado' ? ` · a ${e.enviados}` : ''}
                      {e.globitos > 1 ? ` · secuencia de ${e.globitos}` : ''}
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
