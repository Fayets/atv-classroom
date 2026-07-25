import AppHeader from '../components/AppHeader'
import MainNav from '../components/MainNav'

export default function PlaceholderPage({ title, activeTab = null }) {
  return (
    <div className="app-shell">
      <AppHeader />

      <main className="placeholder-page">
        {activeTab ? (
          <div className="placeholder-page__nav">
            <MainNav activeTab={activeTab} />
          </div>
        ) : null}

        <div className="page-state page-state--plain">
          <p className="page-state__title">{title}</p>
          <p className="page-state__text">Próximamente</p>
        </div>
      </main>
    </div>
  )
}
