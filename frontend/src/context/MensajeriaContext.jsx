import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { fetchHabilitada, fetchNoLeidos } from '../api/mensajes'
import AvisoMencion from '../components/mensajes/AvisoMencion'
import { useAuth } from './AuthContext'

// Una sola conexión en vivo por pestaña, compartida por el contador del encabezado y la página de mensajes.
const MensajeriaContext = createContext(null)

export function MensajeriaProvider({ children }) {
  const { token, isEquipo, user } = useAuth()
  const [clientesHabilitados, setClientesHabilitados] = useState(false)
  const habilitada = Boolean(token) && (isEquipo || clientesHabilitados)
  const suscriptores = useRef(new Set())
  const socket = useRef(null)
  const [conectado, setConectado] = useState(false)
  const [resumen, setResumen] = useState({ no_leidos: 0, esperando: 0 })
  const [aviso, setAviso] = useState(null)
  const cerrarAviso = useCallback(() => setAviso(null), [])
  const ultimoRefresco = useRef(0)
  const refrescoPendiente = useRef(null) // { reloj, cuando }
  const enCurso = useRef(false)
  const otraVez = useRef(false)
  const refrescarRef = useRef(null)
  // El canal que está a la vista (lo fija Conversacion): lo que llega ahí se lee al instante.
  const canalAbierto = useRef(null)
  const yo = isEquipo ? `equipo:${user?.usuario_id}` : `cliente:${user?.usuario_id}`
  const esMio = useCallback((m) => `${m?.autor?.tipo}:${m?.autor?.id}` === yo, [yo])
  const esMioRef = useRef(esMio)
  esMioRef.current = esMio

  // Pide los totales al servidor: como mucho uno cada `cada` ms y nunca dos a la vez. Con cada
  // mensaje que llegaba, cada pestaña abierta los volvía a pedir, y con todos conectados el
  // servidor no daba abasto: ahora el contador se suma acá y el servidor solo lo confirma.
  // `demora` reparte en el tiempo las consultas de todas las pestañas que recibieron el mismo aviso.
  const refrescarResumen = useCallback((cada = 3000, demora = 0) => {
    const cuando = Math.max(Date.now() + demora, ultimoRefresco.current + (typeof cada === 'number' ? cada : 3000))
    const pendiente = refrescoPendiente.current
    if (pendiente && pendiente.cuando <= cuando) return
    if (pendiente) clearTimeout(pendiente.reloj)
    refrescoPendiente.current = {
      cuando,
      reloj: setTimeout(() => {
        refrescoPendiente.current = null
        if (enCurso.current) {
          otraVez.current = true
          return
        }
        enCurso.current = true
        ultimoRefresco.current = Date.now()
        fetchNoLeidos()
          .then(setResumen)
          .catch(() => null)
          .finally(() => {
            enCurso.current = false
            if (otraVez.current) {
              otraVez.current = false
              refrescarRef.current()
            }
          })
      }, cuando - Date.now()),
    }
  }, [])
  refrescarRef.current = refrescarResumen

  const aLaVista = (canalId) => canalId === canalAbierto.current && !document.hidden

  // Lo llama Conversacion cuando marca leído lo que ya estaba sin leer al abrir el canal.
  const avisarLeido = useCallback((canalId) => {
    suscriptores.current.forEach((fn) => fn({ tipo: 'leido-propio', canal_id: canalId }))
    refrescarRef.current(1000)
  }, [])

  // Hasta el lanzamiento la usan el equipo y los mails de prueba (MENSAJES_CLIENTES / MENSAJES_PRUEBA en el backend).
  // Se vuelve a preguntar si cambia la pausa del cliente, y si la consulta falla (un corte, un 423 mientras
  // estaba en pausa) se reintenta: antes quedaba sin "Mensajes" hasta recargar la página.
  const pausa = Boolean(user?.pausa)
  useEffect(() => {
    if (!token || isEquipo) return undefined
    let vivo = true
    let reloj = null
    const preguntar = (intento) =>
      fetchHabilitada()
        .then((r) => vivo && setClientesHabilitados(Boolean(r?.habilitada)))
        .catch(() => {
          if (vivo && intento < 4) reloj = setTimeout(() => preguntar(intento + 1), 2000 * (intento + 1))
        })
    preguntar(0)
    return () => {
      vivo = false
      clearTimeout(reloj)
    }
  }, [token, isEquipo, pausa])

  useEffect(() => {
    if (!habilitada) return undefined
    let vivo = true
    let intentos = 0
    let ping = null
    let reintento = null
    let ultimaSenal = Date.now()

    function conectar() {
      const protocolo = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${protocolo}://${window.location.host}/api/ws`)
      socket.current = ws
      ws.onopen = () => ws.send(JSON.stringify({ tipo: 'auth', token }))
      ws.onmessage = (e) => {
        ultimaSenal = Date.now()
        let evento
        try {
          evento = JSON.parse(e.data)
        } catch {
          return
        }
        if (evento.tipo === 'listo') {
          intentos = 0
          setConectado(true)
          clearInterval(ping)
          ping = setInterval(() => {
            // Sin respuesta en un minuto la conexión está muerta aunque figure abierta: se rehace.
            if (Date.now() - ultimaSenal > 60000) return reconectarYa()
            if (ws.readyState === 1) ws.send('{"tipo":"ping"}')
          }, 25000)
          suscriptores.current.forEach((fn) => fn({ tipo: 'reconectado' }))
          refrescarResumen()
          return
        }
        if (evento.tipo === 'pong' || evento.tipo === 'error') return
        if (evento.tipo === 'pausa') window.dispatchEvent(new Event('atv-pausa'))
        if (evento.tipo === 'mencion') {
          setAviso(evento)
          refrescarResumen()
        }
        if (evento.tipo === 'mensaje') {
          if (!esMioRef.current(evento.mensaje) && !aLaVista(evento.mensaje.canal_id)) {
            setResumen((r) => ({ ...r, no_leidos: r.no_leidos + 1 }))
          }
          refrescarResumen(15000, 2000 + Math.random() * 8000) // "esperando" y lo que no se puede saber acá
        }
        if (evento.tipo === 'borrado') refrescarResumen(15000, 2000 + Math.random() * 8000)
        suscriptores.current.forEach((fn) => fn(evento))
      }
      ws.onclose = (e) => {
        clearInterval(ping)
        setConectado(false)
        if (!vivo || e.code === 4401 || e.code === 4403) return // sesión inválida o sin acceso: no se reintenta
        intentos += 1
        reintento = setTimeout(conectar, Math.min(30000, 1000 * 2 ** Math.min(intentos, 5)))
      }
    }

    // Rehace la conexión ya, sin la espera de los reintentos.
    function reconectarYa() {
      clearTimeout(reintento)
      clearInterval(ping)
      const viejo = socket.current
      if (viejo) {
        viejo.onclose = null
        viejo.close()
      }
      setConectado(false)
      intentos = 0
      ultimaSenal = Date.now()
      conectar()
    }

    // En el iPhone, con la app en segundo plano el sistema corta la conexión sin avisar: seguía "En vivo"
    // pero no llegaba nada (ni los chats nuevos). Al volver se reconecta y, con eso, todo se recarga.
    function alVolver() {
      if (document.hidden) return
      // En compu la conexión sigue viva en segundo plano (los pings responden): no se toca.
      if (socket.current?.readyState !== 1 || Date.now() - ultimaSenal > 30000) {
        reconectarYa()
        refrescarResumen()
      }
    }
    const alMostrarse = (e) => e.persisted && reconectarYa()
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('pageshow', alMostrarse)
    window.addEventListener('online', reconectarYa)

    conectar()
    refrescarResumen()
    // Respaldo por si el proxy no deja pasar el WebSocket: el contador igual se actualiza.
    const respaldo = setInterval(() => refrescarResumen(), 60000)
    return () => {
      vivo = false
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('pageshow', alMostrarse)
      window.removeEventListener('online', reconectarYa)
      clearTimeout(reintento)
      clearInterval(ping)
      clearInterval(respaldo)
      socket.current?.close()
      socket.current = null
    }
  }, [habilitada, token, refrescarResumen])

  const suscribir = useCallback((fn) => {
    suscriptores.current.add(fn)
    return () => suscriptores.current.delete(fn)
  }, [])

  const avisarEscribiendo = useCallback((canalId, activo = true) => {
    const ws = socket.current
    if (ws?.readyState === 1) ws.send(JSON.stringify({ tipo: 'escribiendo', canal_id: canalId, activo }))
  }, [])

  const valor = useMemo(
    () => ({ habilitada, conectado, resumen, suscribir, avisarEscribiendo, refrescarResumen, avisarLeido, canalAbierto, esMio }),
    [habilitada, conectado, resumen, suscribir, avisarEscribiendo, refrescarResumen, avisarLeido, esMio],
  )
  return (
    <MensajeriaContext.Provider value={valor}>
      {children}
      <AvisoMencion aviso={aviso} onCerrar={cerrarAviso} />
    </MensajeriaContext.Provider>
  )
}

export function useMensajeria() {
  const ctx = useContext(MensajeriaContext)
  if (!ctx) throw new Error('useMensajeria debe usarse dentro de MensajeriaProvider')
  return ctx
}
