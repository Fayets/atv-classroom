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

export default function GoogleButton({ clientId, onCredential }) {
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
        const ancho = Math.min(400, Math.max(240, contenedor.current.offsetWidth || 360))
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
  return <div ref={contenedor} className="lg-google__boton" />
}
