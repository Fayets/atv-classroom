import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchCuello, fetchCuellosCliente, pedirCuello } from '../../api/cuellos'
import { enviarMensaje, subirAdjunto } from '../../api/mensajes'
import { Diagnostico } from '../mac/CuellosCarpeta'
import '../../styles/cuellos.css'
import { pdfCuello } from '../../utils/cuelloPdf'

// Acción rápida "Cuello de botella": con el Loom del cliente, su cierre de mes o su problema contado, se lo
// manda a Jeremy y arma el documento que pidió Juan: diagnóstico, causas, qué no hacer, solución y
// roadmap. Juan lo corrige acá mismo y, aprobado, sale al chat. Todo queda también en la carpeta del escritorio.
const MES = (p) => {
  const [a, m] = p.split('-').map(Number)
  const t = new Date(a, m - 1, 15).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return t[0].toUpperCase() + t.slice(1)
}

// El cliente cuenta su traba de una de tres formas: un Loom, su reporte de cierre de mes o escrita.
function Pedido({ datos, clienteId, alPedido }) {
  const [fuente, setFuente] = useState('loom')
  const [loom, setLoom] = useState('')
  const [periodo, setPeriodo] = useState(datos.cierres?.[0]?.periodo || '')
  const [texto, setTexto] = useState('')
  const [contexto, setContexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const listo = fuente === 'loom' ? loom.trim() : fuente === 'cierre' ? periodo : texto.trim()

  async function pedir(e) {
    e.preventDefault()
    setEnviando(true)
    setError('')
    try {
      alPedido(await pedirCuello({
        cliente_id: clienteId,
        loom_url: fuente === 'loom' ? loom.trim() : null,
        cierre_periodo: fuente === 'cierre' ? periodo : null,
        texto: texto.trim() || null,
        contexto: contexto.trim() || null,
      }))
    } catch (err) {
      setError(err.message || 'No se pudo pedir el diagnóstico.')
      setEnviando(false)
    }
  }

  return (
    <form className="cb-nuevo" onSubmit={pedir}>
      {!datos.jeremy ? <p className="cb-aviso">Falta conectar Jeremy en el servidor: el pedido va a quedar con error.</p> : null}
      <div className="cb-fuentes" role="tablist" aria-label="De dónde sale el problema">
        {[['loom', 'Loom'], ['cierre', 'Cierre de mes'], ['texto', 'Contarlo']].map(([id, nombre]) => (
          <button key={id} type="button" role="tab" aria-selected={fuente === id} className={fuente === id ? 'is-on' : ''} onClick={() => setFuente(id)}>{nombre}</button>
        ))}
      </div>
      {fuente === 'loom' ? (
        <label className="cb-campo">
          <span>Link del Loom</span>
          <input id="cb-loom-chat" value={loom} onChange={(e) => setLoom(e.target.value)} placeholder="https://www.loom.com/share/…" inputMode="url" autoFocus />
        </label>
      ) : fuente === 'cierre' ? (
        datos.cierres?.length ? (
          <label className="cb-campo">
            <span>¿Qué cierre de mes?</span>
            <select id="cb-cierre" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
              {datos.cierres.map((c) => (
                <option key={c.periodo} value={c.periodo}>{MES(c.periodo)}{c.cuello ? ` · marcó ${c.cuello}` : ''}{c.typeform ? ' · Typeform' : ''}</option>
              ))}
            </select>
          </label>
        ) : <p className="cb-gris">Este cliente todavía no completó ningún cierre de mes.</p>
      ) : null}
      <label className="cb-campo">
        <span>{fuente === 'texto' ? 'Su problema, en sus palabras' : 'Algo más que quieras sumar (opcional)'}</span>
        <textarea id="cb-texto-chat" rows={fuente === 'texto' ? 5 : 2} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus={fuente === 'texto'} />
      </label>
      <label className="cb-campo">
        <span>Contexto en una línea (opcional)</span>
        <input id="cb-contexto-chat" value={contexto} onChange={(e) => setContexto(e.target.value)} placeholder="Qué vende y a quién" />
      </label>
      {error ? <p className="cb-error" role="alert">{error}</p> : null}
      <div className="cb-acciones">
        <small className="cb-gris">Lee también su chat, sus llamadas y su último cierre de mes. Tarda entre 5 y 10 minutos.</small>
        <button type="submit" className="cb-btn" disabled={enviando || !listo}>{enviando ? 'Pidiendo…' : 'Detectar cuello de botella'}</button>
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

  const [enviando, setEnviando] = useState(false)
  // Sale el PDF con la marca de ATV como adjunto, con una línea de presentación.
  async function enviar() {
    setEnviando(true)
    setError('')
    try {
      const { blob, nombre } = await pdfCuello({ cliente: mandar.cliente, texto: mandar.version_final, fecha: new Date(mandar.aprobado_en || Date.now()), capturas: mandar.captura_base })
      const adjunto = await subirAdjunto(canalId, new File([blob], nombre, { type: 'application/pdf' }))
      const primero = (cliente || '').trim().split(/\s+/)[0]
      await enviarMensaje(canalId, `${primero}, te dejo el diagnóstico de tu cuello de botella y el roadmap para resolverlo 👇`, null, [], [adjunto.id])
      setMandar(null)
      alEnviado()
      alCerrar()
    } catch (e) {
      setError(e.message || 'No se pudo enviar.')
    } finally {
      setEnviando(false)
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
            <Pedido datos={datos} clienteId={clienteId} alPedido={(d) => { setDiagId(d.id); setNuevo(false) }} />
          )}
        </div>
        {mandar ? (
          <div className="cb-confirmar" role="alertdialog" aria-label="Enviar al chat">
            <p>Va a salir el PDF del diagnóstico en el chat de {cliente}.</p>
            <span className="cb-btns">
              <button type="button" className="cb-btn is-suave" onClick={() => setMandar(null)}>Cancelar</button>
              <button type="button" className="cb-btn" disabled={enviando} onClick={enviar}>{enviando ? 'Enviando…' : 'Enviar'}</button>
            </span>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
