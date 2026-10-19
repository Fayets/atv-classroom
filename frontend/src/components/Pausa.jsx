import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { fetchSessionProfile } from '../api/client'
import { useAuth } from '../context/AuthContext'
import '../styles/pausa.css'

// Cliente en pausa: el equipo lo arrastró a "Pausa". Solo puede leer su canal; para todo lo demás (y para
// escribir) le sale el cartel de hablar con Lucas. El bloqueo de verdad está en el servidor (423): esto es
// lo que ve el cliente.

export const EVENTO_PAUSA = 'atv-pausa' // el servidor cortó algo por pausa: refrescar el perfil y mostrar el cartel
const VISTO = 'atv-pausa-visto'

function Contacto({ contacto, onCanal }) {
  const nombre = contacto?.nombre || 'Lucas'
  return (
    <>
      <span className="pausa-icono" aria-hidden="true">
        <svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></svg>
      </span>
      <h2 id="pausa-titulo">Tu programa está en pausa</h2>
      <p>Para reanudarlo, comunicate con <b>{nombre}</b>. Mientras tanto podés leer tu canal, pero no usar los módulos, la IA ni los roadmaps.</p>
      {contacto?.whatsapp ? <p className="pausa-numero">{contacto.whatsapp}</p> : null}
      <div className="pausa-acciones">
        {contacto?.link ? (
          <a className="pausa-boton is-whatsapp" href={contacto.link} target="_blank" rel="noreferrer">Escribirle a {nombre} por WhatsApp</a>
        ) : null}
        {onCanal ? <button type="button" className="pausa-boton is-suave" onClick={onCanal}>Ver mi canal</button> : null}
      </div>
    </>
  )
}

export function CartelPausa({ abierto, alCerrar }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    if (!abierto) return undefined
    const tecla = (e) => e.key === 'Escape' && alCerrar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [abierto, alCerrar])
  if (!abierto) return null
  return createPortal(
    <div className="pausa-fondo" onClick={(e) => e.target === e.currentTarget && alCerrar()}>
      <div className="pausa-tarjeta" role="dialog" aria-modal="true" aria-labelledby="pausa-titulo">
        <Contacto contacto={user?.contacto_pausa} onCanal={() => { alCerrar(); navigate('/mensajes') }} />
        <button type="button" className="pausa-cerrar" onClick={alCerrar}>Entendido</button>
      </div>
    </div>,
    document.body,
  )
}

// En lugar de módulos, IA, roadmaps…: la misma tarjeta, de página.
export function PantallaPausa() {
  const { user } = useAuth()
  const navigate = useNavigate()
  return (
    <main className="pausa-pagina">
      <div className="pausa-tarjeta">
        <Contacto contacto={user?.contacto_pausa} onCanal={() => navigate('/mensajes')} />
      </div>
    </main>
  )
}

// Mantiene al día si el cliente está en pausa (al entrar, cuando el servidor corta algo o cuando el equipo
// lo mueve) y muestra el cartel apenas entra, una vez por sesión, o cada vez que alguien lo pide.
export function PausaSync() {
  const { isAuthenticated, isEquipo, user, actualizarUsuario } = useAuth()
  const [abierto, setAbierto] = useState(false)
  const cliente = isAuthenticated && !isEquipo

  const refrescar = useCallback(async (mostrar) => {
    try {
      const p = await fetchSessionProfile()
      actualizarUsuario({ pausa: Boolean(p.pausa), contacto_pausa: p.contacto_pausa || null })
      if (p.pausa && mostrar) setAbierto(true)
    } catch {
      /* sin red: queda lo que había */
    }
  }, [actualizarUsuario])

  useEffect(() => {
    if (!cliente) return undefined
    let visto = false
    try {
      visto = sessionStorage.getItem(VISTO) === '1'
    } catch {
      /* sin almacenamiento: se muestra */
    }
    refrescar(!visto)
    const alCortar = () => refrescar(true)
    window.addEventListener(EVENTO_PAUSA, alCortar)
    return () => window.removeEventListener(EVENTO_PAUSA, alCortar)
  }, [cliente, refrescar])

  const cerrar = useCallback(() => {
    setAbierto(false)
    try {
      sessionStorage.setItem(VISTO, '1')
    } catch {
      /* nada */
    }
  }, [])

  return cliente && user?.pausa ? <CartelPausa abierto={abierto} alCerrar={cerrar} /> : null
}

export function pedirCartelPausa() {
  window.dispatchEvent(new Event(EVENTO_PAUSA))
}
