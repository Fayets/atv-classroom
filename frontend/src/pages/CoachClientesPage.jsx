import { useState } from 'react'
import AppHeader from '../components/AppHeader'
import { AsignarRoadmap, NivelChip } from '../components/plataforma/piezas'
import { COACH_DEMO, COACHES, usePlataforma } from '../context/PlataformaDemo'
import '../styles/frentes.css'
import '../styles/plataforma.css'

const FILTROS = [
  ['todos', 'Todos'],
  ['entry', 'Entry'],
  ['mid', 'Mid'],
  ['high', 'High'],
  ['sin', 'Sin roadmap vigente'],
]

// Los clientes del coach con su roadmap vigente; desde acá se asigna uno nuevo.
export default function CoachClientesPage() {
  const { clientes, vigenteDe, esperando, conversacion } = usePlataforma()
  const [filtro, setFiltro] = useState('todos')
  const [asignando, setAsignando] = useState(null)

  const sinVigente = clientes.filter((c) => !vigenteDe(c.id)).length
  const visibles = clientes.filter((c) => (filtro === 'todos' ? true : filtro === 'sin' ? !vigenteDe(c.id) : c.nivel === filtro))

  return (
    <div className="app-shell im-root">
      <AppHeader />
      <main className="pf-clientes">
        <div className="pf-clientes__head">
          <div>
            <h1>Tus clientes</h1>
            <p className="pf-muted">
              {clientes.length} a cargo · {sinVigente} sin roadmap vigente
            </p>
          </div>
          <div className="pf-chips pf-chips--filtro" role="group" aria-label="Filtrar">
            {FILTROS.map(([id, nombre]) => (
              <button key={id} type="button" className={`${filtro === id ? 'is-on' : ''}${id === 'sin' ? ' is-rojo' : ''}`} aria-pressed={filtro === id} onClick={() => setFiltro(id)}>
                {nombre}
              </button>
            ))}
          </div>
        </div>

        <div className="pf-tabla-wrap">
          <table className="pf-tabla">
            <thead>
              <tr>
                <th scope="col">Cliente</th>
                <th scope="col">Nivel</th>
                <th scope="col">Roadmap vigente</th>
                <th scope="col">Último mensaje</th>
                <th scope="col">Salud</th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((c) => {
                const v = vigenteDe(c.id)
                const msgs = conversacion(c.id, COACH_DEMO)
                const ultimo = msgs[msgs.length - 1]
                return (
                  <tr key={c.id}>
                    <th scope="row">{c.nombre}</th>
                    <td>
                      <NivelChip nivel={c.nivel} />
                    </td>
                    <td>
                      {v ? (
                        <>
                          {v.titulo} <span className="pf-muted">· {COACHES[v.coach].nombre} · {v.fecha}</span>
                        </>
                      ) : (
                        <span className="pf-rojo">Sin roadmap vigente</span>
                      )}
                    </td>
                    <td className={esperando[c.id] ? 'pf-rojo' : 'pf-muted'}>{esperando[c.id] ? `esperando ${esperando[c.id]}` : ultimo?.hora}</td>
                    <td className={c.salud === 'riesgo' ? 'pf-warn' : 'pf-okc'}>{c.salud === 'riesgo' ? 'En riesgo' : 'Activo'}</td>
                    <td>
                      <button type="button" className="pc-btn pc-btn--ghost" onClick={() => setAsignando(c.id)}>
                        Asignar roadmap
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </main>
      {asignando ? <AsignarRoadmap cliente={asignando} coach={COACH_DEMO} onCerrar={() => setAsignando(null)} /> : null}
    </div>
  )
}
