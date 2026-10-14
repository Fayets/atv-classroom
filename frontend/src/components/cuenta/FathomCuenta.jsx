import { useEffect, useState } from 'react'
import { conectarFathom, desconectarFathom, fetchFathom, sincronizarFathom } from '../../api/llamadas'

const cuando = (iso) => (iso ? new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'todavía no')

// Conectar el Fathom propio: las llamadas caen solas en la carpeta "Llamadas" del escritorio y desde
// ahí se arma el roadmap. La API key se guarda cifrada: nadie del equipo la puede ver.
export default function FathomCuenta() {
  const [estado, setEstado] = useState(null)
  const [clave, setClave] = useState('')
  const [ocupado, setOcupado] = useState('')
  const [error, setError] = useState('')

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
        <p className="cuenta-equipo__ayuda">Tus llamadas nuevas entran solas a la carpeta <b>Llamadas</b> del escritorio cada 15 minutos.</p>
        {error ? <p className="cuenta-error" role="alert">{error}</p> : null}
        <div className="fathom-cuenta__botones">
          <button type="button" className="cuenta-boton is-suave" onClick={() => hacer('sync', sincronizarFathom)} disabled={Boolean(ocupado)}>{ocupado === 'sync' ? 'Trayendo…' : 'Traer llamadas ahora'}</button>
          <button type="button" className="cuenta-boton is-peligro" onClick={() => hacer('salir', desconectarFathom)} disabled={Boolean(ocupado)}>Desconectar</button>
        </div>
      </div>
    )
  }
  return (
    <form className="fathom-cuenta" onSubmit={(e) => { e.preventDefault(); hacer('conectar', () => conectarFathom(clave)) }}>
      <p className="cuenta-equipo__ayuda">Conectá tu Fathom y tus llamadas caen solas en la carpeta <b>Llamadas</b>, con la transcripción, para armar el roadmap del cliente en un clic.</p>
      <ol className="fathom-cuenta__pasos">
        <li>En Fathom andá a <b>Settings → API Access</b>.</li>
        <li>Tocá <b>Generate API key</b> y copiala.</li>
        <li>Pegala acá abajo. Se guarda cifrada: nadie del equipo la ve.</li>
      </ol>
      <div className="fathom-cuenta__fila">
        <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} placeholder="API key de Fathom" autoComplete="off" />
        <button type="submit" className="cuenta-boton is-primario" disabled={ocupado === 'conectar' || clave.trim().length < 20}>{ocupado === 'conectar' ? 'Conectando…' : 'Conectar'}</button>
      </div>
      {error ? <p className="cuenta-error" role="alert">{error}</p> : null}
    </form>
  )
}
