import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { borrarMensaje, editarMensaje, enviarMensaje, fetchEquipoChat, fetchMensajes, fetchParticipantes, marcarLeido, marcarSugerenciaUsada, pedirSugerencia, subirAdjunto } from '../../api/mensajes'
import { fetchVoz } from '../../api/cuenta'
import { useAuth } from '../../context/AuthContext'
import { useMensajeria } from '../../context/MensajeriaContext'
import { ACEPTA_ADJUNTOS, ES_EVERYONE, claveAutor, etiquetaDia, hora, mismoDia, nombreRol, normal, peso, primerNombre } from '../../utils/mensajes'
import Adjuntos from './Adjuntos'
import Alerta from './Alerta'
import Avatar from './Avatar'
import Enlaces from './Enlaces'
import GrabarAudio, { puedeGrabar } from './GrabarAudio'
import TextoMensaje from './TextoMensaje'

const AGRUPAR_MS = 5 * 60 * 1000
// Sugerencias con la caja vacía ya pedidas, por chat: volver a un chat no paga otra.
const cacheVacio = new Map() // canalId → { mensaje, fantasma }
const SEGUIMIENTO_DESPUES_MS = 60 * 60 * 1000 // si escribiste vos último, la sugerencia de seguimiento aparece pasada una hora
let temporal = 0

// Etiqueta a todos los que ven el canal (solo lo puede usar el equipo).
const EVERYONE = { id: 0, nombre: 'everyone', area: 'Etiqueta a todos en este canal' }

function quitarMensaje(lista, id) {
  return lista
    .filter((x) => x.id !== id)
    .map((x) => (x.respuesta_a?.id === id ? { ...x, respuesta_a: { ...x.respuesta_a, texto: null } } : x))
}

function agregarSinDuplicar(lista, nuevos) {
  const ids = new Set(lista.map((m) => m.id))
  const sumar = nuevos.filter((m) => !ids.has(m.id))
  return sumar.length ? [...lista, ...sumar].sort((a, b) => (a.id > b.id ? 1 : -1)) : lista
}

