import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/tema-claro.css'
import App from './App.jsx'
import { avisoConsola } from './utils/avisoConsola'
import { registrarServiceWorker } from './utils/push'

avisoConsola()
registrarServiceWorker()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
