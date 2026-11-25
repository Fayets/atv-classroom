import { useEffect, useRef } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Camera01Icon, Delete02Icon, Logout03Icon } from '../iconos/hugeicons'
import { getUserInitials } from '../../utils/user'
import '../../styles/credencial.css'

// La credencial de Mi cuenta: un pase de socio holográfico. Mezcla dos cosas:
//   - De la ProfileCard de React Bits: el marco de vidrio, la lámina con brillo holográfico, el reflejo que
//     sigue al mouse y la inclinación 3D con resorte (el motor de abajo es el suyo, con variables --cr-*).
//   - De la credencial anterior: la tinta oscura con anillos "de seguridad" y el talón con muescas.
// En la lámina va la foto o, si no hay, el monograma gigante, donde más se nota el holograma. En el talón,
// en vez del anillo de días, un PASE PERFORADO: un agujero por semana del programa; las que ya pasaron están
// picadas (como un boleto) y la de hoy late en rojo.

const MAX_SEMANAS = 52

const resorteado = (valor, min, max) => Math.min(max, Math.max(min, valor))

// El motor de la ProfileCard: sigue al puntero con un resorte y escribe las variables que mueven las capas.
function useInclinacion(raiz, { fuerza = 7, profundidad = 8 } = {}) {
  useEffect(() => {
    const el = raiz.current
    if (!el) return undefined
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const tam = { w: el.offsetWidth, h: el.offsetHeight }
    const x = { p: 0, v: 0, meta: 0 }
    const y = { p: 0, v: 0, meta: 0 }
    const luz = { p: 0, meta: 0 }
    let raf = 0
    let ultimo = 0
    let lentoHasta = 0
    let dedo = null

    const escribir = () => {
      const angulo = reducido ? 0 : fuerza
      const inclinado = Math.min(1, Math.hypot(x.p, y.p))
      const s = el.style
      s.setProperty('--cr-luz-x', `${((x.p + 1) * 0.5 * tam.w).toFixed(1)}px`)
      s.setProperty('--cr-luz-y', `${((y.p + 1) * 0.5 * tam.h).toFixed(1)}px`)
      s.setProperty('--cr-puntero-x', `${((x.p + 1) * 50).toFixed(2)}%`)
      s.setProperty('--cr-puntero-y', `${((y.p + 1) * 50).toFixed(2)}%`)
      s.setProperty('--cr-banda-x', `${(50 + x.p * 15).toFixed(2)}%`)
      s.setProperty('--cr-banda-y', `${(50 + y.p * 15).toFixed(2)}%`)
      s.setProperty('--cr-giro-x', `${(y.p * angulo).toFixed(3)}deg`)
      s.setProperty('--cr-giro-y', `${(-x.p * angulo).toFixed(3)}deg`)
      s.setProperty('--cr-mueve-x', `${(x.p * (reducido ? 0 : profundidad)).toFixed(2)}px`)
      s.setProperty('--cr-mueve-y', `${(y.p * (reducido ? 0 : profundidad)).toFixed(2)}px`)
      s.setProperty('--cr-alcance', inclinado.toFixed(4))
      s.setProperty('--cr-inclina', (inclinado * luz.p).toFixed(4))
      s.setProperty('--cr-activo', luz.p.toFixed(4))
    }

    const cuadro = (ahora) => {
      const dt = Math.min(0.05, (ahora - ultimo) / 1000 || 0)
      ultimo = ahora
      const lento = ahora < lentoHasta
      const rigidez = lento ? 24 : 120
      const freno = lento ? 9 : 16
      const pasos = Math.max(1, Math.ceil(dt / (1 / 120)))
      const h = dt / pasos
      for (let i = 0; i < pasos; i++) {
        for (const eje of [x, y]) {
          eje.v += (rigidez * (eje.meta - eje.p) - freno * eje.v) * h
          eje.p += eje.v * h
        }
      }
      const tau = luz.meta > luz.p ? 0.18 : lento ? 0.9 : 0.45
      luz.p += (luz.meta - luz.p) * (1 - Math.exp(-dt / tau))
      escribir()
      const sigue =
        Math.abs(x.meta - x.p) > 0.0005 ||
        Math.abs(y.meta - y.p) > 0.0005 ||
        Math.abs(x.v) > 0.0005 ||
        Math.abs(y.v) > 0.0005 ||
        Math.abs(luz.meta - luz.p) > 0.002
      if (sigue) raf = requestAnimationFrame(cuadro)
      else {
        x.p = x.meta
        y.p = y.meta
        luz.p = luz.meta
        escribir()
        raf = 0
      }
    }
    const despertar = () => {
      if (raf) return
      ultimo = performance.now()
      raf = requestAnimationFrame(cuadro)
    }
    const apuntar = (nx, ny, prendida = true) => {
      x.meta = resorteado(nx, -1, 1)
      y.meta = resorteado(ny, -1, 1)
      luz.meta = prendida ? 1 : 0
      lentoHasta = 0
      despertar()
    }
    const apuntarA = (e) => {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) return
      apuntar(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1)
    }
    const soltar = () => apuntar(0, 0, false)
    const alEntrar = (e) => e.pointerType === 'mouse' && apuntarA(e)
    const alMover = (e) => (e.pointerType === 'mouse' || e.pointerId === dedo) && apuntarA(e)
    const alSalir = (e) => e.pointerType === 'mouse' && soltar()
    const alApretar = (e) => {
      if (e.pointerType === 'mouse') return
      dedo = e.pointerId
      apuntarA(e)
    }
    const alLevantar = (e) => {
      if (e.pointerId !== dedo) return
      dedo = null
      soltar()
    }
    el.addEventListener('pointerenter', alEntrar)
    el.addEventListener('pointermove', alMover)
    el.addEventListener('pointerleave', alSalir)
    el.addEventListener('pointerdown', alApretar)
    el.addEventListener('pointerup', alLevantar)
    el.addEventListener('pointercancel', alLevantar)
    const medidas = new ResizeObserver(() => {
      tam.w = el.offsetWidth
      tam.h = el.offsetHeight
      escribir()
    })
    medidas.observe(el)

    // Entrada: arranca inclinada y con la luz prendida, y se acomoda despacio.
    if (!reducido) {
      x.p = 0.62
      y.p = -0.55
      luz.p = 1
      lentoHasta = performance.now() + 1400
      escribir()
      despertar()
    } else escribir()

    return () => {
      cancelAnimationFrame(raf)
      medidas.disconnect()
      el.removeEventListener('pointerenter', alEntrar)
      el.removeEventListener('pointermove', alMover)
      el.removeEventListener('pointerleave', alSalir)
      el.removeEventListener('pointerdown', alApretar)
      el.removeEventListener('pointerup', alLevantar)
      el.removeEventListener('pointercancel', alLevantar)
    }
  }, [raiz, fuerza, profundidad])
}

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

