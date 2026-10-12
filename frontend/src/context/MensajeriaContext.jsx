import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { fetchAuthConfig } from '../api/client'
import { fetchNoLeidos } from '../api/mensajes'
import { useAuth } from './AuthContext'

// Una sola conexión en vivo por pestaña, compartida por el contador del encabezado y la página de mensajes.
const MensajeriaContext = createContext(null)

export function MensajeriaProvider({ children }) {
  const { token, isEquipo } = useAuth()
  const [clientesHabilitados, setClientesHabilitados] = useState(false)
  const habilitada = Boolean(token) && (isEquipo || clientesHabilitados)
  const suscriptores = useRef(new Set())
  const socket = useRef(null)
  const [conectado, setConectado] = useState(false)
  const [resumen, setResumen] = useState({ no_leidos: 0, esperando: 0 })
  const ultimoRefresco = useRef(0)
  const refrescoPendiente = useRef(null)

  const refrescarResumen = useCallback(() => {
    // Como mucho una consulta cada 3 segundos aunque lleguen muchos mensajes juntos.
    const espera = Math.max(0, 3000 - (Date.now() - ultimoRefresco.current))
    if (refrescoPendiente.current) return
    refrescoPendiente.current = setTimeout(() => {
      refrescoPendiente.current = null
      ultimoRefresco.current = Date.now()
      fetchNoLeidos()
        .then(setResumen)
        .catch(() => null)
    }, espera)
  }, [])

  // Hasta el lanzamiento, la mensajería es solo del equipo (MENSAJES_CLIENTES en el backend).
  useEffect(() => {
    if (!token || isEquipo) return
    fetchAuthConfig()
      .then((cfg) => setClientesHabilitados(Boolean(cfg?.mensajes_clientes)))
      .catch(() => null)
  }, [token, isEquipo])

  useEffect(() => {
    if (!habilitada) return undefined
    let vivo = true
    let intentos = 0
    let ping = null
    let reintento = null

    function conectar() {
      const protocolo = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${protocolo}://${window.location.host}/api/ws`)
      socket.current = ws
      ws.onopen = () => ws.send(JSON.stringify({ tipo: 'auth', token }))
      ws.onmessage = (e) => {
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
          ping = setInterval(() => ws.readyState === 1 && ws.send('{"tipo":"ping"}'), 25000)
          suscriptores.current.forEach((fn) => fn({ tipo: 'reconectado' }))
          refrescarResumen()
          return
        }
        if (evento.tipo === 'pong' || evento.tipo === 'error') return
        if (evento.tipo === 'mensaje' || evento.tipo === 'leido' || evento.tipo === 'borrado') refrescarResumen()
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

    conectar()
    refrescarResumen()
    // Respaldo por si el proxy no deja pasar el WebSocket: el contador igual se actualiza.
    const respaldo = setInterval(refrescarResumen, 60000)
    return () => {
      vivo = false
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
    () => ({ habilitada, conectado, resumen, suscribir, avisarEscribiendo, refrescarResumen }),
    [habilitada, conectado, resumen, suscribir, avisarEscribiendo, refrescarResumen],
  )
  return <MensajeriaContext.Provider value={valor}>{children}</MensajeriaContext.Provider>
}

export function useMensajeria() {
  const ctx = useContext(MensajeriaContext)
  if (!ctx) throw new Error('useMensajeria debe usarse dentro de MensajeriaProvider')
  return ctx
}
