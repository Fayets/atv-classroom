import { Component } from 'react'

const CLAVE = 'atv-trabado'

// Si algo falla al dibujar una pantalla, React desarma toda la app y queda en blanco (en la app de Mac,
// sin forma de salir). Esto lo ataja: la primera vez recarga sola; si vuelve a fallar en menos de un
// minuto, muestra el error con un botón para recargar, así se puede mandar la captura.
export default class Trabado extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('ATV Classroom se trabó:', error, info?.componentStack)
    let ultimo = 0
    try {
      ultimo = Number(sessionStorage.getItem(CLAVE)) || 0
      if (Date.now() - ultimo > 60_000) {
        sessionStorage.setItem(CLAVE, String(Date.now()))
        window.location.reload()
      }
    } catch {
      // sin sessionStorage: se queda el cartel con el botón
    }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="trabado" role="alert">
        <div className="trabado__caja">
          <b>Algo se trabó</b>
          <p>Recargá la pantalla y seguís donde estabas.</p>
          <button type="button" onClick={() => window.location.reload()}>Recargar</button>
          <code>{String(error?.message || error).slice(0, 300)}</code>
        </div>
      </div>
    )
  }
}
