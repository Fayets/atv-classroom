import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/tema-claro.css'
import App from './App.jsx'
import Trabado from './components/Trabado'
import { avisoConsola } from './utils/avisoConsola'
import { registrarServiceWorker } from './utils/push'

avisoConsola()
// Después de una actualización la URL trae ?_v=…: se saca para que no quede a la vista.
if (new URLSearchParams(window.location.search).has('_v')) {
  const url = new URL(window.location.href)
  url.searchParams.delete('_v')
  window.history.replaceState(window.history.state, '', url.toString())
}
registrarServiceWorker()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Trabado>
      <App />
    </Trabado>
  </StrictMode>,
)
