import { useEffect, useState } from 'react'
import { cerrarDispositivo, fetchDispositivos } from '../../api/cuenta'
import { Equipo, cuandoFue } from './dispositivos'

// Mi cuenta: dónde tenés la sesión abierta. Siempre arranca cerrado (Franco: "cosa que no moleste").
export default function TusDispositivos() {
  const [lista, setLista] = useState(null)
  const [cerrando, setCerrando] = useState(null)

  useEffect(() => {
    fetchDispositivos().then(setLista).catch(() => setLista([]))
  }, [])

  async function cerrar(d) {
    setCerrando(d.id)
    try {
      await cerrarDispositivo(d.id)
      setLista((l) => l.filter((x) => x.id !== d.id))
    } finally {
      setCerrando(null)
    }
  }

  return (
    <details className="cuenta-seccion cuenta-plegable">
      <summary>
        <h2>Tus dispositivos</h2>
        {lista ? <span className="cuenta-plegable__n">{lista.length}</span> : null}
      </summary>
      <div className="cuenta-seccion__cuerpo">
        <p className="disp-ayuda">Donde tenés la sesión abierta. Si no reconocés alguno, cerralo y avisanos.</p>
        <ul className="disp-lista">
          {(lista || []).map((d) => (
            <li key={d.id}>
              <Equipo d={d} />
              <div className="disp-txt">
                <b>{d.equipo} · {d.navegador}</b>
                <span>{[d.ciudad, d.pais].filter(Boolean).join(', ') || 'Ubicación desconocida'} · {cuandoFue(d.ultima)}</span>
              </div>
              {d.actual ? (
                <span className="disp-este">Este</span>
              ) : (
                <button type="button" className="disp-cerrar" onClick={() => cerrar(d)} disabled={cerrando === d.id}>
                  {cerrando === d.id ? 'Cerrando…' : 'Cerrar'}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}
