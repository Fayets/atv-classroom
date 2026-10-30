import { createPortal } from 'react-dom'
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { borrarMensaje, editarMensaje, reaccionar, enviarMensaje, fetchEquipoChat, fetchMensajes, fetchParticipantes, marcarLeido, marcarSugerenciaEnviada, marcarSugerenciaUsada, pedirSugerencia, subirAdjunto } from '../../api/mensajes'
import { fetchVoz } from '../../api/cuenta'
import { useAuth } from '../../context/AuthContext'
import { useMensajeria } from '../../context/MensajeriaContext'
import { pedirCartelPausa } from '../Pausa'
import { ACEPTA_ADJUNTOS, ES_EVERYONE, claveAutor, claveGrupo, etiquetaDia, hora, mismoDia, nombreRol, normal, peso, primerNombre } from '../../utils/mensajes'
import Adjuntos from './Adjuntos'
import Alerta from './Alerta'
import Avatar from './Avatar'
import Enlaces from './Enlaces'
import GrabarAudio, { puedeGrabar } from './GrabarAudio'
import SelectorEmojis from './SelectorEmojis'
import TextoMensaje from './TextoMensaje'
import VistoPor from './VistoPor'
import { buscarAtajos, conEmojis } from '../../utils/emojis'

const AGRUPAR_MS = 5 * 60 * 1000
// Sugerencias con la caja vacía ya pedidas, por chat: volver a un chat no paga otra.
const cacheVacio = new Map() // canalId → { mensaje, fantasma }
const SEGUIMIENTO_DESPUES_MS = 60 * 60 * 1000 // si escribiste vos último, la sugerencia de seguimiento aparece pasada una hora
let temporal = 0

// Las reacciones de un toque, como las frecuentes de Discord.
const EMOJIS = ['👍', '❤️', '🔥', '🙌', '👏', '😂', '🎉', '💪', '👀', '🙏', '✅', '🚀']
const PRESION_MS = 450 // en el celular, mantener apretado un mensaje abre sus opciones; las reacciones van por su botón
// Celu/tablet: ahí mantener apretado es nuestro menú, no la selección de texto del sistema.
const TACTIL = typeof window !== 'undefined' && window.matchMedia?.('(hover: none) and (pointer: coarse)').matches

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
  // Por hora, como el servidor: el historial de Discord tiene ids negativos y puede ser más nuevo.
  const orden = (a, b) => (a.creado_en === b.creado_en ? a.id - b.id : a.creado_en < b.creado_en ? -1 : 1)
  return sumar.length ? [...lista, ...sumar].sort(orden) : lista
}

