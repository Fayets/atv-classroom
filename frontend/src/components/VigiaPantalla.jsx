import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { marcarRuta, reportarError } from '../utils/errores'

// Si después de cambiar de pantalla no hay nada a la vista (la página quedó en blanco sin error), se avisa al
// servidor con la ruta y de dónde venía. Así se puede encontrar la causa de "se queda en blanco".
export default function VigiaPantalla() {
  const { pathname } = useLocation()
  const previa = useRef(null)
  useEffect(() => {
    const desde = previa.current
    previa.current = pathname
    const t = setTimeout(() => {
      if (document.hidden) return
      // En el escritorio del equipo se mira la ventana que está al frente (íconos y Dock siempre hay).
      const raiz = document.querySelector('.esc-ventana.is-frente') || document.getElementById('root')
      const texto = (raiz?.innerText || '').trim()
      const visibles = raiz ? [...raiz.querySelectorAll('main, section, article, img, button, a')].filter((el) => {
        const r = el.getBoundingClientRect()
        const st = getComputedStyle(el)
        return r.width > 20 && r.height > 20 && st.visibility !== 'hidden' && Number(st.opacity) > 0.05
      }).length : 0
      if (texto.length < 3 || visibles === 0) reportarError('pantalla-vacia', `Pantalla vacía en ${pathname}`, { componentes: `texto=${texto.length} visibles=${visibles}` })
    }, 3500)
    marcarRuta(desde)
    return () => clearTimeout(t)
  }, [pathname])
  return null
}
