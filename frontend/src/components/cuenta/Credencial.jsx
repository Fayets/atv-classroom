import { HugeiconsIcon } from '@hugeicons/react'
import { Camera01Icon } from '../iconos/hugeicons'
import { getUserInitials } from '../../utils/user'
import '../../styles/credencial.css'

// La credencial de Mi cuenta: un pase de socio sobrio, con la tinta carbón del Brandbook. Arriba, la lámina con
// la foto (o las iniciales como marca de agua) y los datos en claro sobre oscuro, sin brillos para que se lea
// bien. (El talón con rol/área, el sello y el pie con "Cerrar sesión" se sacaron: el logout está en el menú del
// avatar y los datos del plan en la sección "Tu plan". La foto se cambia solo desde la cámara.)
export default function Credencial({ cuenta: c, nombre, tipo, subiendo, alElegirFoto }) {
  const esCliente = c.tipo === 'cliente'
  const area = c.area ? c.area.charAt(0).toUpperCase() + c.area.slice(1) : null

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

        <span className="cred__borde" />
      </div>
    </div>
  )
}