export default function Conversacion({ canalId, item, onVolver, oculta = false, perfilDe, canales, onAbrirCanal, alPensar }) {
  const { user, isEquipo, isAdmin } = useAuth()
  const { suscribir, avisarEscribiendo, conectado, avisarLeido, canalAbierto } = useMensajeria()
  const [datos, setDatos] = useState(null)
  // En el celular la ayuda del @ no entra en una línea: queda solo el nombre del canal.
  const [angosto] = useState(() => window.matchMedia('(max-width: 600px)').matches)
  const [mensajes, setMensajes] = useState([])
  const [pendientes, setPendientes] = useState([])
  const [error, setError] = useState('')
  const [texto, setTexto] = useState('')
  const [respondiendo, setRespondiendo] = useState(null)
  const [editando, setEditando] = useState(null)
  const [escriben, setEscriben] = useState({})
  const [cargandoAntes, setCargandoAntes] = useState(false)
  // Lejos del último mensaje: aparece el botón para volver abajo (con los nuevos que llegaron mientras tanto).
  const [lejos, setLejos] = useState(false)
  const [nuevosAbajo, setNuevosAbajo] = useState(0)
  const lejosRef = useRef(false)
  const [aBorrar, setABorrar] = useState(null)
  const [vistoPor, setVistoPor] = useState(null) // id del mensaje del que un admin mira quién lo leyó
  const [equipo, setEquipo] = useState([])
  const [sugerencias, setSugerencias] = useState(null) // { lista, indice, desde }
  const [atajos, setAtajos] = useState(null) // ":fu" → { lista, indice, desde }, como en Discord
  const [verEmojis, setVerEmojis] = useState(false)
  const mencionados = useRef(new Map()) // "@Nombre" escrito → id del miembro
  const [archivos, setArchivos] = useState([]) // { clave, nombre, tamano, progreso, adjunto, error, vista }
  const [arrastrando, setArrastrando] = useState(false)
  const selector = useRef(null)
  const lista = useRef(null)
  const caja = useRef(null)
  const pegadoAbajo = useRef(true)
  const ultimoVisto = useRef(null)   // el último mensaje que ya estaba en la lista
  const altoPrevio = useRef(null)    // alto de la lista en el dibujo anterior
  const centinela = useRef(null)      // la marca de arriba de todo: al verse, se traen los anteriores
  const cargandoRef = useRef(false)   // el mismo candado que cargandoAntes, pero sin esperar al render
  const traerAnteriores = useRef(null)
  const leidoEnviado = useRef(0)
  const ultimoAvisoEscribiendo = useRef(0)
  // El equipo del cliente comparte la cuenta del titular: cada uno es "yo" por su id de miembro.
  const yo = isEquipo ? `equipo:${user?.usuario_id}` : user?.miembro ? `miembro:${user.miembro.id}` : `cliente:${user?.usuario_id}`
  // Quién reacciona: cada persona del equipo del cliente por su lado (comparten cuenta, no reacción).
  const yoReaccion = isEquipo ? yo : user?.miembro ? `miembro:${user.miembro.id}` : yo
  const [eligiendo, setEligiendo] = useState(null) // id del mensaje con el selector de emojis abierto
  const [opciones, setOpciones] = useState(null) // celu: mensaje que se mantuvo apretado (hoja de opciones)
  const [perfil, setPerfil] = useState(null) // { autor, caja }: la tarjeta de quien escribió, como en Discord
  const verPerfil = (e, autor) => {
    e.stopPropagation()
    setPerfil({ autor, caja: e.currentTarget.getBoundingClientRect() })
  }
  const presion = useRef(null)
  const presionHecha = useRef(false)
  useEffect(() => {
    if (eligiendo == null) return undefined
    const cerrar = (e) => {
      if (!e.target.closest?.('.msj-reac-elegir, .msj-reac-abrir, .msj-m__acciones')) setEligiendo(null)
    }
    document.addEventListener('pointerdown', cerrar)
    return () => document.removeEventListener('pointerdown', cerrar)
  }, [eligiendo])
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
    ultimoVisto.current = null
    altoPrevio.current = null
    lejosRef.current = false
    setLejos(false)
    setNuevosAbajo(0)
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
        } else if (ev.tipo === 'reacciones' && ev.canal_id === canalId) {
          setMensajes((m) => m.map((x) => (x.id === ev.mensaje_id ? { ...x, reacciones: ev.reacciones } : x)))
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

  // La lista está anclada abajo (column-reverse): scrollTop 0 es abajo de todo y subir es negativo.
  // Así los anteriores se suman arriba sin tocar el scroll; antes se corregía a mano y en el iPhone
  // eso cortaba la inercia del dedo y la lista pegaba un salto.
  useLayoutEffect(() => {
    const el = lista.current
    if (!el) return
    const ultimo = mensajes[mensajes.length - 1]?.id ?? null
    const llegoAbajo = ultimo !== ultimoVisto.current && altoPrevio.current !== null
    if (pegadoAbajo.current) {
      el.scrollTop = 0
    } else if (llegoAbajo) {
      // Entró un mensaje nuevo mientras leías más arriba: lo que estabas leyendo no se mueve.
      el.scrollTop -= el.scrollHeight - altoPrevio.current
      if (lejosRef.current) setNuevosAbajo((n) => n + 1)
    }
    ultimoVisto.current = ultimo
    altoPrevio.current = el.scrollHeight
  }, [mensajes, pendientes, datos])

  // Lo que llega a este canal mientras está a la vista no suma al contador de no leídos.
  useEffect(() => {
    if (oculta) return undefined
    canalAbierto.current = canalId
    return () => {
      if (canalAbierto.current === canalId) canalAbierto.current = null
    }
  }, [canalId, oculta, canalAbierto])

  // Marca como leído lo último que ves, si la pestaña está a la vista. La primera vez (lo que ya
  // estaba sin leer al abrir) y al volver a la pestaña avisa para que bajen el contador y la fila;
  // lo que llega mirando el canal nunca se contó como no leído.
  const estuvoOculta = useRef(false)
  useEffect(() => {
    const anotar = () => {
      if (document.hidden) estuvoOculta.current = true
    }
    document.addEventListener('visibilitychange', anotar)
    return () => document.removeEventListener('visibilitychange', anotar)
  }, [])
  const marcar = useCallback(() => {
    const ultimo = mensajes[mensajes.length - 1]
    if (!ultimo || oculta || document.hidden || ultimo.id <= leidoEnviado.current) return
    const avisar = leidoEnviado.current === 0 || estuvoOculta.current
    estuvoOculta.current = false
    leidoEnviado.current = ultimo.id
    marcarLeido(canalId, ultimo.id)
      .then(() => avisar && avisarLeido(canalId))
      .catch(() => {
        leidoEnviado.current = 0
      })
  }, [mensajes, canalId, oculta, avisarLeido])

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
  // La última sugerencia aceptada con Tab: al mandar, lo que salió se compara con lo que propuso la IA.
  const aceptadaIA = useRef(null)
  const campo = useRef(null)
  const iaActiva = Boolean(isEquipo && datos?.canal?.tipo === 'cliente')
  // En #updates cada bloque "@Persona …" lleva una barra a la izquierda (lo pidió Mauri; en los chats no).
  const esUpdates = datos?.canal?.tipo === 'grupo' && /updates/i.test(datos?.canal?.nombre || '')

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
        alPorque: (porque) => setFantasma((f) => (mismo(f) ? { ...f, porque } : f)),
        alPedazo: (t) => setFantasma((f) => (mismo(f) ? { ...f, texto: t } : f)),
      })
        .then(({ id, texto: t, porque }) => {
          const lista = { id, base, texto: t, cargando: false, porque }
          if (!base && t) cacheVacio.set(canalId, { mensaje: vacioPedido.current, fantasma: lista })
          setFantasma((f) => (mismo(f) ? lista : f))
        })
        .catch(() => setFantasma((f) => (mismo(f) ? null : f)))
    },
    [canalId, cancelarIA],
  )

  // Cambio de canal o se cierra: nada de sugerencias colgadas.
  useEffect(() => {
    setAtajos(null)
    setVerEmojis(false)
    setFantasma(null)
    vacioPedido.current = null
    descartadoIA.current = null
    aceptadaIA.current = null
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
  // El panel de la derecha muestra qué pensó el Tab y deja corregirlo; "otra" pide una sugerencia nueva
  // (ya con la regla nueva) para lo que esté escrito ahora.
  const textoActual = useRef('')
  textoActual.current = texto
  useEffect(() => {
    if (!alPensar) return
    if (!fantasma?.porque) {
      alPensar(null)
      return
    }
    alPensar({
      ...fantasma.porque,
      sugerencia: fantasma.base + fantasma.texto,
      cargando: fantasma.cargando,
      otra: () => {
        cacheVacio.delete(canalId)
        pedirIA(textoActual.current)
      },
    })
  }, [fantasma, alPensar, canalId, pedirIA])
  useEffect(() => () => alPensar?.(null), [alPensar])

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
    if (fantasma?.id) {
      marcarSugerenciaUsada(fantasma.id)
      aceptadaIA.current = fantasma.id
    }
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
    if (pegadoAbajo.current && lista.current) lista.current.scrollTop = 0
  }

  function alScrollear() {
    const el = lista.current
    pegadoAbajo.current = -el.scrollTop < 80
    altoPrevio.current = el.scrollHeight
    // Solo cambia el estado al cruzar el umbral, no en cada cuadro del scroll.
    const ahora = -el.scrollTop > el.clientHeight * 1.2
    if (ahora !== lejosRef.current) {
      lejosRef.current = ahora
      setLejos(ahora)
    }
    if (pegadoAbajo.current) setNuevosAbajo((n) => (n ? 0 : n))
  }

  function irAlFinal() {
    const el = lista.current
    if (!el) return
    pegadoAbajo.current = true
    setNuevosAbajo(0)
    // Desde muy arriba, primero un salto cerca del final: si no, la animación se hace eterna.
    if (-el.scrollTop > el.clientHeight * 6) el.scrollTop = -el.clientHeight * 2
    el.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }

  async function cargarAnteriores() {
    // El candado va en un ref: el observador puede disparar dos veces antes de que React
    // vuelva a dibujar, y con el estado solo se pedía dos veces el mismo tramo.
    if (!mensajes.length || cargandoRef.current) return
    cargandoRef.current = true
    setCargandoAntes(true)
    try {
      const r = await fetchMensajes(canalId, { antesDe: mensajes[0].id })
      setMensajes((m) => [...r.mensajes, ...m])
      setDatos((d) => ({ ...d, hay_mas: r.hay_mas }))
    } catch (err) {
      setError(err.message)
    } finally {
      cargandoRef.current = false
      setCargandoAntes(false)
    }
  }

  // Tocar la cita lleva al mensaje original: si es viejo y no está cargado, va trayendo los anteriores
  // hasta encontrarlo (con tope), lo centra y lo resalta un momento.
  const [resaltado, setResaltado] = useState(null)
  const hayMasRef = useRef(false)
  hayMasRef.current = Boolean(datos?.hay_mas)
  async function irAlMensaje(id) {
    for (let intento = 0; intento < 15; intento++) {
      const el = lista.current?.querySelector(`[data-mid="${id}"]`)
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        setResaltado(id)
        setTimeout(() => setResaltado((r) => (r === id ? null : r)), 2000)
        return
      }
      if (!hayMasRef.current) return
      await traerAnteriores.current?.()
      await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)))
    }
  }

  // Siempre la última versión de la función, para que el observador no haya que rearmarlo
  // en cada mensaje nuevo (y no quede llamando a una versión vieja).
  useEffect(() => {
    traerAnteriores.current = cargarAnteriores
  })

  // Scroll infinito: cuando la marca de arriba se asoma, se traen los anteriores solos.
  // Con IntersectionObserver y no mirando el scroll en cada cuadro, que a 240 Hz se nota.
  // El margen de 400 px los pide un poco antes de llegar al tope: no se ve el salto.
  useEffect(() => {
    const marca = centinela.current
    if (!marca || !lista.current) return undefined
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) traerAnteriores.current?.()
      },
      { root: lista.current, rootMargin: '400px 0px 0px 0px' },
    )
    observador.observe(marca)
    return () => observador.disconnect()
    // datos arranca en null (hay un early return más abajo), pero los efectos corren igual:
    // sin el ?. esto tiraba al montar y dejaba la pantalla en blanco.
  }, [canalId, datos?.hay_mas])

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
    const limpio = conEmojis(texto.trim())
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
    setAtajos(null)
    setVerEmojis(false)
    cancelarIA()
    setFantasma(null)
    setPendientes((p) => [...p, provisorio])
    setTexto('')
    // En el celular el teclado queda abierto para seguir escribiendo (antes se cerraba con cada envío).
    caja.current?.focus()
    ultimoAvisoEscribiendo.current = 0
    setRespondiendo(null)
    pegadoAbajo.current = true
    try {
      const aceptada = aceptadaIA.current
      aceptadaIA.current = null
      const real = await enviarMensaje(canalId, limpio, provisorio.respuesta_a?.id ?? null, ids, adjuntosIds)
      if (aceptada && real?.id) marcarSugerenciaEnviada(aceptada, real.id)
      setMensajes((m) => agregarSinDuplicar(m, [real]))
      setPendientes((p) => p.filter((x) => x.id !== id))
    } catch (err) {
      setPendientes((p) => p.map((x) => (x.id === id ? { ...x, enviando: false, fallo: err.message || 'No se envió' } : x)))
    }
  }

  // Nota de voz: se sube y se manda sola, con el mensaje provisorio mientras tanto.
  const [grabando, setGrabando] = useState(false)
  const cerrarGrabacion = useCallback(() => setGrabando(false), [])
  const cerrarEmojis = useCallback(() => setVerEmojis(false), [])
  const mandarAudio = useCallback(
    async (archivo) => {
      setGrabando(false)
      const id = `tmp-${++temporal}`
      const respuestaA = respondiendo ? { id: respondiendo.id, autor_nombre: respondiendo.autor.nombre, texto: respondiendo.texto } : null
      setPendientes((p) => [
        ...p,
        { id, texto: '🎙️ Nota de voz…', autor: { tipo: isEquipo ? 'equipo' : 'cliente', id: user.usuario_id, nombre: user.nombre, foto_url: user.foto_url }, respuesta_a: respuestaA, adjuntos: [], creado_en: new Date().toISOString(), enviando: true },
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
    [canalId, respondiendo, user, isEquipo],
  )

  function reintentar(p) {
    setPendientes((lista) => lista.filter((x) => x.id !== p.id))
    setTexto(p.texto)
    caja.current?.focus()
  }

  function buscarSugerencias(valor, caret) {
    const antes = valor.slice(0, caret)
    const atajo = antes.match(/(^|\s):([a-z0-9_+-]{2,30})$/i)
    const hayAtajos = atajo ? buscarAtajos(atajo[2]) : []
    setAtajos(hayAtajos.length ? { lista: hayAtajos, indice: 0, desde: caret - atajo[2].length - 1 } : null)
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
    // Si el primer nombre se repite (Franco del equipo y Franco Ascurra cliente), va el nombre completo.
    const primero = primerNombre(miembro.nombre)
    const repetido = [...equipo, ...participantes].filter((p) => normal(primerNombre(p.nombre)) === normal(primero)).length > 1
    // Del lado del cliente va el nombre como aparece ("@Pedro Gamez"); del equipo, el primero salvo que se repita.
    const completo = miembro.nombre.trim()
    const marca = `@${(miembro.esCliente || repetido) && completo.includes(' ') ? completo : primero}`
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

  function ponerEnElTexto(desde, hasta, emoji) {
    const el = caja.current
    setTexto((t) => `${t.slice(0, desde)}${emoji}${t.slice(hasta)}`)
    requestAnimationFrame(() => {
      const pos = desde + emoji.length
      el?.focus()
      el?.setSelectionRange(pos, pos)
    })
  }

  function elegirAtajo(a) {
    const caret = caja.current?.selectionStart ?? texto.length
    ponerEnElTexto(atajos?.desde ?? caret, caret, a.emoji)
    setAtajos(null)
  }

  function insertarEmoji(emoji) {
    const el = caja.current
    ponerEnElTexto(el?.selectionStart ?? texto.length, el?.selectionEnd ?? texto.length, emoji)
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
      aceptadaIA.current = null // borró todo: lo que mande después ya no es una corrección de la sugerencia
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
    if (atajos) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const paso = e.key === 'ArrowDown' ? 1 : -1
        setAtajos((a) => ({ ...a, indice: (a.indice + paso + a.lista.length) % a.lista.length }))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        elegirAtajo(atajos.lista[atajos.indice])
        return
      }
      if (e.key === 'Escape') {
        setAtajos(null)
        return
      }
    }
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
    const limpio = conEmojis(nuevo.trim())
    setEditando(null)
    if (!limpio || limpio === m.texto) return
    try {
      const r = await editarMensaje(m.id, limpio)
      setMensajes((lista) => lista.map((x) => (x.id === r.id ? r : x)))
    } catch (err) {
      setError(err.message)
    }
  }

  async function alternarReaccion(m, emoji) {
    setEligiendo(null)
    // Al instante en pantalla; la respuesta del servidor (y el evento en vivo) deja la versión buena.
    const quitar = (m.reacciones || []).some((r) => r.emoji === emoji && r.quienes.includes(yoReaccion))
    const local = (lista) => {
      const sin = lista.map((r) => (r.emoji === emoji ? { ...r, quienes: r.quienes.filter((q) => q !== yoReaccion) } : r))
      const con = sin.some((r) => r.emoji === emoji)
        ? sin.map((r) => (r.emoji === emoji ? { ...r, quienes: [...r.quienes, yoReaccion], nombres: [...r.nombres, 'Vos'] } : r))
        : [...sin, { emoji, quienes: [yoReaccion], nombres: ['Vos'] }]
      return (quitar ? sin : con).filter((r) => r.quienes.length)
    }
    setMensajes((lista) => lista.map((x) => (x.id === m.id ? { ...x, reacciones: local(x.reacciones || []) } : x)))
    try {
      const r = await reaccionar(m.id, emoji)
      setMensajes((lista) => lista.map((x) => (x.id === r.mensaje_id ? { ...x, reacciones: r.reacciones } : x)))
    } catch (err) {
      setMensajes((lista) => lista.map((x) => (x.id === m.id ? { ...x, reacciones: m.reacciones } : x)))
      setError(err.message)
    }
  }

  function empezarPresion(m) {
    clearTimeout(presion.current)
    presion.current = setTimeout(() => {
      navigator.vibrate?.(10)
      presionHecha.current = true
      setOpciones(m)
    }, PRESION_MS)
  }
  const soltarPresion = (e) => {
    clearTimeout(presion.current)
    // Al soltar después de abrir la hoja, el toque no tiene que caer en un botón de la hoja.
    if (presionHecha.current && e?.type === 'touchend') e.preventDefault()
    presionHecha.current = false
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
  // 2K: su chat es solo para pedir las sesiones 1 a 1 (los coaches no dan consultas por acá).
  const solo1a1 = esPrivado && !isEquipo && (user?.permisos?.chat ?? (user?.rol === '2k' ? '1a1' : 'si')) === '1a1'
  const esGrupo = canal.tipo === 'grupo'
  // Privado entre clientes: se ve como un directo, pero con otro cliente (y el equipo de ATV no lo ve).
  const entreClientes = canal.tipo === 'privado'
  // dm: alguien del equipo con un cliente, solo ellos dos.
  const conCliente = canal.tipo === 'dm'
  const esDirecto = canal.tipo === 'directo' || entreClientes || conCliente
  const tipoDelOtro = entreClientes ? 'cliente' : conCliente ? item?.con?.tipo || (isEquipo ? 'cliente' : 'equipo') : 'equipo'
  // "Visto": hasta dónde leyó el otro lado, sobre mi último mensaje.
  const leidoPorElOtro = isEquipo ? datos.lecturas.cliente : datos.lecturas.equipo
  const miUltimo = [...mensajes].reverse().find((m) => claveAutor(m.autor) === yo)
  const nombresEscribiendo = Object.keys(escriben).filter((n) => n !== user?.nombre)
  const nombresEquipo = new Set([...equipo, ...participantes].map((m) => normal(primerNombre(m.nombre))))
  // Quién es quién en las etiquetas: nombre completo → equipo o cliente (para pintarlas distinto).
  const personasChat = [...equipo.map((m) => ({ nombre: m.nombre, tipo: 'equipo' })), ...participantes.map((p) => ({ nombre: p.nombre, tipo: 'cliente' }))]
  const miPrimerNombre = primerNombre(user?.nombre) // al cliente también se le resalta cuando lo etiquetan
  // Al equipo, solo lo que el servidor guardó como etiqueta suya: "@Franco" puede ser el cliente Franco Ascurra.
  // Al cliente (no recibe etiquetas guardadas), por su nombre.
  const meNombra = (m) =>
    isEquipo ? (m.menciones || []).includes(user?.usuario_id) : Boolean(miPrimerNombre && normal(m.texto || '').includes(`@${normal(miPrimerNombre)}`))

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
        {esDirecto ? (
          <Avatar persona={{ tipo: tipoDelOtro, nombre: canal.nombre, foto_url: item?.con?.foto_url }} size={30} />
        ) : (
          <span className="msj-hash" aria-hidden="true">
            #
          </span>
        )}
        <div className="msj-conv__titulo">
          <b>{canal.nombre}</b>
          <span>
            {entreClientes || conCliente
              ? 'Mensaje privado · solo lo ven ustedes dos'
              : esDirecto
              ? 'Mensaje directo · solo lo ven ustedes dos'
              : esPrivado
              ? isEquipo
                ? `Canal privado de ${item?.cliente?.nombre || canal.nombre} con el equipo`
                : 'Tu canal privado con el equipo de ATV'
              : esGrupo
                ? canal.descripcion || (isEquipo ? `Lo ven: ${(item?.roles || []).map(nombreRol).join(', ') || 'el equipo'}` : 'Canal de la comunidad ATV')
                : canal.descripcion || 'Solo publica el equipo de ATV'}
          </span>
        </div>
      </header>

      <div className="msj-lista-marco">
        <div className="msj-lista" ref={lista} onScroll={alScrollear} role="log" aria-live="polite">
        <div className="msj-lista__contenido">
        {datos.hay_mas ? (
          <div className="msj-anteriores" ref={centinela}>
            <span className={cargandoAntes ? 'msj-anteriores__punto is-cargando' : 'msj-anteriores__punto'} />
          </div>
        ) : (
          <div className="msj-inicio">
            {esDirecto ? (
              <Avatar persona={{ tipo: tipoDelOtro, nombre: canal.nombre, foto_url: item?.con?.foto_url }} size={56} />
            ) : (
              <span className="msj-inicio__hash">#</span>
            )}
            <b>{esDirecto ? `Este es el comienzo de tu conversación con ${canal.nombre}` : `Este es el comienzo de #${canal.nombre}`}</b>
            <span>
              {conCliente
                ? isEquipo
                  ? 'Solo lo ven ustedes dos (y el equipo del cliente, que comparte su cuenta). El resto del equipo de ATV no.'
                  : 'Solo lo ven ustedes dos (y tu equipo). El resto del equipo de ATV no.'
                : entreClientes
                ? 'Solo lo ven ustedes dos (y sus equipos). El equipo de ATV no lo ve.'
                : esDirecto
                ? 'Solo lo ven ustedes dos: ni el resto del equipo ni los clientes.'
                : esPrivado
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

        {todos.map((m, i, lista) => {
          const previo = todos[i - 1]
          const nuevoDia = !previo || !mismoDia(previo.creado_en, m.creado_en)
          const agrupado =
            previo &&
            !nuevoDia &&
            !m.respuesta_a &&
            claveGrupo(previo.autor) === claveGrupo(m.autor) &&
            new Date(m.creado_en) - new Date(previo.creado_en) < AGRUPAR_MS
          const mio = claveAutor(m.autor) === yo
          const real = typeof m.id === 'number'
          // En la PC los bloques (un mensaje con sus seguidos) se alternan con un fondo apenas distinto.
          lista.bloque = i === 0 ? 0 : lista.bloque + (agrupado ? 0 : 1)
          const par = lista.bloque % 2 === 1
          return (
            <Fragment key={m.id}>
              {nuevoDia ? (
                <div className="msj-dia">
                  <span>{etiquetaDia(m.creado_en)}</span>
                </div>
              ) : null}
              <article
                data-mid={m.id}
                onTouchStart={real && !m.borrado ? () => empezarPresion(m) : undefined}
                onTouchMove={soltarPresion}
                onTouchEnd={soltarPresion}
                onTouchCancel={soltarPresion}
                onContextMenu={TACTIL ? (e) => e.preventDefault() : undefined}
                className={`msj-m${resaltado === m.id ? ' is-resaltado' : ''}${eligiendo === m.id ? ' is-eligiendo' : ''}${agrupado ? ' is-agrupado' : ''}${par ? ' is-par' : ''}${m.enviando ? ' is-enviando' : ''}${m.fallo ? ' is-fallo' : ''}${
                  !mio && m.texto && (meNombra(m) || (m.autor?.tipo === 'equipo' && ES_EVERYONE.test(m.texto))) ? ' is-mencion' : ''
                }`}
              >
                {m.respuesta_a ? (
                  <div
                    className="msj-m__cita is-link"
                    role="button"
                    tabIndex={0}
                    title="Ir al mensaje"
                    onClick={() => irAlMensaje(m.respuesta_a.id)}
                    onKeyDown={(e) => e.key === 'Enter' && irAlMensaje(m.respuesta_a.id)}
                  >
                    <span className="msj-m__codo" aria-hidden="true" />
                    <b>@{m.respuesta_a.autor_nombre}</b>
                    <span className={m.respuesta_a.texto == null ? 'is-eliminado' : ''}>{m.respuesta_a.texto ?? 'Mensaje original eliminado'}</span>
                  </div>
                ) : null}
                <div className="msj-m__fila">
                  {agrupado ? (
                    <time className="msj-m__hora-lateral">{hora(m.creado_en)}</time>
                  ) : (
                    <button type="button" className="msj-m__quien" onClick={(e) => verPerfil(e, m.autor)} aria-label={`Ver el perfil de ${m.autor.nombre}`}>
                      <Avatar persona={m.autor} />
                    </button>
                  )}
                  <div className="msj-m__cuerpo">
                    {agrupado ? null : (
                      <div className="msj-m__head">
                        <b className={`msj-m__nombre${m.autor.tipo === 'equipo' ? ' is-equipo' : ''}`} role="button" tabIndex={0} onClick={(e) => verPerfil(e, m.autor)} onKeyDown={(e) => e.key === 'Enter' && verPerfil(e, m.autor)}>
                          {m.autor.nombre}
                        </b>
                        {m.autor.tipo === 'equipo' ? <span className="msj-rol">ATV</span> : null}
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
                        {m.texto ? <TextoMensaje texto={m.texto} nombres={nombresEquipo} personas={personasChat} yo={meNombra(m) ? miPrimerNombre : null} canales={canales} onAbrirCanal={onAbrirCanal} secciones={esUpdates} /> : null}
                        <Enlaces texto={m.texto} />
                        <Adjuntos adjuntos={m.adjuntos} alCargar={bajarSiEstabaAbajo} />
                      </>
                    )}
                    {m.editado && !m.borrado ? <span className="msj-editado">(editado)</span> : null}
                    {real && !m.borrado && m.reacciones?.length ? (
                      <div className="msj-reacciones">
                        {m.reacciones.map((r) => {
                          const mia = r.quienes.includes(yoReaccion)
                          return (
                            <button
                              key={r.emoji}
                              type="button"
                              className={`msj-reac${mia ? ' is-mia' : ''}`}
                              title={r.nombres.join(', ')}
                              aria-pressed={mia}
                              onClick={() => alternarReaccion(m, r.emoji)}
                            >
                              <span>{r.emoji}</span>
                              <b>{r.quienes.length}</b>
                            </button>
                          )
                        })}
                        <button type="button" className="msj-reac msj-reac-abrir" aria-label="Agregar reacción" onClick={() => setEligiendo(eligiendo === m.id ? null : m.id)}>
                          <CaraMas />
                        </button>
                      </div>
                    ) : null}
                    {m.fallo ? (
                      <button type="button" className="msj-reintentar" onClick={() => reintentar(m)}>
                        {m.fallo}. Tocá para reintentar
                      </button>
                    ) : null}
                    {esPrivado && miUltimo && m.id === miUltimo.id && leidoPorElOtro >= m.id ? (
                      <span className="msj-visto">Visto</span>
                    ) : null}
                  </div>
                  {eligiendo === m.id ? (
                    <div className="msj-reac-elegir" role="menu" aria-label="Reaccionar">
                      {EMOJIS.map((e) => (
                        <button key={e} type="button" role="menuitem" onClick={() => alternarReaccion(m, e)}>
                          {e}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {real && !m.borrado ? (
                    <div className="msj-m__acciones">
                      <button type="button" className="msj-reac-abrir" aria-label="Reaccionar" title="Reaccionar" onClick={() => setEligiendo(eligiendo === m.id ? null : m.id)}>
                        <CaraMas />
                      </button>
                      {datos.puede_escribir ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEligiendo(null)
                            setRespondiendo(m)
                            caja.current?.focus()
                          }}
                        >
                          Responder
                        </button>
                      ) : null}
                      {mio && m.texto && datos.puede_escribir ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEligiendo(null)
                            setEditando(m.id)
                          }}
                        >
                          Editar
                        </button>
                      ) : null}
                      {isAdmin && typeof m.id === 'number' ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEligiendo(null)
                            setVistoPor(m.id)
                          }}
                        >
                          Visto por
                        </button>
                      ) : null}
                      {(mio || isAdmin) && datos.puede_escribir ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEligiendo(null)
                            setABorrar(m)
                          }}
                        >
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
        </div>
        {lejos ? (
          <button type="button" className="msj-al-final" onClick={irAlFinal} aria-label={nuevosAbajo ? `${nuevosAbajo} mensajes nuevos: ir al último` : 'Ir al último mensaje'}>
            {nuevosAbajo ? <span className="msj-al-final__n">{nuevosAbajo > 99 ? '99+' : nuevosAbajo}</span> : null}
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
          </button>
        ) : null}
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

      {vistoPor ? <VistoPor mensajeId={vistoPor} onCerrar={() => setVistoPor(null)} /> : null}

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

      {user?.pausa && !isEquipo ? (
        <button type="button" className="msj-pausa" onClick={pedirCartelPausa}>
          <span>{user.motivo_pausa === 'vencido' ? <>Tu acceso <b>venció</b></> : user.motivo_pausa === 'inactivo' ? <>Tu cuenta está <b>inactiva</b></> : <>Tu programa está en <b>pausa</b></>}: para escribir, comunicate con {user.contacto_pausa?.nombre || 'Lucas'}.</span>
          <span>Ver cómo</span>
        </button>
      ) : datos.puede_escribir ? (
        <>
        {solo1a1 ? <p className="msj-aviso-1a1">Este chat es para pedir tus sesiones 1 a 1. Las consultas las trabajamos en la sesión.</p> : null}
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
          {atajos ? (
            <ul className="msj-sugerencias is-emojis" role="listbox" aria-label="Emojis">
              {atajos.lista.map((a, i) => (
                <li key={a.codigo} role="option" aria-selected={i === atajos.indice}>
                  <button
                    type="button"
                    className={i === atajos.indice ? 'is-on' : ''}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      elegirAtajo(a)
                    }}
                  >
                    <i aria-hidden="true">{a.emoji}</i>
                    <b>:{a.codigo}:</b>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {verEmojis ? <SelectorEmojis onElegir={insertarEmoji} onCerrar={cerrarEmojis} /> : null}
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
                      <i style={{ transform: `scaleX(${(a.progreso || 0) / 100})` }} />
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
                placeholder={fantasma ? '' : solo1a1 ? 'Pedí tu sesión 1 a 1' : esDirecto ? `Escribile a ${canal.nombre.split(' ')[0]}` : angosto ? `Escribí en #${canal.nombre}` : `Escribí en #${canal.nombre} · @ para etiquetar`}
                maxLength={4000}
              />
            </div>
            <button
              type="button"
              className={`msj-clip msj-emoji-abrir${verEmojis ? ' is-on' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setVerEmojis((v) => !v)}
              aria-label="Emojis"
              aria-expanded={verEmojis}
              title="Emojis"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01" />
              </svg>
            </button>
            {puedeGrabar() && !texto.trim() && !listos.length && !subiendo ? (
              <button type="button" className="msj-enviar is-mic" onMouseDown={(e) => e.preventDefault()} onPointerDown={(e) => e.preventDefault()} onClick={() => setGrabando(true)} aria-label="Grabar nota de voz" title="Grabar nota de voz">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                </svg>
              </button>
            ) : (
              <button type="submit" className="msj-enviar" onMouseDown={(e) => e.preventDefault()} onPointerDown={(e) => e.preventDefault()} disabled={subiendo || (!texto.trim() && !listos.length)} aria-label={subiendo ? 'Esperá a que terminen de subir los archivos' : 'Enviar'}>
              ➤
            </button>
            )}
          </div>
          )}
        </form>
        </>
      ) : (
        <p className="msj-solo-lectura">En este canal publica solo el equipo de ATV.</p>
      )}
      {perfil ? <TarjetaPerfil {...perfil} accion={perfilDe?.(perfil.autor)} onCerrar={() => setPerfil(null)} /> : null}
      {opciones ? (
        <HojaOpciones
          m={opciones}
          mio={claveAutor(opciones.autor) === yo}
          puedeEscribir={datos.puede_escribir}
          puedeBorrar={(claveAutor(opciones.autor) === yo || isAdmin) && datos.puede_escribir}
          onCerrar={() => setOpciones(null)}
          onReaccionar={() => setEligiendo(opciones.id)}
          onResponder={() => {
            setRespondiendo(opciones)
            caja.current?.focus()
          }}
          onEditar={() => setEditando(opciones.id)}
          onBorrar={() => setABorrar(opciones)}
        />
      ) : null}
    </section>
  )
}

// La tarjeta de quien escribió (tocando su foto o su nombre), como el perfil de Discord: foto grande, quién es
// y, si se puede, el botón para escribirle por privado.
function TarjetaPerfil({ autor, caja, accion, onCerrar }) {
  const tarjeta = useRef(null)
  const [pos, setPos] = useState({ left: caja.left, top: caja.bottom + 6, visible: false })
  useLayoutEffect(() => {
    const el = tarjeta.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const left = Math.max(12, Math.min(caja.left, window.innerWidth - width - 12))
    const abajo = caja.bottom + 6 + height <= window.innerHeight - 12
    setPos({ left, top: abajo ? caja.bottom + 6 : Math.max(12, caja.top - height - 6), visible: true })
  }, [caja])
  useEffect(() => {
    const fuera = (e) => tarjeta.current && !tarjeta.current.contains(e.target) && onCerrar()
    const esc = (e) => e.key === 'Escape' && onCerrar()
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', esc)
    window.addEventListener('resize', onCerrar)
    return () => {
      document.removeEventListener('pointerdown', fuera)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('resize', onCerrar)
    }
  }, [onCerrar])
  const equipo = autor.tipo === 'equipo'
  const quien = equipo ? `Equipo ATV${autor.area ? ` · ${autor.area}` : ''}` : autor.miembro ? accion?.detalle || 'Equipo del cliente' : accion?.detalle || 'Cliente de ATV'
  return createPortal(
    <div ref={tarjeta} className={`msj-perfil${equipo ? ' is-equipo' : ''}`} role="dialog" aria-label={`Perfil de ${autor.nombre}`} style={{ left: pos.left, top: pos.top, opacity: pos.visible ? 1 : 0 }}>
      <div className="msj-perfil__banda" />
      <div className="msj-perfil__foto">
        <Avatar persona={autor} size={76} />
      </div>
      <div className="msj-perfil__cuerpo">
        <b>{autor.nombre}</b>
        <span>{quien}</span>
        {(accion?.acciones || []).map((a) => (
          <button
            key={a.texto}
            type="button"
            className={a.secundaria ? 'is-secundaria' : undefined}
            onClick={() => {
              onCerrar()
              a.hacer()
            }}
          >
            {a.texto}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  )
}

// Un aviso de un segundo y medio abajo de todo ("Texto copiado").
function avisoCorto(texto) {
  const el = document.createElement('div')
  el.className = 'msj-aviso-corto'
  el.textContent = texto
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 1600)
}

// Celu: lo que abre mantener apretado un mensaje, como una hoja que sube desde abajo.
function HojaOpciones({ m, mio, puedeEscribir, puedeBorrar, onCerrar, onReaccionar, onResponder, onEditar, onBorrar }) {
  const abierta = useRef(Date.now())
  const hacer = (accion) => () => {
    if (Date.now() - abierta.current < 350) return
    onCerrar()
    accion()
  }
  const imagen = (m.adjuntos || []).find((a) => a.tipo_mime?.startsWith('image/') && a.tipo_mime !== 'image/heic')
  const copiar = () =>
    navigator.clipboard
      ?.writeText(conEmojis(m.texto))
      .then(() => avisoCorto('Texto copiado'))
      .catch(() => avisoCorto('No se pudo copiar'))
  // El portapapeles solo acepta PNG: se pasa por un canvas. La promesa va directo al ClipboardItem para no
  // perder el permiso del toque (Safari).
  const copiarImagen = () => {
    const png = fetch(imagen.url)
      .then((r) => r.blob())
      .then((b) => (b.type === 'image/png' ? b : createImageBitmap(b).then((bmp) => {
        const lienzo = document.createElement('canvas')
        lienzo.width = bmp.width
        lienzo.height = bmp.height
        lienzo.getContext('2d').drawImage(bmp, 0, 0)
        return new Promise((ok) => lienzo.toBlob(ok, 'image/png'))
      })))
    Promise.resolve()
      .then(() => navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]))
      .then(() => avisoCorto('Imagen copiada'))
      .catch(() => avisoCorto('No se pudo copiar la imagen'))
  }
  return createPortal(
    <div className="msj-hoja-fondo" onClick={() => Date.now() - abierta.current > 350 && onCerrar()}>
      <div className="msj-hoja" role="menu" aria-label="Opciones del mensaje" onClick={(e) => e.stopPropagation()}>
        {m.texto ? <p className="msj-hoja__cita">{conEmojis(m.texto)}</p> : null}
        <button type="button" role="menuitem" onClick={hacer(onReaccionar)}>Reaccionar</button>
        {puedeEscribir ? <button type="button" role="menuitem" onClick={hacer(onResponder)}>Responder</button> : null}
        {m.texto ? <button type="button" role="menuitem" onClick={hacer(copiar)}>Copiar texto</button> : null}
        {imagen && window.ClipboardItem ? <button type="button" role="menuitem" onClick={hacer(copiarImagen)}>Copiar imagen</button> : null}
        {mio && m.texto && puedeEscribir ? <button type="button" role="menuitem" onClick={hacer(onEditar)}>Editar</button> : null}
        {puedeBorrar ? <button type="button" role="menuitem" className="is-peligro" onClick={hacer(onBorrar)}>Eliminar</button> : null}
        <button type="button" className="msj-hoja__cancelar" onClick={onCerrar}>Cancelar</button>
      </div>
    </div>,
    document.body,
  )
}

function Edicion({ texto, onGuardar, onCancelar }) {
  const [valor, setValor] = useState(texto)
  const caja = useRef(null)
  // Crece con el texto (como el mensaje que se está editando) hasta un tope; más allá, scroll adentro.
  useLayoutEffect(() => {
    const el = caja.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight + 2, window.innerHeight * 0.6)}px`
  }, [valor])
  useEffect(() => {
    const el = caja.current
    el?.focus()
    el?.setSelectionRange(el.value.length, el.value.length)
  }, [])
  return (
    <div className="msj-edicion">
      <textarea
        ref={caja}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          // En el celu Enter baja de línea (los updates tienen varias): se guarda con el botón.
          if (e.key === 'Enter' && !e.shiftKey && !TACTIL) {
            e.preventDefault()
            onGuardar(valor)
          } else if (e.key === 'Escape') onCancelar()
        }}
        maxLength={4000}
      />
      <span>
        {TACTIL ? (
          <button type="button" onClick={onCancelar}>
            Cancelar
          </button>
        ) : (
          'Enter guarda · Esc cancela '
        )}
        <button type="button" onClick={() => onGuardar(valor)}>
          Guardar
        </button>
      </span>
    </div>
  )
}

function CaraMas() {
  return (
    <svg className="msj-cara-mas" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.5 11.5a8.5 8.5 0 1 1-8-8.5" />
      <path d="M8.5 14.5a4.2 4.2 0 0 0 7 0M9 9.5h.01M15 9.5h.01M19 2.5v6M16 5.5h6" />
    </svg>
  )
}
