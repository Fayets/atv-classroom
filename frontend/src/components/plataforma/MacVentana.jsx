import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { usePlataforma } from '../../context/PlataformaDemo'
import { getUserInitials } from '../../utils/user'
import '../../styles/mac.css'

const NAV = [
  ['/', 'Inicio', true],
  ['/classroom', 'Classroom'],
  ['/mensajes', 'Mensajes'],
  ['/roadmaps', 'Roadmaps'],
]

// Selector ATV | Mac de la vista previa. Se muestra en las dos versiones de Mensajes y Roadmaps.
export function SelectorEstilo({ flotante = false }) {
  const { estilo, setEstilo } = usePlataforma()
  return (
    <div className={`mac-estilo${flotante ? ' is-flotante' : ''}`} role="group" aria-label="Estilo de la vista previa">
      {[
        ['atv', 'ATV'],
        ['mac', 'Mac'],
        ['claro', 'Claro'],
      ].map(([id, nombre]) => (
        <button key={id} type="button" aria-pressed={estilo === id} className={estilo === id ? 'is-on' : ''} onClick={() => setEstilo(id)}>
          {nombre}
        </button>
      ))}
    </div>
  )
}

// La página entera como una ventana de macOS: barra de título con la navegación y el contenido adentro.
export default function MacVentana({ titulo, children }) {
  const { user } = useAuth()
  return (
    <div className="mac-escritorio">
      <div className="mac-ventana" role="application" aria-label={`ATV Platform · ${titulo}`}>
        <div className="mac-titulo">
          <span className="mac-semaforo" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <nav className="mac-nav" aria-label="Secciones">
            {NAV.map(([to, label, end]) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'is-on' : '')}>
                {label}
              </NavLink>
            ))}
          </nav>
          <span className="mac-titulo__der">
            <SelectorEstilo />
            <span className="mac-avatar" title={user?.nombre}>
              {getUserInitials(user?.nombre)}
            </span>
          </span>
        </div>
        <div className="mac-cuerpo">{children}</div>
      </div>
    </div>
  )
}
