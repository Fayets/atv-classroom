const PASOS = ['Resolver', 'Documentar', 'Automatizar']

export default function Pasos({ paso, compacto = false }) {
  return (
    <span className={`im-steps${compacto ? ' is-compact' : ''}`} aria-label={paso >= 3 ? 'Frente implementado' : `Etapa ${paso + 1} de 3: ${PASOS[paso]}`}>
      {PASOS.map((p, i) => (
        <span key={p} className={`im-steps__s${i < paso ? ' is-done' : ''}${i === paso ? ' is-now' : ''}`}>
          <i aria-hidden="true" />
          {compacto ? null : <span>{p}</span>}
        </span>
      ))}
    </span>
  )
}
