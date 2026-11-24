// Una tarjeta de Mi cuenta: ícono de línea, título y, si hace falta, un número al lado.
// Todas abiertas (sin desplegables): lo que hay en tu cuenta se ve de una.

const ICONOS = {
  plan: <path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" />,
  notificaciones: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  dispositivos: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M2 20h20" /></>,
  equipo: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  voz: <><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><path d="M12 19v3" /></>,
  fathom: <><rect x="2" y="6" width="14" height="12" rx="2" /><path d="m22 8-6 4 6 4z" /></>,
}

export default function Tarjeta({ titulo, icono, cuenta = null, ancha = false, children }) {
  return (
    <section className={`cuenta-seccion${ancha ? ' is-ancha' : ''}`}>
      <header className="cuenta-tarjeta__cab">
        {icono ? (
          <span className="cuenta-tarjeta__icono" aria-hidden="true">
            <svg viewBox="0 0 24 24">{ICONOS[icono]}</svg>
          </span>
        ) : null}
        <h2>{titulo}</h2>
        {cuenta != null ? <span className="cuenta-tarjeta__n">{cuenta}</span> : null}
      </header>
      <div className="cuenta-seccion__cuerpo">{children}</div>
    </section>
  )
}
