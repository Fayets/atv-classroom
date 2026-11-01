import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchCuello, fetchCuellosCliente, pedirCuello } from '../../api/cuellos'
import { enviarMensaje } from '../../api/mensajes'
import { Diagnostico } from '../mac/CuellosCarpeta'
import '../../styles/cuellos.css'

// Acción rápida "Detectar cuello de botella": pegás el Loom del cliente, se lo manda a Jeremy y arma el documento que pidió Juan: diagnóstico, causas, qué no hacer, solución y
// roadmap. Juan lo corrige acá mismo y, aprobado, sale al chat. Todo queda también en la carpeta del escritorio.
function Pedido({ jeremy, clienteId, alPedido }) {
  const [loom, setLoom] = useState('')
  const [texto, setTexto] = useState('')
  const [contexto, setContexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  async function pedir(e) {
    e.preventDefault()
    setEnviando(true)
    setError('')
    try {
      alPedido(await pedirCuello({ cliente_id: clienteId, loom_url: loom.trim() || null, texto: texto.trim() || null, contexto: contexto.trim() || null }))
    } catch (err) {
      setError(err.message || 'No se pudo pedir el diagnóstico.')
      setEnviando(false)
    }
  }

  return (
    <form className="cb-nuevo" onSubmit={pedir}>
      {!jeremy ? <p className="cb-aviso">Falta conectar Jeremy en el servidor: el pedido va a quedar con error.</p> : null}
      <label className="cb-campo">
        <span>Link del Loom</span>
        <input id="cb-loom-chat" value={loom} onChange={(e) => setLoom(e.target.value)} placeholder="https://www.loom.com/share/…" inputMode="url" autoFocus />
      </label>
      <label className="cb-campo">
        <span>Si no hay Loom, la traba en sus palabras</span>
        <textarea id="cb-texto-chat" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} />
      </label>
      <label className="cb-campo">
        <span>Contexto en una línea (opcional)</span>
        <input id="cb-contexto-chat" value={contexto} onChange={(e) => setContexto(e.target.value)} placeholder="Qué vende y a quién" />
      </label>
      {error ? <p className="cb-error" role="alert">{error}</p> : null}
      <div className="cb-acciones">
        <small className="cb-gris">Lee también su chat, sus llamadas y su último cierre de mes. Tarda entre 5 y 10 minutos.</small>
        <button type="submit" className="cb-btn" disabled={enviando || (!loom.trim() && !texto.trim())}>{enviando ? 'Pidiendo…' : 'Detectar cuello de botella'}</button>
      </div>
    </form>
  )
}

export default function CuelloBotella({ clienteId, canalId, cliente, alCerrar, alEnviado }) {
  const [datos, setDatos] = useState(null)
  const [diagId, setDiagId] = useState(null)
  const [nuevo, setNuevo] = useState(false)
  const [mandar, setMandar] = useState(null) // texto a punto de salir al chat
  const [error, setError] = useState('')

  useEffect(() => {
    fetchCuellosCliente(clienteId)
      .then(async (d) => {
        setDatos(d)
        // Si tiene uno en curso o sin mandar, se abre ese; si no, el formulario.
        if (d.ultimo) {
          const u = await fetchCuello(d.ultimo)
          if (u.estado !== 'aprobado' || Date.now() - new Date(u.aprobado_en).getTime() < 3 * 86400_000) setDiagId(u.id)
        }
      })
      .catch((e) => setError(e.message))
    const esc = (e) => e.key === 'Escape' && alCerrar()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [clienteId, alCerrar])

  async function enviar() {
    try {
      await enviarMensaje(canalId, mandar)
      setMandar(null)
      alEnviado()
      alCerrar()
    } catch (e) {
      setError(e.message || 'No se pudo enviar.')
    }
  }

  return createPortal(
    <div className="msj-modal__fondo" onMouseDown={(e) => e.target === e.currentTarget && alCerrar()}>
      <div className="msj-modal cb-modal" role="dialog" aria-modal="true" aria-labelledby="cb-modal-titulo">
        <div className="cb-modal__cab">
          <h2 id="cb-modal-titulo">Cuello de botella · {cliente}</h2>
          <span className="cb-btns">
            {diagId && !nuevo ? <button type="button" className="cb-link" onClick={() => setNuevo(true)}>Pedir uno nuevo</button> : null}
            <button type="button" className="cb-btn is-suave" onClick={alCerrar}>Cerrar</button>
          </span>
        </div>
        {error ? <p className="cb-error" role="alert">{error}</p> : null}
        <div className="cb-modal__cuerpo">
          {!datos ? (
            <p className="cb-gris">Cargando…</p>
          ) : diagId && !nuevo ? (
            <Diagnostico id={diagId} alEnviar={setMandar} />
          ) : (
            <Pedido jeremy={datos.jeremy} clienteId={clienteId} alPedido={(d) => { setDiagId(d.id); setNuevo(false) }} />
          )}
        </div>
        {mandar ? (
          <div className="cb-confirmar" role="alertdialog" aria-label="Enviar al chat">
            <p>Va a salir este documento en el chat de {cliente}.</p>
            <span className="cb-btns">
              <button type="button" className="cb-btn is-suave" onClick={() => setMandar(null)}>Cancelar</button>
              <button type="button" className="cb-btn" onClick={enviar}>Enviar</button>
            </span>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