export default function Conversacion({ canalId, item, onVolver, oculta = false }) {
  const { user, isEquipo, isAdmin } = useAuth()
  const { suscribir, avisarEscribiendo, conectado } = useMensajeria()
  const [datos, setDatos] = useState(null)
  const [mensajes, setMensajes] = useState([])
  const [pendientes, setPendientes] = useState([])
  const [error, setError] = useState('')
  const [texto, setTexto] = useState('')
  const [respondiendo, setRespondiendo] = useState(null)
  const [editando, setEditando] = useState(null)
  const [escriben, setEscriben] = useState({})
  const [cargandoAntes, setCargandoAntes] = useState(false)
  const [aBorrar, setABorrar] = useState(null)
  const [equipo, setEquipo] = useState([])
  const [sugerencias, setSugerencias] = useState(null) // { lista, indice, desde }
  const mencionados = useRef(new Map()) // "@Nombre" escrito → id del miembro
  const [archivos, setArchivos] = useState([]) // { clave, nombre, tamano, progreso, adjunto, error, vista }
  const [arrastrando, setArrastrando] = useState(false)
  const selector = useRef(null)
  const lista = useRef(null)
  const caja = useRef(null)
  const pegadoAbajo = useRef(true)
  const altoAntes = useRef(null)
  const leidoEnviado = useRef(0)
  const ultimoAvisoEscribiendo = useRef(0)
  const yo = isEquipo ? `equipo:${user?.usuario_id}` : `cliente:${user?.usuario_id}`
  const mensajesRef = useRef(mensajes)
  mensajesRef.current = mensajes

  // Carga inicial del canal.
  useEffect(() => {
    let vivo = true
    setDatos(null)
    setMensajes([])
    setPendientes([])
    setRespondiendo(null)
    setEditando(null)
    setArchivos([])
    setError('')
    leidoEnviado.current = 0
    pegadoAbajo.current = true
    fetchMensajes(canalId)
      .then((r) => {
        if (!vivo) return
        setDatos(r)
        setMensajes(r.mensajes)
      })
      .catch((err) => vivo && setError(err.message || 'No se pudo abrir el canal.'))
    return () => {
      vivo = false
    }
  }, [canalId])

  useEffect(() => {
    fetchEquipoChat()
      .then(setEquipo)
      .catch(() => null)
  }, [])

  // Los del lado del cliente en este chat (el titular y su equipo): también se pueden @etiquetar.
  const [participantes, setParticipantes] = useState([])
  useEffect(() => {
    let vivo = true
    setParticipantes([])
    fetchParticipantes(canalId)
      .then((p) => vivo && setParticipantes(p))
      .catch(() => null)
    return () => {
      vivo = false
    }
  }, [canalId])

  // Eventos en vivo.
  useEffect(
    () =>
      suscribir((ev) => {
        if (ev.tipo === 'mensaje' && ev.mensaje.canal_id === canalId) {
          setMensajes((m) => agregarSinDuplicar(m, [ev.mensaje]))
          setEscriben((e) => {
            const copia = { ...e }
            delete copia[ev.mensaje.autor.nombre]
            return copia
          })
        } else if (ev.tipo === 'editado' && ev.mensaje.canal_id === canalId) {
          setMensajes((m) => m.map((x) => (x.id === ev.mensaje.id ? ev.mensaje : x)))
        } else if (ev.tipo === 'borrado' && ev.mensaje.canal_id === canalId) {
          // Como en Discord: desaparece para todos y las respuestas que lo citaban lo indican.
          setMensajes((m) => quitarMensaje(m, ev.mensaje.id))
        } else if (ev.tipo === 'leido' && ev.canal_id === canalId) {
          setDatos((d) =>
            d ? { ...d, lecturas: { ...d.lecturas, [ev.lector]: Math.max(d.lecturas[ev.lector] || 0, ev.ultimo_id) } } : d,
          )
        } else if (ev.tipo === 'escribiendo' && ev.canal_id === canalId) {
          setEscriben((e) => {
            const copia = { ...e }
            if (ev.activo === false) delete copia[ev.nombre]
            else copia[ev.nombre] = Date.now()
            return copia
          })
        } else if (ev.tipo === 'reconectado') {
          // Al volver la conexión se trae lo que llegó mientras estaba cortada.
          const actuales = mensajesRef.current
          const ultimo = actuales[actuales.length - 1]?.id
          if (ultimo) {
            fetchMensajes(canalId, { despuesDe: ultimo })
              .then((r) => setMensajes((m) => agregarSinDuplicar(m, r.mensajes)))
              .catch(() => null)
          }
        }
      }),
    [suscribir, canalId],
  )

  // Sin conexión en vivo (proxy sin WebSocket, red cortada) se consulta lo nuevo cada 10 segundos.
  useEffect(() => {
    if (conectado) return undefined
    const t = setInterval(() => {
      const actuales = mensajesRef.current
      // Con el canal vacío se pide desde 0, así entra el primer mensaje.
      const ultimo = actuales[actuales.length - 1]?.id ?? 0
      fetchMensajes(canalId, { despuesDe: ultimo })
        .then((r) => setMensajes((m) => agregarSinDuplicar(m, r.mensajes)))
        .catch(() => null)
    }, 10000)
    return () => clearInterval(t)
  }, [conectado, canalId])

  // "Está escribiendo" se apaga solo a los 5 segundos.
  useEffect(() => {
    if (!Object.keys(escriben).length) return undefined
    const t = setInterval(() => {
      setEscriben((e) => {
        const vigentes = Object.fromEntries(Object.entries(e).filter(([, cuando]) => Date.now() - cuando < 5000))
        return Object.keys(vigentes).length === Object.keys(e).length ? e : vigentes
      })
    }, 1000)
    return () => clearInterval(t)
  }, [escriben])

  // Scroll: abajo al abrir y cuando llega algo si ya estabas abajo; quieto al cargar anteriores.
  useLayoutEffect(() => {
    const el = lista.current
    if (!el) return
    if (altoAntes.current !== null) {
      el.scrollTop = el.scrollHeight - altoAntes.current
      altoAntes.current = null
    } else if (pegadoAbajo.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [mensajes, pendientes, datos])

  // Marca como leído lo último que ves, si la pestaña está a la vista.
  const marcar = useCallback(() => {
    const ultimo = mensajes[mensajes.length - 1]
    if (!ultimo || oculta || document.hidden || ultimo.id <= leidoEnviado.current) return
    leidoEnviado.current = ultimo.id
    marcarLeido(canalId, ultimo.id).catch(() => {
      leidoEnviado.current = 0
    })
  }, [mensajes, canalId, oculta])

  useEffect(() => {
    marcar()
    document.addEventListener('visibilitychange', marcar)
    return () => document.removeEventListener('visibilitychange', marcar)
  }, [marcar])

  // ---------- Tab: la IA completa en tu voz (solo el equipo, en chats con clientes) ----------
  const [fantasma, setFantasma] = useState(null) // { id, base, texto, cargando }
  const pedidoIA = useRef(null)
  const esperaIA = useRef(null)
  const vacioPedido = useRef(null) // último mensaje para el que ya se pidió una sugerencia con la caja vacía
  const descartadoIA = useRef(null) // id del último mensaje cuando apretaste Esc
  const campo = useRef(null)
  const iaActiva = Boolean(isEquipo && datos?.canal?.tipo === 'cliente')

  // Con la voz de quién sugiere (se elige en Mi cuenta): si es de otro, la etiqueta lo dice.
  const [vozAjena, setVozAjena] = useState(null)
  useEffect(() => {
    if (!iaActiva) return undefined
    let vivo = true
    fetchVoz()
      .then((d) => {
        const o = d.opciones.find((x) => x.id === d.elegida)
        if (vivo) setVozAjena(d.elegida !== d.propia && o ? o.nombre.split(' ')[0] : null)
      })
      .catch(() => null)
    return () => {
      vivo = false
    }
  }, [iaActiva])

  const cancelarIA = useCallback(() => {
    clearTimeout(esperaIA.current)
    pedidoIA.current?.abort()
    pedidoIA.current = null
  }, [])

  const pedirIA = useCallback(
    (base) => {
      cancelarIA()
      const ctrl = new AbortController()
      pedidoIA.current = ctrl
      setFantasma({ id: null, base, texto: '', cargando: true })
      const mismo = (f) => f && f.base === base && pedidoIA.current === ctrl
      pedirSugerencia(canalId, base, {
        signal: ctrl.signal,
        alPedazo: (t) => setFantasma((f) => (mismo(f) ? { ...f, texto: t } : f)),
      })
        .then(({ id, texto: t }) => {
          const lista = { id, base, texto: t, cargando: false }
          if (!base && t) cacheVacio.set(canalId, { mensaje: vacioPedido.current, fantasma: lista })
          setFantasma((f) => (mismo(f) ? lista : f))
        })
        .catch(() => setFantasma((f) => (mismo(f) ? null : f)))
    },
    [canalId, cancelarIA],
  )

  // Cambio de canal o se cierra: nada de sugerencias colgadas.
  useEffect(() => {
    setFantasma(null)
    vacioPedido.current = null
    descartadoIA.current = null
    return cancelarIA
  }, [canalId, cancelarIA])

  // Con la caja vacía siempre hay una sugerencia: la respuesta si el cliente escribió último, o un
  // seguimiento si el último mensaje es del equipo y pasó un rato sin respuesta. Si borrás lo que
  // escribías, vuelve la misma (sin pedir otra). Esc la descarta hasta que llegue un mensaje nuevo.
  const ultimoMensaje = mensajes[mensajes.length - 1]
  useEffect(() => {
    if (!iaActiva || oculta || texto || fantasma || !ultimoMensaje || !(ultimoMensaje.id > 0 || ultimoMensaje.id < 0)) return
    if (descartadoIA.current === ultimoMensaje.id) return
    if (cacheVacio.get(canalId)?.mensaje === ultimoMensaje.id) {
      setFantasma(cacheVacio.get(canalId).fantasma)
      return
    }
    if (vacioPedido.current === ultimoMensaje.id) return
    const delCliente = ultimoMensaje.autor?.tipo === 'cliente'
    const hace = Date.now() - new Date(ultimoMensaje.creado_en).getTime()
    if (!delCliente && !(hace >= SEGUIMIENTO_DESPUES_MS)) return
    vacioPedido.current = ultimoMensaje.id
    pedirIA('')
  }, [iaActiva, oculta, texto, fantasma, ultimoMensaje, pedirIA, canalId])

  // Lo que falta de la sugerencia: si seguís escribiendo lo mismo que proponía, se va achicando.
  const completoIA = fantasma ? fantasma.base + fantasma.texto : ''
  const restoIA = fantasma && fantasma.texto && texto.startsWith(fantasma.base) && completoIA.startsWith(texto) ? completoIA.slice(texto.length) : ''

  function programarIA(valor, caret) {
    clearTimeout(esperaIA.current)
    if (!iaActiva) return
    if (caret !== valor.length || valor.trim().length < 3 || /(^|\s)@[^\s]*$/.test(valor)) return
    esperaIA.current = setTimeout(() => pedirIA(valor), 650)
  }

  function aceptarIA() {
    const nuevo = texto + restoIA
    setTexto(nuevo)
    if (fantasma?.id) marcarSugerenciaUsada(fantasma.id)
    cancelarIA()
    setFantasma(null)
    requestAnimationFrame(() => {
      caja.current?.focus()
      caja.current?.setSelectionRange(nuevo.length, nuevo.length)
      if (campo.current) campo.current.scrollTop = campo.current.scrollHeight
    })
  }

  // Las imágenes cambian de alto al cargar: si estabas abajo de todo, se sigue abajo.
  function bajarSiEstabaAbajo() {
    if (pegadoAbajo.current && lista.current) lista.current.scrollTop = lista.current.scrollHeight
  }

  function alScrollear() {
    const el = lista.current
    pegadoAbajo.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  async function cargarAnteriores() {
    if (!mensajes.length || cargandoAntes) return
    setCargandoAntes(true)
    try {
      const r = await fetchMensajes(canalId, { antesDe: mensajes[0].id })
      altoAntes.current = lista.current.scrollHeight - lista.current.scrollTop
      setMensajes((m) => [...r.mensajes, ...m])
      setDatos((d) => ({ ...d, hay_mas: r.hay_mas }))
    } catch (err) {
      setError(err.message)
    } finally {
      setCargandoAntes(false)
    }
  }

  function agregarArchivos(lista) {
    const nuevos = Array.from(lista || []).slice(0, 10)
    if (!nuevos.length) return
    nuevos.forEach((archivo) => {
      const clave = `${Date.now()}-${Math.random()}`
      const vista = archivo.type.startsWith('image/') ? URL.createObjectURL(archivo) : null
      setArchivos((a) => [...a, { clave, nombre: archivo.name || 'captura.png', tamano: archivo.size, progreso: 0, vista }])
      subirAdjunto(canalId, archivo, (p) => setArchivos((a) => a.map((x) => (x.clave === clave ? { ...x, progreso: p } : x))))
        .then((adjunto) => setArchivos((a) => a.map((x) => (x.clave === clave ? { ...x, progreso: 100, adjunto } : x))))
        .catch((err) => setArchivos((a) => a.map((x) => (x.clave === clave ? { ...x, error: err.message } : x))))
    })
    caja.current?.focus()
  }

  function quitarArchivo(clave) {
    setArchivos((a) => {
      const x = a.find((y) => y.clave === clave)
      if (x?.vista) URL.revokeObjectURL(x.vista)
      return a.filter((y) => y.clave !== clave)
    })
  }

  function alPegar(e) {
    const imagenes = Array.from(e.clipboardData?.files || [])
    if (imagenes.length) {
      e.preventDefault()
      agregarArchivos(imagenes)
    }
  }

  const subiendo = archivos.some((a) => !a.adjunto && !a.error)
  const listos = archivos.filter((a) => a.adjunto)

  async function mandar(e) {
    e?.preventDefault()
    const limpio = texto.trim()
    if (subiendo || (!limpio && !listos.length)) return
    const adjuntosIds = listos.map((a) => a.adjunto.id)
    const adjuntosVista = listos.map((a) => a.adjunto)
    const id = `tmp-${++temporal}`
    const provisorio = {
      id,
      texto: limpio,
      autor: { tipo: isEquipo ? 'equipo' : 'cliente', id: user.usuario_id, nombre: user.nombre, foto_url: user.foto_url },
      respuesta_a: respondiendo ? { id: respondiendo.id, autor_nombre: respondiendo.autor.nombre, texto: respondiendo.texto } : null,
      adjuntos: adjuntosVista,
      creado_en: new Date().toISOString(),
      enviando: true,
    }
    archivos.forEach((a) => a.vista && URL.revokeObjectURL(a.vista))
    setArchivos([])
    // Solo cuentan las etiquetas elegidas que siguen escritas en el mensaje.
    const ids = []
    mencionados.current.forEach((id, marca) => {
      if (id && limpio.includes(marca) && !ids.includes(id)) ids.push(id)
    })
    mencionados.current = new Map()
    setSugerencias(null)
    cancelarIA()
    setFantasma(null)
    setPendientes((p) => [...p, provisorio])
    setTexto('')
    ultimoAvisoEscribiendo.current = 0
    setRespondiendo(null)
    pegadoAbajo.current = true
    try {
      const real = await enviarMensaje(canalId, limpio, provisorio.respuesta_a?.id ?? null, ids, adjuntosIds)
      setMensajes((m) => agregarSinDuplicar(m, [real]))
      setPendientes((p) => p.filter((x) => x.id !== id))
    } catch (err) {
      setPendientes((p) => p.map((x) => (x.id === id ? { ...x, enviando: false, fallo: err.message || 'No se envió' } : x)))
    }
  }

  // Nota de voz (solo clientes): se sube y se manda sola, con el mensaje provisorio mientras tanto.
  const [grabando, setGrabando] = useState(false)
  const cerrarGrabacion = useCallback(() => setGrabando(false), [])
  const mandarAudio = useCallback(
    async (archivo) => {
      setGrabando(false)
      const id = `tmp-${++temporal}`
      const respuestaA = respondiendo ? { id: respondiendo.id, autor_nombre: respondiendo.autor.nombre, texto: respondiendo.texto } : null
      setPendientes((p) => [
        ...p,
        { id, texto: '🎙️ Nota de voz…', autor: { tipo: 'cliente', id: user.usuario_id, nombre: user.nombre, foto_url: user.foto_url }, respuesta_a: respuestaA, adjuntos: [], creado_en: new Date().toISOString(), enviando: true },
      ])
      setRespondiendo(null)
      pegadoAbajo.current = true
      try {
        const adjunto = await subirAdjunto(canalId, archivo, () => null)
        const real = await enviarMensaje(canalId, '', respuestaA?.id ?? null, [], [adjunto.id])
        setMensajes((m) => agregarSinDuplicar(m, [real]))
        setPendientes((p) => p.filter((x) => x.id !== id))
      } catch (err) {
        setPendientes((p) => p.map((x) => (x.id === id ? { ...x, enviando: false, fallo: err.message || 'No se envió la nota de voz' } : x)))
      }
    },
    [canalId, respondiendo, user],
  )

  function reintentar(p) {
    setPendientes((lista) => lista.filter((x) => x.id !== p.id))
    setTexto(p.texto)
    caja.current?.focus()
  }

  function buscarSugerencias(valor, caret) {
    const antes = valor.slice(0, caret)
    const hallado = antes.match(/(^|\s)@([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]*)$/)
    if (!hallado || (!equipo.length && !participantes.length)) {
      setSugerencias(null)
      return
    }
    const q = normal(hallado[2])
    const todos = isEquipo && (!q || 'everyone'.startsWith(q) || 'todos'.startsWith(q)) ? [EVERYONE] : []
    const delCliente = participantes
      .filter((p) => normal(p.nombre) !== normal(user?.nombre || ''))
      .filter((p) => !q || normal(p.nombre).split(/\s+/).some((x) => x.startsWith(q)))
      .map((p) => ({ ...p, id: p.clave, esCliente: true }))
    const lista = [
      ...todos,
      ...delCliente,
      ...equipo
        .filter((m) => m.id !== (isEquipo ? user?.usuario_id : null))
        .filter((m) => !q || normal(m.nombre).split(/\s+/).some((p) => p.startsWith(q))),
    ].slice(0, 7)
    setSugerencias(lista.length ? { lista, indice: 0, desde: caret - hallado[2].length - 1 } : null)
  }

  function elegir(miembro) {
    const el = caja.current
    const caret = el?.selectionStart ?? texto.length
    const desde = sugerencias?.desde ?? caret
    const marca = `@${primerNombre(miembro.nombre)}`
    const nuevo = `${texto.slice(0, desde)}${marca} ${texto.slice(caret)}`
    mencionados.current.set(marca, miembro.esCliente ? null : miembro.id) // al servidor solo van ids del equipo
    setTexto(nuevo)
    setSugerencias(null)
    requestAnimationFrame(() => {
      const pos = desde + marca.length + 1
      el?.focus()
      el?.setSelectionRange(pos, pos)
    })
  }

  function alEscribir(e) {
    const valor = e.target.value
    setTexto(valor)
    if (e.target.selectionStart === valor.length && campo.current) {
      requestAnimationFrame(() => campo.current && (campo.current.scrollTop = campo.current.scrollHeight))
    }
    buscarSugerencias(valor, e.target.selectionStart)
    if (iaActiva) {
      const sigueLaSugerencia = fantasma && fantasma.texto && valor.startsWith(fantasma.base) && completoIA.startsWith(valor) && valor.length < completoIA.length
      if (!sigueLaSugerencia) {
        cancelarIA()
        setFantasma(null)
        programarIA(valor, e.target.selectionStart)
      }
    }
    if (!e.target.value.trim()) {
      if (ultimoAvisoEscribiendo.current) avisarEscribiendo(canalId, false)
      ultimoAvisoEscribiendo.current = 0
      return
    }
    if (Date.now() - ultimoAvisoEscribiendo.current > 3000) {
      ultimoAvisoEscribiendo.current = Date.now()
      avisarEscribiendo(canalId)
    }
  }

  function teclas(e) {
    if (sugerencias) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const paso = e.key === 'ArrowDown' ? 1 : -1
        setSugerencias((sg) => ({ ...sg, indice: (sg.indice + paso + sg.lista.length) % sg.lista.length }))
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
    if (restoIA && e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      aceptarIA()
      return
    }
    if (fantasma && e.key === 'Escape') {
      cancelarIA()
      setFantasma(null)
      descartadoIA.current = ultimoMensaje?.id ?? null
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      mandar()
    } else if (e.key === 'Escape') {
      setRespondiendo(null)
    }
  }

  async function guardarEdicion(m, nuevo) {
    const limpio = nuevo.trim()
    setEditando(null)
    if (!limpio || limpio === m.texto) return
    try {
      const r = await editarMensaje(m.id, limpio)
      setMensajes((lista) => lista.map((x) => (x.id === r.id ? r : x)))
    } catch (err) {
      setError(err.message)
    }
  }

  async function borrar(m) {
    setABorrar(null)
    try {
      await borrarMensaje(m.id)
      setMensajes((lista) => quitarMensaje(lista, m.id))
    } catch (err) {
      setError(err.message)
    }
  }

  if (error && !datos) {
    return <div className="msj-vacio">{error}</div>
  }
  if (!datos) {
    return <div className="msj-vacio">Cargando…</div>
  }

  // Nombre y descripción salen de la lista, que se actualiza en vivo si alguien edita el canal.
  const canal = item ? { ...datos.canal, nombre: item.nombre, descripcion: item.descripcion } : datos.canal
  const todos = [...mensajes, ...pendientes]
  const esPrivado = canal.tipo === 'cliente'
  const esGrupo = canal.tipo === 'grupo'
  // "Visto": hasta dónde leyó el otro lado, sobre mi último mensaje.
  const leidoPorElOtro = isEquipo ? datos.lecturas.cliente : datos.lecturas.equipo
  const miUltimo = [...mensajes].reverse().find((m) => claveAutor(m.autor) === yo)
  const nombresEscribiendo = Object.keys(escriben).filter((n) => n !== user?.nombre)
  const nombresEquipo = new Set([...equipo, ...participantes].map((m) => normal(primerNombre(m.nombre))))
  const miPrimerNombre = primerNombre(user?.nombre) // al cliente también se le resalta cuando lo etiquetan

  return (
    <section
      className={`msj-conv${arrastrando ? ' is-arrastrando' : ''}`}
      aria-label={`Canal ${canal.nombre}`}
      onDragOver={(e) => {
        if (!datos.puede_escribir || !e.dataTransfer?.types?.includes('Files')) return
        e.preventDefault()
        setArrastrando(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setArrastrando(false)
      }}
      onDrop={(e) => {
        if (!datos.puede_escribir) return
        e.preventDefault()
        setArrastrando(false)
        agregarArchivos(e.dataTransfer.files)
      }}
    >
      {arrastrando ? <div className="msj-soltar">Soltá para adjuntar</div> : null}
      <header className="msj-conv__barra">
        {onVolver ? (
          <button type="button" className="msj-volver" onClick={onVolver} aria-label="Volver a los canales">
            ‹
          </button>
        ) : null}
        <span className="msj-hash" aria-hidden="true">
          #
        </span>
        <div className="msj-conv__titulo">
          <b>{canal.nombre}</b>
          <span>
            {esPrivado
              ? isEquipo
                ? `Canal privado de ${item?.cliente?.nombre || canal.nombre} con el equipo`
                : 'Tu canal privado con el equipo de ATV'
              : esGrupo
                ? canal.descripcion || (isEquipo ? `Lo ven: ${(item?.roles || []).map(nombreRol).join(', ') || 'el equipo'}` : 'Canal de la comunidad ATV')
                : canal.descripcion || 'Solo publica el equipo de ATV'}
          </span>
        </div>
      </header>

      <div className="msj-lista" ref={lista} onScroll={alScrollear} role="log" aria-live="polite">
        {datos.hay_mas ? (
          <button type="button" className="msj-anteriores" onClick={cargarAnteriores} disabled={cargandoAntes}>
            {cargandoAntes ? 'Cargando…' : 'Ver mensajes anteriores'}
          </button>
        ) : (
          <div className="msj-inicio">
            <span className="msj-inicio__hash">#</span>
            <b>Este es el comienzo de #{canal.nombre}</b>
            <span>
              {esPrivado
                ? isEquipo
                  ? 'Lo ven el cliente y todo el equipo de ATV.'
                  : 'Lo ven vos, tu equipo y el equipo de ATV. Escribí acá tus dudas, avances y entregables.'
                : esGrupo
                  ? isEquipo
                    ? `Canal grupal. Lo ven: ${(item?.roles || []).map(nombreRol).join(', ') || 'el equipo'}.`
                    : 'Un espacio para hablar con el equipo y con otros clientes de ATV.'
                  : 'Novedades del equipo de ATV para todos los clientes.'}
            </span>
          </div>
        )}

        {todos.map((m, i) => {
          const previo = todos[i - 1]
          const nuevoDia = !previo || !mismoDia(previo.creado_en, m.creado_en)
          const agrupado =
            previo &&
            !nuevoDia &&
            !m.respuesta_a &&
            claveAutor(previo.autor) === claveAutor(m.autor) &&
            new Date(m.creado_en) - new Date(previo.creado_en) < AGRUPAR_MS
          const mio = claveAutor(m.autor) === yo
          const real = typeof m.id === 'number'
          return (
            <Fragment key={m.id}>
              {nuevoDia ? (
                <div className="msj-dia">
                  <span>{etiquetaDia(m.creado_en)}</span>
                </div>
              ) : null}
              <article
                className={`msj-m${agrupado ? ' is-agrupado' : ''}${m.enviando ? ' is-enviando' : ''}${m.fallo ? ' is-fallo' : ''}${
                  !mio && m.texto && ((miPrimerNombre && normal(m.texto).includes(`@${normal(miPrimerNombre)}`)) || (m.autor?.tipo === 'equipo' && ES_EVERYONE.test(m.texto))) ? ' is-mencion' : ''
                }`}
              >
                {m.respuesta_a ? (
                  <div className="msj-m__cita">
                    <span className="msj-m__codo" aria-hidden="true" />
                    <b>@{m.respuesta_a.autor_nombre}</b>
                    <span className={m.respuesta_a.texto == null ? 'is-eliminado' : ''}>{m.respuesta_a.texto ?? 'Mensaje original eliminado'}</span>
                  </div>
                ) : null}
                <div className="msj-m__fila">
                  {agrupado ? <time className="msj-m__hora-lateral">{hora(m.creado_en)}</time> : <Avatar persona={m.autor} />}
                  <div className="msj-m__cuerpo">
                    {agrupado ? null : (
                      <div className="msj-m__head">
                        <b className={m.autor.tipo === 'equipo' ? 'is-equipo' : ''}>{m.autor.nombre}</b>
                        {m.autor.tipo === 'equipo' ? <span className="msj-rol">ATV</span> : null}
                        {m.autor.miembro ? <span className="msj-insignia" title="Del equipo del cliente">{m.autor.miembro.rol_nombre}</span> : null}
                        <time dateTime={m.creado_en}>{hora(m.creado_en)}</time>
                        {m.origen === 'discord' ? <span className="msj-m__origen" title="Mensaje traído del historial de Discord">Discord</span> : null}
                      </div>
                    )}
                    {m.borrado ? (
                      <p className="msj-texto msj-texto--borrado">Mensaje borrado</p>
                    ) : editando === m.id ? (
                      <Edicion texto={m.texto} onGuardar={(t) => guardarEdicion(m, t)} onCancelar={() => setEditando(null)} />
                    ) : (
                      <>
                        {m.texto ? <TextoMensaje texto={m.texto} nombres={nombresEquipo} yo={miPrimerNombre} /> : null}
                        <Enlaces texto={m.texto} />
                        <Adjuntos adjuntos={m.adjuntos} alCargar={bajarSiEstabaAbajo} />
                      </>
                    )}
                    {m.editado && !m.borrado ? <span className="msj-editado">(editado)</span> : null}
                    {m.fallo ? (
                      <button type="button" className="msj-reintentar" onClick={() => reintentar(m)}>
                        {m.fallo}. Tocá para reintentar
                      </button>
                    ) : null}
                    {esPrivado && miUltimo && m.id === miUltimo.id && leidoPorElOtro >= m.id ? (
                      <span className="msj-visto">Visto</span>
                    ) : null}
                  </div>
                  {real && !m.borrado && datos.puede_escribir ? (
                    <div className="msj-m__acciones">
                      <button
                        type="button"
                        onClick={() => {
                          setRespondiendo(m)
                          caja.current?.focus()
                        }}
                      >
                        Responder
                      </button>
                      {mio && m.texto ? (
                        <button type="button" onClick={() => setEditando(m.id)}>
                          Editar
                        </button>
                      ) : null}
                      {mio || isAdmin ? (
                        <button type="button" onClick={() => setABorrar(m)}>
                          Eliminar
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </article>
            </Fragment>
          )
        })}
      </div>

      <div className="msj-escribiendo" aria-live="polite">
        {nombresEscribiendo.length ? (
          <>
            <span className="msj-puntos" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>
              <b>{nombresEscribiendo.map((n) => n.split(' ')[0]).join(', ')}</b>{' '}
              {nombresEscribiendo.length > 1 ? 'están escribiendo…' : 'está escribiendo…'}
            </span>
          </>
        ) : null}
      </div>

      {error ? (
        <p className="msj-error" role="alert">
          {error}
        </p>
      ) : null}

      {aBorrar ? (
        <Alerta
          titulo="¿Eliminar este mensaje?"
          texto="Se va a eliminar para todos los que están en el canal. No se puede deshacer."
          confirmar="Eliminar"
          peligro
          onConfirmar={() => borrar(aBorrar)}
          onCancelar={() => setABorrar(null)}
        />
      ) : null}

      {datos.puede_escribir ? (
        <form className="msj-redactar" onSubmit={mandar}>
          {respondiendo ? (
            <div className="msj-redactar__resp">
              <span>
                Respondiendo a <b>{respondiendo.autor.nombre}</b>
              </span>
              <button type="button" onClick={() => setRespondiendo(null)} aria-label="Cancelar respuesta">
                ✕
              </button>
            </div>
          ) : null}
          {sugerencias ? (
            <ul className="msj-sugerencias" role="listbox" aria-label="Etiquetar a alguien">
              {sugerencias.lista.map((m, i) => (
                <li key={m.id} role="option" aria-selected={i === sugerencias.indice}>
                  <button
                    type="button"
                    className={i === sugerencias.indice ? 'is-on' : ''}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      elegir(m)
                    }}
                  >
                    {m.id === 0 ? <span className="msj-everyone" aria-hidden="true">@</span> : <Avatar persona={{ ...m, tipo: m.esCliente ? 'cliente' : 'equipo' }} size={24} />}
                    <b>{m.nombre}</b>
                    <span>{m.esCliente ? m.detalle : m.area || (m.rol === 'admin' ? 'Admin' : 'Coach')}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {archivos.length ? (
            <ul className="msj-subidas">
              {archivos.map((a) => (
                <li key={a.clave} className={a.error ? 'is-error' : a.adjunto ? 'is-listo' : ''}>
                  {a.vista ? <img src={a.vista} alt="" /> : <span className="msj-subidas__ext">{(a.nombre.split('.').pop() || '').slice(0, 4).toUpperCase()}</span>}
                  <span className="msj-subidas__txt">
                    <b>{a.nombre}</b>
                    <small>{a.error ? a.error : a.adjunto ? peso(a.tamano) : `Subiendo… ${a.progreso}%`}</small>
                  </span>
                  {!a.adjunto && !a.error ? (
                    <span className="msj-subidas__barra">
                      <i style={{ width: `${a.progreso}%` }} />
                    </span>
                  ) : null}
                  <button type="button" onClick={() => quitarArchivo(a.clave)} aria-label={`Quitar ${a.nombre}`}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {restoIA ? (
            <div className="msj-ia-ayuda" role="status">
              <span>{vozAjena ? `Sugerencia en la voz de ${vozAjena}` : 'Sugerencia en tu voz'}</span>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={aceptarIA}>
                <kbd>Tab</kbd> usar
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  cancelarIA()
                  setFantasma(null)
                  descartadoIA.current = ultimoMensaje?.id ?? null
                }}
              >
                <kbd>Esc</kbd> descartar
              </button>
            </div>
          ) : null}
          {grabando ? (
            <div className="msj-redactar__caja is-grabando">
              <GrabarAudio onMandar={mandarAudio} onCerrar={cerrarGrabacion} />
            </div>
          ) : (
          <div className="msj-redactar__caja">
            <input
              ref={selector}
              type="file"
              multiple
              accept={isEquipo ? ACEPTA_ADJUNTOS.replace(/,\.(mp3|m4a|ogg|wav|webm)/g, '') : ACEPTA_ADJUNTOS}
              hidden
              onChange={(e) => {
                agregarArchivos(e.target.files)
                e.target.value = ''
              }}
            />
            <button type="button" className="msj-clip" onClick={() => selector.current?.click()} aria-label="Adjuntar archivos" title="Adjuntar archivos (hasta 25 MB)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9" />
              </svg>
            </button>
            <label htmlFor="msj-texto" className="sr-only">
              Mensaje para #{canal.nombre}
            </label>
            <div className="msj-campo" ref={campo}>
              <div className="msj-fantasma" aria-hidden="true">
                {texto}
                {restoIA ? <span className="msj-fantasma__ia">{restoIA}</span> : null}
                {!texto && fantasma?.cargando && !restoIA ? <span className="msj-fantasma__pensando">Pensando una respuesta en tu voz…</span> : null}
                {'\u200b'}
              </div>
              <textarea
                id="msj-texto"
                ref={caja}
                rows={1}
                value={texto}
                onChange={alEscribir}
                onKeyDown={teclas}
                onPaste={alPegar}
                onClick={(e) => e.target.selectionStart !== texto.length && setFantasma(null)}
                placeholder={fantasma ? '' : `Escribí en #${canal.nombre} · @ para etiquetar`}
                maxLength={4000}
              />
            </div>
            {!isEquipo && puedeGrabar() && !texto.trim() && !listos.length && !subiendo ? (
              <button type="button" className="msj-enviar is-mic" onClick={() => setGrabando(true)} aria-label="Grabar nota de voz" title="Grabar nota de voz">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                </svg>
              </button>
            ) : (
              <button type="submit" className="msj-enviar" disabled={subiendo || (!texto.trim() && !listos.length)} aria-label={subiendo ? 'Esperá a que terminen de subir los archivos' : 'Enviar'}>
              ➤
            </button>
            )}
          </div>
          )}
        </form>
      ) : (
        <p className="msj-solo-lectura">En este canal publica solo el equipo de ATV.</p>
      )}
    </section>
  )
}

function Edicion({ texto, onGuardar, onCancelar }) {
  const [valor, setValor] = useState(texto)
  return (
    <div className="msj-edicion">
      <textarea
        autoFocus
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onGuardar(valor)
          } else if (e.key === 'Escape') onCancelar()
        }}
        maxLength={4000}
      />
      <span>
        Enter guarda · Esc cancela{' '}
        <button type="button" onClick={() => onGuardar(valor)}>
          Guardar
        </button>
      </span>
    </div>
  )
}
