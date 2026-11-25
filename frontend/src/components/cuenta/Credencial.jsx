import { HugeiconsIcon } from '@hugeicons/react'
import { Camera01Icon, Delete02Icon, Logout03Icon } from '../iconos/hugeicons'
import { getUserInitials } from '../../utils/user'
import '../../styles/credencial.css'

// La credencial de Mi cuenta: un pase de socio sobrio, con la tinta carbón del Brandbook. Arriba, la lámina con
// la foto (o las iniciales como marca de agua) y los datos en claro sobre oscuro, sin brillos para que se lea
// bien. Abajo, el talón con un PASE PERFORADO: un agujero por semana del programa; las que ya pasaron están
// picadas (como un boleto) y la de hoy late en rojo.
const MAX_SEMANAS = 52

const fechaCorta = (iso) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '') : '—'

// El pase perforado: un agujero por semana; las que pasaron, picadas; la de hoy, en rojo.
function PasePerforado({ cuenta: c }) {
  const total = c.duracion_dias || 0
  const dias = c.dias_restantes
  if (!total || dias == null) return null
  const semanas = Math.min(MAX_SEMANAS, Math.max(1, Math.ceil(total / 7)))
  const pasados = Math.min(total, Math.max(0, total - dias))
  const actual = Math.min(semanas - 1, Math.floor(pasados / 7))
  const vencido = dias < 0
  return (
    <div className="cred-pase">
      <div className="cred-pase__cuenta">
        <b className="num">{Math.max(0, dias)}</b>
        <span>
          {vencido ? 'acceso vencido' : dias === 1 ? 'día de acceso' : 'días de acceso'}
          <small>
            Semana {Math.min(semanas, actual + 1)} de {semanas}
          </small>
        </span>
      </div>
      <ol className="cred-pase__agujeros" style={{ '--columnas': Math.min(13, semanas) }} aria-label={`Semana ${actual + 1} de ${semanas}`}>
        {Array.from({ length: semanas }, (_, i) => (
          <li key={i} className={vencido || i < actual ? 'is-picada' : i === actual ? 'is-ahora' : ''} />
        ))}
      </ol>
    </div>
  )
}

export default function Credencial({ cuenta: c, nombre, tipo, subiendo, alElegirFoto, alQuitarFoto, alSalir }) {
  const esCliente = c.tipo === 'cliente'
  const area = c.area ? c.area.charAt(0).toUpperCase() + c.area.slice(1) : null
  const estado = esCliente ? c.estado_texto || (c.dias_restantes != null && c.dias_restantes < 0 ? 'Vencido' : 'Vigente') : c.rol_nombre || 'Equipo'

  return (
    <div className="cred">
      <div className="cred__cuerpo">
        <div className={`cred__lamina${c.foto_url ? ' con-foto' : ''}`}>
          {c.foto_url ? (
            <img className="cred__foto" src={c.foto_url} alt="" referrerPolicy="no-referrer" draggable={false} />
          ) : (
            <span className="cred__monograma" aria-hidden="true">
              {getUserInitials(c.nombre)}
            </span>
          )}
          <span className="cred__velo" />
          <div className="cred__tapa">
            <span>ATV · Credencial</span>
            <span className="cred__tipo">{tipo}</span>
          </div>
          <button
            type="button"
            className={`cred__camara${subiendo ? ' is-subiendo' : ''}`}
            onClick={alElegirFoto}
            disabled={subiendo}
            aria-label={c.foto_propia ? 'Cambiar foto' : 'Subir foto'}
            title={c.foto_propia ? 'Cambiar foto' : 'Subir foto'}
          >
            <HugeiconsIcon icon={Camera01Icon} size={17} strokeWidth={1.8} />
          </button>
          <div className="cred__info">
            {nombre}
            <p className="cred__mail">{c.email}</p>
            <div className="cred__chips">
              {esCliente ? (
                c.plan_nombre ? <span className="is-acento">{c.plan_nombre}</span> : null
              ) : (
                <>
                  {c.rol_nombre ? <span className="is-acento">{c.rol_nombre}</span> : null}
                  {area ? <span>{area}</span> : null}
                </>
              )}
            </div>
          </div>
          <span className="cred__filo" />
        </div>

        <div className="cred__corte" aria-hidden="true" />

        <div className="cred__talon">
          {esCliente ? <PasePerforado cuenta={c} /> : null}
          <dl className="cred__fechas">
            {esCliente ? (
              <>
                <div><dt>Desde</dt><dd>{fechaCorta(c.fecha_inicio)}</dd></div>
                <div><dt>Vence</dt><dd>{fechaCorta(c.fecha_vencimiento)}</dd></div>
              </>
            ) : (
              <>
                <div><dt>Rol</dt><dd>{c.rol_nombre || '—'}</dd></div>
                <div><dt>Área</dt><dd>{area || '—'}</dd></div>
              </>
            )}
          </dl>
          <span className="marca-pastilla cred__sello" role="img" aria-label="Aumenta tu valor" />
        </div>


        <div className="cred__pie">
          <span className={`cred__estado is-${esCliente ? c.estado || 'vigente' : 'equipo'}`}>{estado}</span>
          {c.foto_propia ? (
            <button type="button" className="cred__boton is-icono" onClick={alQuitarFoto} disabled={subiendo} aria-label="Quitar foto" title="Quitar foto">
              <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.8} />
            </button>
          ) : null}
          <button type="button" className="cred__boton" onClick={alSalir}>
            <HugeiconsIcon icon={Logout03Icon} size={16} strokeWidth={1.8} />
            Cerrar sesión
          </button>
        </div>

        <span className="cred__borde" />
      </div>
    </div>
  )
}
