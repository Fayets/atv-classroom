import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/tema-claro.css'
import './styles/tema-azul.css'
import App from './App.jsx'
import Trabado from './components/Trabado'
import { avisoConsola } from './utils/avisoConsola'
import { registrarServiceWorker } from './utils/push'
import { escucharErrores } from './utils/errores'

avisoConsola()
escucharErrores()
// Después de una actualización la URL trae ?_v=…: se saca para que no quede a la vista.
if (new URLSearchParams(window.location.search).has('_v')) {
  const url = new URL(window.location.href)
  url.searchParams.delete('_v')
  window.history.replaceState(window.history.state, '', url.toString())
}
registrarServiceWorker()

const montar = () =>
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <Trabado>
        <App />
      </Trabado>
    </StrictMode>,
  )

// Modo mock (`npm run dev:mock`): se espera a que los datos de prueba estén
// listos antes de montar, así el chat en vivo nunca intenta conectarse al backend real.
// Sin esa variable la condición vale false al compilar y esta rama desaparece del bundle.
if (import.meta.env.VITE_MOCK_API === '1') import('./api/mock/handler.js').then(montar)
else montar()
