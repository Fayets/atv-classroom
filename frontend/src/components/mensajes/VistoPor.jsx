import { useEffect, useState } from 'react'
import { fetchVistos } from '../../api/mensajes'

const iniciales = (n) => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()

// Solo admins: quiénes leyeron un mensaje y quiénes le clavaron el visto (o no lo abrieron todavía).
export default function VistoPor({ mensajeId, onCerrar }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [pestana, setPestana] = useState('faltan')
  const [sinFoto, setSinFoto] = useState({})

  useEffect(() => {
    let vivo = true
    fetchVistos(mensajeId)
      .then((r) => vivo && setDatos(r))
      .catch((e) => vivo && setError(e.message || 'No se pudo cargar.'))
    return () => {
      vivo = false
    }
  }, [mensajeId])

  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && onCerrar()
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [onCerrar])

  const lista = datos ? datos[pestana] : []
  const clientes = lista.filter((p) => p.tipo === 'cliente')
  const equipo = lista.filter((p) => p.tipo !== 'cliente')

  return (
    <div className="msj-modal__fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <section className="msj-modal msj-visto-por" role="dialog" aria-modal="true" aria-labelledby="msj-visto-por">
        <h2 id="msj-visto-por">Visto por</h2>
        <div className="msj-visto-por__tabs" role="tablist">
          <button type="button" role="tab" aria-selected={pestana === 'faltan'} className={pestana === 'faltan' ? 'is-on' : ''} onClick={() => setPestana('faltan')}>
            No lo vieron <b>{datos ? datos.faltan.length : '·'}</b>
          </button>
          <button type="button" role="tab" aria-selected={pestana === 'vieron'} className={pestana === 'vieron' ? 'is-on' : ''} onClick={() => setPestana('vieron')}>
            Lo vieron <b>{datos ? datos.vieron.length : '·'}</b>
          </button>
        </div>
        <div className="msj-visto-por__lista">
          {error ? <p className="msj-modal__error" role="alert">{error}</p> : null}
          {!datos && !error ? <p className="msj-visto-por__vacio">Cargando…</p> : null}
          {datos && !lista.length ? (
            <p className="msj-visto-por__vacio">{pestana === 'faltan' ? 'Lo vieron todos.' : 'Todavía no lo vio nadie.'}</p>
          ) : null}
          {[['Clientes', clientes], ['Equipo ATV', equipo]].map(([titulo, gente]) =>
            gente.length ? (
              <div key={titulo}>
                <h3>{titulo} · {gente.length}</h3>
                <ul>
                  {gente.map((p) => (
                    <li key={`${p.tipo}-${p.id}`}>
                      {p.foto_url && !sinFoto[`${p.tipo}-${p.id}`] ? (
                        <img src={p.foto_url} alt="" onError={() => setSinFoto((s) => ({ ...s, [`${p.tipo}-${p.id}`]: true }))} />
                      ) : (
                        <span className="msj-visto-por__ini">{iniciales(p.nombre)}</span>
                      )}
                      <span>{p.nombre}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
        </div>
        <div className="msj-modal__botones">
          <button type="button" onClick={onCerrar}>Cerrar</button>
        </div>
      </section>
    </div>
  )
}
