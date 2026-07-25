import { NavLink } from 'react-router-dom'

const TABS = [
  { id: 'classroom', label: 'Classroom', to: '/classroom' },
  { id: 'recursos', label: 'Recursos', to: '/recursos' },
  { id: 'comunidad', label: 'Comunidad', to: '/comunidad' },
]

export default function MainNav({ activeTab = null }) {
  return (
    <nav className="main-nav" aria-label="Secciones principales">
      {TABS.map((tab, index) => (
        <span key={tab.id} className="main-nav__item-wrap">
          {index > 0 ? (
            <span className="main-nav__divider" aria-hidden="true" />
          ) : null}
          <NavLink
            to={tab.to}
            end={tab.id === 'classroom'}
            className={() =>
              [
                'main-nav__link',
                activeTab === tab.id ? 'main-nav__link--active' : '',
              ]
                .filter(Boolean)
                .join(' ')
            }
          >
            {tab.label}
          </NavLink>
        </span>
      ))}
    </nav>
  )
}
