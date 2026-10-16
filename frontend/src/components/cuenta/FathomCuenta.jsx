import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { conectarFathom, desconectarFathom, fetchFathom, sincronizarFathom } from '../../api/llamadas'

const cuando = (iso) => (iso ? new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'todavía no')

// La guía paso a paso para que cualquiera del equipo conecte su Fathom solo (con capturas reales).
const PASOS_GUIA = [
  { titulo: 'Abrí la configuración de Fathom', texto: 'Entrá a fathom.video, tocá Settings arriba a la derecha y bajá hasta la sección API ACCESS. Tocá Add.', img: '/ayuda/fathom-1-api-access.jpg' },
  { titulo: 'Elegí "Generate Api Key"', texto: 'La de la izquierda. La otra (Create Public App) no hace falta.', img: '/ayuda/fathom-2-generar.jpg' },
  { titulo: 'Ponele un nombre y creala', texto: 'Por ejemplo "Tu nombre x Classroom". Tocá Create API Client.', img: '/ayuda/fathom-3-nombre.jpg' },
  { titulo: 'Copiá la API Key', texto: 'Con el botón de copiar al lado de "API Key". Fathom la muestra una sola vez. El Webhook Secret no hace falta.', img: '/ayuda/fathom-4-copiar.jpg' },
  { titulo: 'Pegala acá y tocá Conectar', texto: 'La primera vez trae todas tus llamadas: puede tardar un minuto. Después entran solas cada 15 minutos a la carpeta Llamadas del escritorio. No le pases la key a nadie: pegala vos directo acá.' },
]

function GuiaFathom({ alCerrar }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && alCerrar()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [alCerrar])
  return createPortal(
    <div className="fathom-guia" role="dialog" aria-label="Cómo conectar tu Fathom" onClick={(e) => e.target === e.currentTarget && alCerrar()}>
      <div className="fathom-guia__hoja">
        <header>
          <div>
            <p>Mi cuenta · Fathom</p>
            <h2>Cómo conectar tu Fathom</h2>
          </div>
          <button type="button" onClick={alCerrar} aria-label="Cerrar">×</button>
        </header>
        <ol>
          {PASOS_GUIA.map((p, i) => (
            <li key={p.titulo}>
              <span className="fathom-guia__n">{i + 1}</span>
              <div>
                <b>{p.titulo}</b>
                <p>{p.texto}</p>
                {p.img ? <img src={p.img} alt="" loading="lazy" /> : null}
              </div>
            </li>
          ))}
        </ol>
        <button type="button" className="cuenta-boton is-primario" onClick={alCerrar}>Entendido</button>
      </div>
    </div>,
    document.body,
  )
}

// Conectar el Fathom propio: las llamadas caen solas en la carpeta "Llamadas" del escritorio y desde
// ahí se arma el roadmap. La API key se guarda cifrada: nadie del equipo la puede ver.
export default function FathomCuenta() {
  const [estado, setEstado] = useState(null)
  const [clave, setClave] = useState('')
  const [ocupado, setOcupado] = useState('')
  const [error, setError] = useState('')
  const [guia, setGuia] = useState(false)
  const botonGuia = (
    <button type="button" className="fathom-cuenta__guia" onClick={() => setGuia(true)}>
      Cómo conectar
    </button>
  )
  const ventanaGuia = guia ? <GuiaFathom alCerrar={() => setGuia(false)} /> : null

  useEffect(() => {
    fetchFathom().then(setEstado).catch((e) => setError(e.message || 'No se pudo cargar.'))
  }, [])

  async function hacer(que, fn) {
    setOcupado(que)
    setError('')
    try {
      setEstado(await fn())
      setClave('')
    } catch (e) {
      setError(e.message || 'No se pudo.')
    } finally {
      setOcupado('')
    }
  }

  if (!estado) return <p className="cuenta__cargando">{error || 'Cargando…'}</p>
  if (estado.conectado) {
    return (
      <div className="fathom-cuenta">
        <p className="fathom-cuenta__ok">
          <b>Fathom conectado ✓</b> · {estado.llamadas} {estado.llamadas === 1 ? 'llamada' : 'llamadas'} · última actualización {cuando(estado.ultima_sync)}
        </p>
        {estado.error ? <p className="cuenta-error" role="alert">{estado.error}</p> : null}
        {error ? <p className="cuenta-error" role="alert">{error}</p> : null}
        <div className="fathom-cuenta__botones">
          <button type="button" className="cuenta-boton is-suave" onClick={() => hacer('sync', sincronizarFathom)} disabled={Boolean(ocupado)}>{ocupado === 'sync' ? 'Trayendo…' : 'Traer llamadas ahora'}</button>
          <button type="button" className="cuenta-boton is-peligro" onClick={() => hacer('salir', desconectarFathom)} disabled={Boolean(ocupado)}>Desconectar</button>
          {botonGuia}
        </div>
        {ventanaGuia}
      </div>
    )
  }
  return (
    <form className="fathom-cuenta" onSubmit={(e) => { e.preventDefault(); hacer('conectar', () => conectarFathom(clave)) }}>
      <p className="cuenta-equipo__ayuda">Conectá tu Fathom y tus llamadas caen solas en la carpeta <b>Llamadas</b>, con la transcripción, para armar el roadmap del cliente en un clic.</p>
      <ol className="fathom-cuenta__pasos">
        <li>En Fathom andá a <b>Settings → API Access → Add → Generate Api Key</b>.</li>
        <li>Copiá la <b>API Key</b> (no el Webhook Secret).</li>
        <li>Pegala acá abajo. Se guarda cifrada: nadie del equipo la ve.</li>
      </ol>
      {botonGuia}
      <div className="fathom-cuenta__fila">
        <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} placeholder="API key de Fathom" autoComplete="off" />
        <button type="submit" className="cuenta-boton is-primario" disabled={ocupado === 'conectar' || clave.trim().length < 20}>{ocupado === 'conectar' ? 'Conectando…' : 'Conectar'}</button>
      </div>
      {error ? <p className="cuenta-error" role="alert">{error}</p> : null}
      {ventanaGuia}
    </form>
  )
}