export default function Credencial({ cuenta: c, nombre, tipo, subiendo, alElegirFoto, alQuitarFoto, alSalir, interruptor = null }) {
  const raiz = useRef(null)
  useInclinacion(raiz)
  const esCliente = c.tipo === 'cliente'
  const area = c.area ? c.area.charAt(0).toUpperCase() + c.area.slice(1) : null
  const estado = esCliente ? c.estado_texto || (c.dias_restantes != null && c.dias_restantes < 0 ? 'Vencido' : 'Vigente') : c.rol_nombre || 'Equipo'

  return (
    <div className="cred" ref={raiz}>
      <div className="cred__cuerpo">
        <div className={`cred__lamina${c.foto_url ? ' con-foto' : ''}`}>
          <span className="cred__brillo" />
          {c.foto_url ? (
            <img className="cred__foto" src={c.foto_url} alt="" referrerPolicy="no-referrer" draggable={false} />
          ) : (
            <span className="cred__monograma" aria-hidden="true">
              {getUserInitials(c.nombre)}
            </span>
          )}
          <span className="cred__holo">
            <span className="cred__holo-luz" />
            <span className="cred__holo-giro" />
          </span>
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
        </div>

        {interruptor}

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

        <span className="cred__reflejo" />
        <span className="cred__sombra" />
        <span className="cred__borde" />
      </div>
    </div>
  )
}
