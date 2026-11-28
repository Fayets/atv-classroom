import { Link } from 'react-router-dom'
import { Chevron } from '../frentes/piezas'
import { getModuloCoverUrl, getModuloResumen } from '../../utils/modules'
import '../../styles/archivo.css'

// Todo el material como un archivo: cada módulo es una carpeta de cartón con su pestaña numerada, la portada
// y una hoja asomando por arriba, y en el frente la etiqueta con el nombre, las clases y el avance.
// Al pasar el mouse la carpeta se abre un poco y las hojas suben (en el celular ya asoman de entrada).
// Completo lleva un sello; bloqueado, una banda elástica cruzada; sin clases, la carpeta vacía y punteada.
export default function ArchivoModulos({ modulos }) {
  const seguir = modulos.find((m) => !m.bloqueado && m.total_clases && (m.porcentaje_progreso ?? 0) > 0 && m.porcentaje_progreso < 100)

  return (
    <div className="cr-material">
      {seguir ? (
        <Link to={`/classroom/${seguir.id}`} className="cr-seguir">
          <span className="cr-seguir__portada" aria-hidden="true">
            <img src={getModuloCoverUrl(seguir)} alt="" decoding="async" />
          </span>
          <span className="cr-seguir__txt">
            <small>Seguí donde quedaste</small>
            <b>{seguir.titulo}</b>
          </span>
          <span className="cr-seguir__pct num">{seguir.porcentaje_progreso}%</span>
          <span className="cr-seguir__ir" aria-hidden="true">
            <Chevron />
          </span>
        </Link>
      ) : null}

      <ul className="ar-archivo" aria-label="Módulos">
        {modulos.map((m, i) => (
          <li key={m.id} style={{ '--i': i }}>
            <Carpeta modulo={m} numero={i + 1} enCurso={seguir?.id === m.id} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function Carpeta({ modulo: m, numero, enCurso }) {
  const vacio = !m.total_clases
  const cerrado = vacio || m.bloqueado
  const pct = Math.min(100, Math.max(0, m.porcentaje_progreso ?? 0))
  const completo = !cerrado && pct === 100
  const n = String(numero).padStart(2, '0')
  const estado = m.bloqueado
    ? m.motivo_bloqueo === 'plan' ? 'Bloqueado' : 'Se desbloquea pronto'
    : vacio
      ? 'Próximamente'
      : completo
        ? 'Completo'
        : pct
          ? `${pct}%`
          : 'Sin empezar'
  const portada = getModuloCoverUrl(m)
  const resumen = getModuloResumen(m)

  const clases = `ar-carpeta${cerrado ? ' is-cerrado' : ''}${vacio ? ' is-vacio' : ''}${m.bloqueado ? ' is-bloqueado' : ''}${completo ? ' is-completo' : ''}${enCurso ? ' is-en-curso' : ''}`
  const contenido = (
    <>
      <span className="ar-carpeta__atras" aria-hidden="true">
        <span className="ar-carpeta__pestana num">{n}</span>
      </span>

      <span className="ar-carpeta__frente">
        {/* The original cover, always visible: it tells what the module is about before opening it. */}
        <span className="ar-carpeta__portada" aria-hidden="true">
          {portada ? <img src={portada} alt="" loading="lazy" decoding="async" onError={(e) => e.currentTarget.remove()} /> : null}
        </span>
        <span className="ar-carpeta__titulo">{m.titulo}</span>
        {resumen ? <span className="ar-carpeta__resumen">{resumen}</span> : null}
        <span className="ar-carpeta__meta">
          {vacio ? null : <span className="num">{m.total_clases} clases</span>}
          <span className={`ar-carpeta__estado num${!cerrado && !completo && pct ? ' is-avance' : ''}`}>
            {m.bloqueado ? (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
                <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
              </svg>
            ) : null}
            {estado}
          </span>
        </span>
        {cerrado ? null : (
          <span className="ar-carpeta__avance" aria-hidden="true">
            <i style={{ transform: `scaleX(${pct / 100})` }} />
          </span>
        )}
        {completo ? (
          <span className="ar-sello" aria-hidden="true">
            Completo
          </span>
        ) : null}
      </span>
      {m.bloqueado ? <span className="ar-banda" aria-hidden="true" /> : null}
    </>
  )

  return cerrado ? (
    <div className={clases} aria-label={`${m.titulo}: ${estado}`}>
      {contenido}
    </div>
  ) : (
    <Link to={`/classroom/${m.id}`} className={clases} aria-label={`${m.titulo}: ${m.total_clases} clases, ${estado}`}>
      {contenido}
    </Link>
  )
}
