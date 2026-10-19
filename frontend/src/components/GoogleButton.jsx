import { useEffect, useRef, useState } from 'react'

// El script de Google se carga una sola vez y solo en la pantalla que lo necesita.
let cargaGsi = null

function cargarGsi() {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (!cargaGsi) {
    cargaGsi = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.onload = resolve
      script.onerror = () => {
        cargaGsi = null
        reject(new Error('No se pudo cargar Google'))
      }
      document.head.appendChild(script)
    })
  }
  return cargaGsi
}

// variante "texto": se ve un link propio ("Equipo de ATV: entrar con Google") y el botón oficial de Google
// queda encima, transparente, para que el clic lo reciba él (Google no deja estilizar su botón).
export default function GoogleButton({ clientId, onCredential, variante = 'boton', children }) {
  const contenedor = useRef(null)
  const callback = useRef(onCredential)
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    callback.current = onCredential
  }, [onCredential])

  useEffect(() => {
    let vivo = true
    cargarGsi()
      .then(() => {
        if (!vivo || !contenedor.current) return
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (respuesta) => callback.current(respuesta.credential),
          ux_mode: 'popup',
          auto_select: false,
          cancel_on_tap_outside: true,
        })
        const ancho = Math.min(400, Math.max(200, contenedor.current.offsetWidth || 360))
        window.google.accounts.id.renderButton(contenedor.current, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          logo_alignment: 'center',
          width: ancho,
          locale: 'es',
        })
      })
      .catch(() => vivo && setFallo(true))
    return () => {
      vivo = false
    }
  }, [clientId])

  if (fallo) {
    return <p className="lg-google__fallo">No pudimos cargar el ingreso con Google. Recargá la página.</p>
  }
  if (variante === 'texto') {
    return (
      <div className="lg-google-texto">
        <span className="lg-google-texto__vista" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z" /><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" /><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" /><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" /></svg>
          {children}
        </span>
        <div ref={contenedor} className="lg-google-texto__real" />
      </div>
    )
  }
  return <div ref={contenedor} className="lg-google__boton" />
}
