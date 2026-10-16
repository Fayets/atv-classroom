import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import rough from 'roughjs'
import { fetchPizarra, rearmarPizarra } from '../../api/onboardings'
import { useAuth } from '../../context/AuthContext'
import '../../styles/pizarra.css'

// Pizarra del onboarding: el formulario dibujado a lápiz, como un Miro, para el coach que tiene el 1 a 1.
// Las piezas se acomodan con CSS (columnas) y los trazos a mano se dibujan encima midiendo dónde quedó
// cada una (data-r). Cada dato lleva el número de la pregunta de donde sale.

const TINTA = '#1b2470'
const ROJO = '#c0392b'
const LAPIZ = '#3b3a40'
const VERDE = '#2f7d4f'

const Ref = ({ p }) => (p ? <span className="pz-ref">P{p}</span> : null)

// "10, 11, 12, 13, 23, 24" → "P10–P13 · P23–P24"
function rangos(ps) {
  const n = ps.map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  const out = []
  for (let i = 0; i < n.length; i++) {
    let j = i
    while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++
    out.push(i === j ? `P${n[i]}` : `P${n[i]}–P${n[j]}`)
    i = j
  }
  return out.join(' · ')
}

function titulo(d) {
  if (d.negocios.length > 1) return d.negocios.map((n) => n.persona).join(' & ')
  return (d.nombre || '').replace(/[-_]+/g, ' ')
}

function Evidencia({ e }) {
  return e.cita ? <li><span className="pz-marcador">“{e.cita}”</span> <Ref p={e.p} /></li> : <li>{e.dato} <Ref p={e.p} /></li>
}

const fmt = (v) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(v)

// El embudo comercial con los números que escribió: cada tramo se dibuja a mano como un trapecio (data-r).
function Embudo({ etapas }) {
  const top = etapas[0].valor
  return (
    <div className="pz-bloque">
      <p className="pz-et">Su embudo <Ref p={etapas[0].p} /></p>
      <div className="pz-embudo" data-r="embudo">
        {etapas.map((e, k) => (
          <div key={k} className="pz-embudo__tramo" style={{ width: `${100 - (k * 62) / Math.max(etapas.length - 1, 1)}%` }}>
            <b>{fmt(e.valor)}</b> <span>{e.etapa}</span>
          </div>
        ))}
      </div>
      <ul className="pz-embudo__tasas">
        {etapas.slice(1).map((e, k) => (
          <li key={k}>{etapas[k].etapa} → {e.etapa}: <b className={e.valor / etapas[k].valor < 0.1 ? 'pz-rojo' : ''}>{fmt((e.valor / etapas[k].valor) * 100)}%</b></li>
        ))}
        <li className="pz-chico">de punta a punta: {fmt((etapas[etapas.length - 1].valor / top) * 100)}%</li>
      </ul>
    </div>
  )
}

// Un carril por cuello de botella, de izquierda a derecha: síntoma → causa raíz → impacto → solución.
function Cuello({ c, k, prioritario }) {
  return (
    <div className="pz-carril">
      <div className="pz-carril__cab">
        <p className="pz-et pz-cuello__titulo">
          <span className="pz-cuello__n">{k + 1}</span> {c.titulo}
        </p>
        {prioritario ? <span className="pz-prioridad">se ataca primero</span> : null}
        {c.su_frase ? (
          <div className="pz-postit is-claro" style={{ '--g': k % 2 ? '1.5deg' : '-1.5deg' }}>
            <p className="pz-chico">Lo que dice:</p>
            <p className="pz-cita">{c.su_frase.cita} <Ref p={c.su_frase.p} /></p>
            <p className="pz-chico pz-rojo">es un síntoma →</p>
          </div>
        ) : null}
      </div>
      <div className="pz-carril__pasos" data-r="flechas">
        <div className="pz-paso is-sintoma" data-r="caja-roja" data-seed={60 + k}>
          <p className="pz-paso__et pz-rojo">Síntoma</p>
          <p className="pz-tx">{c.sintoma.texto}</p>
          <ul className="pz-lista is-evidencia">{c.sintoma.evidencia.map((e, j) => <Evidencia key={j} e={e} />)}</ul>
        </div>
        <div className="pz-paso" data-r="caja" data-seed={70 + k}>
          <p className="pz-paso__et">Causa raíz</p>
          <p className="pz-tx">{c.causa}</p>
        </div>
        {c.impacto ? (
          <div className="pz-paso" data-r="caja" data-seed={80 + k}>
            <p className="pz-paso__et">Impacto</p>
            <p className="pz-tx">{c.impacto}</p>
          </div>
        ) : null}
        <div className="pz-paso is-solucion" data-r="caja-verde" data-seed={90 + k}>
          <p className="pz-paso__et pz-verde">Solución</p>
          <p className="pz-tx">{c.solucion}</p>
        </div>
      </div>
      {c.falta ? <div className="pz-falta" data-r="caja-punteada" data-seed={100 + k}><b>sin dato, preguntar:</b> {c.falta}</div> : null}
    </div>
  )
}

function Camino({ n }) {
  if (!n.hoy.length && !n.meta) return null
  return (
    <div className="pz-bloque">
      <p className="pz-et">De dónde parte → a dónde quiere llegar {n.meta ? <Ref p={n.meta.p} /> : null}</p>
      <div className="pz-camino" data-r="camino">
        <ul className="pz-lista is-hoy">
          <li className="pz-chico is-sin">hoy</li>
          {n.hoy.map((h, j) => <li key={j}>{h.texto} <Ref p={h.p} /></li>)}
        </ul>
        {n.meta ? (
          <div className="pz-meta" data-r="ovalo">
            <p className="pz-chico">en 4 meses</p>
            <p className="pz-num">{n.meta.titular}</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Negocio({ n, i, varios }) {
  return (
    <section className="pz-negocio" data-r="marco" data-seed={i}>
      <h2 className="pz-h">
        {varios ? n.persona : (n.marca || n.persona)} <small>{[varios ? n.marca : n.persona, n.rubro].filter(Boolean).join(' · ')}</small>
      </h2>

      <div className="pz-arriba">
        <div className="pz-col">
          {n.que_vende ? (
            <div className="pz-postit is-claro" style={{ '--g': i ? '1.5deg' : '-2deg' }}>
              <p className="pz-et">Qué vende</p>
              <p className="pz-tx">{n.que_vende.texto} <Ref p={n.que_vende.p} /></p>
            </div>
          ) : null}
          {n.contexto.length ? (
            <div className="pz-bloque">
              <p className="pz-et">Contexto</p>
              <ul className="pz-lista">
                {n.contexto.map((a, k) => <li key={k}>{a.texto} <Ref p={a.p} /></li>)}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="pz-col">
          {n.embudo?.length ? <Embudo etapas={n.embudo} /> : <Camino n={n} />}
        </div>
        <div className="pz-col">
          {n.embudo?.length ? <Camino n={n} /> : null}
          {n.freno ? (
            <div className="pz-postit" style={{ '--g': '2deg' }}>
              <p className="pz-et is-chica">Su freno, con sus palabras</p>
              <p className="pz-cita">{n.freno.cita} <Ref p={n.freno.p} /></p>
            </div>
          ) : null}
        </div>
      </div>

      {n.cuellos.length ? (
        <div className="pz-bloque">
          <h3 className="pz-h is-sub">Cuellos de botella detectados</h3>
          <div className="pz-cuellos">
            {n.cuellos.map((c, k) => <Cuello key={k} c={c} k={k} prioritario={n.prioridad?.cuello === k + 1} />)}
          </div>
        </div>
      ) : (
        <p className="pz-chico">El formulario no tiene datos suficientes para marcar cuellos de botella con evidencia.</p>
      )}

      <div className="pz-abajo">
        {n.prioridad ? (
          <div className="pz-bloque">
            <p className="pz-et">Prioridad para la llamada</p>
            <div className="pz-prioridad__fila">
              <span className="pz-num" data-r="circulo-num" data-seed={110 + i}>{n.prioridad.cuello}</span>
              <p className="pz-tx"><b>{n.cuellos[n.prioridad.cuello - 1]?.titulo}.</b> {n.prioridad.por_que}</p>
            </div>
          </div>
        ) : <div />}
        {n.decidir.length ? (
          <div className="pz-bloque">
            <p className="pz-et">Qué decidir hoy en la llamada</p>
            <ul className="pz-lista is-check">
              {n.decidir.map((q, k) => <li key={k}>{q}</li>)}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  )
}

const NOTA_ESTADO = { nada: 'pz-rojo', algo: '', listo: 'pz-verde', sin_dato: 'pz-gris' }

// Lo que vale para todo el formulario: el termómetro y las alertas, en una franja arriba.
function Franja({ d }) {
  if (!d.termometro.length && !d.alertas?.length) return null
  return (
    <div className="pz-franja">
      {d.termometro.length ? (
        <div className="pz-bloque">
          <p className="pz-et">Termómetro del negocio hoy</p>
          <div className="pz-termo">
            {d.termometro.map((t, k) => (
              <div key={t.nombre} className="pz-termo__fila">
                <span>{t.nombre}</span>
                <span className="pz-medidor" data-r="medidor" data-estado={t.estado} data-seed={30 + k} />
                <span className={`pz-chico ${NOTA_ESTADO[t.estado] || ''}`}>{t.nota} <Ref p={t.p} /></span>
              </div>
            ))}
          </div>
        </div>
      ) : <div />}
      {d.alertas?.length ? (
        <div className="pz-bloque">
          <p className="pz-et">Señales de alerta</p>
          <div className="pz-alertas">
            {d.alertas.map((a, k) => (
              <div key={k} className="pz-alerta" data-r={a.p ? 'ovalo-rojo' : 'ovalo-punteado'} data-seed={120 + k}>
                {a.texto} {a.p ? <Ref p={a.p} /> : <span className="pz-chico">sin dato</span>}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

// Trazos a mano sobre lo ya acomodado. Las medidas se toman sin el zoom (se divide por la escala).
function dibujar(svg, tablero, escala) {
  svg.innerHTML = ''
  const rc = rough.svg(svg)
  const base = { roughness: 1.6, bowing: 1.4, strokeWidth: 1.6 }
  const o = tablero.getBoundingClientRect()
  const caja = (el) => {
    const r = el.getBoundingClientRect()
    return { x: (r.left - o.left) / escala, y: (r.top - o.top) / escala, w: r.width / escala, h: r.height / escala }
  }
  const add = (n) => svg.appendChild(n)
  const seed = (el, extra = 0) => Number(el.dataset.seed || 0) + 3 + extra
  const flecha = (x1, y1, x2, y2, color) => {
    add(rc.line(x1, y1, x2, y2, { ...base, stroke: color, seed: 77 }))
    const a = Math.atan2(y2 - y1, x2 - x1)
    for (const d of [-0.5, 0.5]) add(rc.line(x2, y2, x2 - 12 * Math.cos(a + d), y2 - 12 * Math.sin(a + d), { roughness: 0.8, stroke: color, strokeWidth: 1.8 }))
  }

  svg.setAttribute('height', tablero.offsetHeight)
  const t = tablero.querySelector('.pz-titulo')
  if (t) {
    const b = caja(t)
    add(rc.line(b.x, b.y + b.h + 4, b.x + Math.min(b.w, 340), b.y + b.h, { ...base, stroke: ROJO, strokeWidth: 3, seed: 5 }))
  }
  tablero.querySelectorAll('[data-r]').forEach((el) => {
    const b = caja(el)
    const r = el.dataset.r
    if (r === 'marco') add(rc.rectangle(b.x, b.y, b.w, b.h, { ...base, stroke: TINTA, strokeWidth: 2, roughness: 2.2, seed: seed(el) }))
    else if (r === 'caja') add(rc.rectangle(b.x, b.y, b.w, b.h, { ...base, stroke: TINTA, seed: seed(el) }))
    else if (r === 'caja-tinta') add(rc.rectangle(b.x, b.y, b.w, b.h, { ...base, stroke: TINTA, fill: 'rgba(27,36,112,.05)', fillStyle: 'solid', seed: seed(el) }))
    else if (r === 'caja-roja') add(rc.rectangle(b.x, b.y, b.w, b.h, { ...base, stroke: ROJO, strokeWidth: 2.2, seed: seed(el) }))
    else if (r === 'caja-verde') add(rc.rectangle(b.x, b.y, b.w, b.h, { ...base, stroke: VERDE, strokeWidth: 2.4, fill: 'rgba(47,125,79,.06)', fillStyle: 'solid', seed: seed(el) }))
    else if (r === 'ovalo-rojo') add(rc.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w + 34, b.h + 26, { ...base, stroke: ROJO, strokeWidth: 2, seed: seed(el) }))
    else if (r === 'ovalo-punteado') add(rc.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w + 30, b.h + 22, { ...base, stroke: TINTA, strokeWidth: 1.4, strokeLineDash: [6, 6], seed: seed(el) }))
    else if (r === 'caja-punteada') add(rc.rectangle(b.x - 6, b.y - 4, b.w + 12, b.h + 8, { ...base, stroke: TINTA, strokeWidth: 1.3, strokeLineDash: [6, 6], seed: seed(el) }))
    else if (r === 'circulo-num') add(rc.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w + 34, b.h + 18, { ...base, stroke: ROJO, strokeWidth: 2.4, seed: seed(el) }))
    else if (r === 'embudo') {
      // Cada tramo es un trapecio: arriba su ancho, abajo el del tramo siguiente.
      const tramos = [...el.children].map(caja)
      tramos.forEach((t, k) => {
        const sig = tramos[k + 1]
        const abajo = sig ? sig.w : t.w * 0.55
        const cx = t.x + t.w / 2
        const pts = [[t.x, t.y], [t.x + t.w, t.y], [cx + abajo / 2, t.y + t.h], [cx - abajo / 2, t.y + t.h]]
        const ultimo = !sig
        add(rc.polygon(pts, { ...base, stroke: ultimo ? VERDE : TINTA, strokeWidth: 2, fill: ultimo ? 'rgba(47,125,79,.18)' : 'rgba(27,36,112,.10)', fillStyle: 'hachure', hachureGap: 7, seed: 140 + k }))
      })
    } else if (r === 'cadena') {
      // Síntoma → causa → impacto → solución, de arriba hacia abajo.
      const hijos = [...el.children].map(caja)
      for (let k = 0; k + 1 < hijos.length; k++) {
        const a = hijos[k], s = hijos[k + 1], x = a.x + Math.min(a.w, s.w) / 2
        flecha(x, a.y + a.h + 3, x, s.y - 4, TINTA)
      }
    }
    else if (r === 'circulo') add(rc.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w + 8, b.h + 4, { ...base, stroke: ROJO, strokeWidth: 2.2, seed: seed(el) }))
    else if (r === 'ovalo') add(rc.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w + 40, b.h + 30, { ...base, stroke: VERDE, strokeWidth: 2.2, seed: seed(el) }))
    else if (r === 'ovalo-chico') add(rc.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w + 14, b.h + 18, { ...base, stroke: TINTA, seed: seed(el) }))
    else if (r === 'medidor') {
      const lleno = { nada: 0, algo: 0.45, listo: 1 }[el.dataset.estado]
      add(rc.rectangle(b.x, b.y, b.w, b.h, { ...base, stroke: LAPIZ, strokeWidth: 1.3, seed: seed(el) }))
      if (lleno) {
        const color = lleno === 1 ? VERDE : TINTA
        add(rc.rectangle(b.x, b.y, b.w * lleno, b.h, { ...base, stroke: color, fill: color, fillStyle: 'hachure', hachureGap: 5, seed: seed(el, 9) }))
      } else if (el.dataset.estado === 'nada') add(rc.line(b.x + 3, b.y + b.h / 2, b.x + 16, b.y + b.h / 2, { ...base, stroke: ROJO, strokeWidth: 3 }))
      else add(rc.line(b.x + 4, b.y + b.h / 2, b.x + b.w - 4, b.y + b.h / 2, { ...base, stroke: '#9a98a0', strokeWidth: 1, strokeLineDash: [4, 6] }))
    } else if (r === 'flechas') {
      const hijos = [...el.children].map(caja)
      for (let k = 0; k + 1 < hijos.length; k++) {
        const a = hijos[k], s = hijos[k + 1]
        if (Math.abs(a.y - s.y) > a.h) continue // la fila se cortó: no se cruza la pizarra
        flecha(a.x + a.w + 3, a.y + a.h / 2, s.x - 5, s.y + s.h / 2, TINTA)
      }
    } else if (r === 'camino') {
      const [hoy, meta] = [...el.children].map(caja)
      if (hoy && meta) {
        const x1 = hoy.x + hoy.w + 6, x2 = meta.x - 26, y = meta.y + meta.h / 2
        add(rc.curve([[x1, y + 10], [(x1 + x2) / 2, y - 34], [x2, y]], { ...base, stroke: LAPIZ, strokeWidth: 2, seed: 8 }))
        flecha((x1 + x2) / 2, y - 34, x2, y, LAPIZ)
      }
    }
  })
  const faltan = tablero.querySelector('.pz-faltan .pz-num')
  if (faltan) {
    const b = caja(faltan)
    add(rc.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w + 26, b.h + 10, { ...base, stroke: ROJO, strokeWidth: 2, seed: 4 }))
  }
}

const ZOOM_MIN = 0.25
const ZOOM_MAX = 2

// Como abre un PDF: la hoja entera de ancho con aire a los costados, sin llegar a llenar
// la pantalla. Antes se ajustaba al ancho exacto y la pizarra quedaba encima de la vista.
function zoomInicial(c, ancho) {
  return Math.min(0.75, Math.max(ZOOM_MIN, (c.clientWidth - 120) / ancho))
}

export default function PizarraOnboarding({ id }) {
  const { isAdmin } = useAuth()
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [rearmando, setRearmando] = useState(false)
  const [rearmes, setRearmes] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [alto, setAlto] = useState(1200)
  const lienzo = useRef(null)
  const escala = useRef(null)
  const tablero = useRef(null)
  const svg = useRef(null)
  const ajustado = useRef(false)

  // Mientras la IA arma el diagnóstico el servidor contesta "armando": se vuelve a preguntar cada 5 s.
  const [armando, setArmando] = useState(false)
  useEffect(() => {
    let vivo = true
    let reloj = null
    setD(null)
    setError('')
    ajustado.current = false
    const pedir = () => fetchPizarra(id)
      .then((x) => {
        if (!vivo) return
        if (x?.estado === 'armando') {
          setArmando(true)
          reloj = setTimeout(pedir, 5000)
        } else {
          setArmando(false)
          setD(x)
        }
      })
      .catch((e) => vivo && (setArmando(false), setError(e.message || 'No se pudo abrir la pizarra.')))
    pedir()
    return () => {
      vivo = false
      clearTimeout(reloj)
    }
  }, [id, rearmes])

  // Apaisada, como una hoja de Miro: los carriles de cuellos de botella necesitan el ancho.
  const ancho = 1880

  // Se dibuja una vez por pizarra (con las fuentes ya cargadas); el zoom es un transform y no redibuja.
  useLayoutEffect(() => {
    if (!d || !tablero.current) return
    let vivo = true
    const listo = document.fonts?.ready || Promise.resolve()
    listo.then(() => {
      if (!vivo || !tablero.current) return
      const c = lienzo.current
      let z = zoom
      if (!ajustado.current && c) {
        z = zoomInicial(c, ancho)
        ajustado.current = true
        aplicar(z)
        setZoom(z)
      }
      dibujar(svg.current, tablero.current, tablero.current.getBoundingClientRect().width / ancho || z)
      setAlto(tablero.current.offsetHeight)
    })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d])

  // Arrastrar para moverse, como en Miro: scroll nativo, sin estado por cuadro.
  const arr = useRef(null)
  const bajar = useCallback((e) => {
    if (e.button !== 0 || e.target.closest('button, a')) return
    const c = lienzo.current
    arr.current = { x: e.clientX, y: e.clientY, l: c.scrollLeft, t: c.scrollTop }
    c.classList.add('is-arrastrando')
  }, [])
  useEffect(() => {
    const mover = (e) => {
      if (!arr.current) return
      const c = lienzo.current
      c.scrollLeft = arr.current.l - (e.clientX - arr.current.x)
      c.scrollTop = arr.current.t - (e.clientY - arr.current.y)
    }
    const soltar = () => {
      arr.current = null
      lienzo.current?.classList.remove('is-arrastrando')
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
    return () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
    }
  }, [])

  async function rearmar() {
    setRearmando(true)
    setError('')
    try {
      await rearmarPizarra(id)
      setRearmes((n) => n + 1) // vuelve a esperar al diagnóstico nuevo
    } catch (e) {
      setError(e.message || 'No se pudo volver a dibujar.')
    } finally {
      setRearmando(false)
    }
  }

  // El zoom se aplica directo al transform mientras dura el gesto (trackpad o ⌘ + rueda) y
  // el número de abajo se actualiza al terminar: un setState por evento de rueda hacía que
  // React re-renderizara la pizarra entera en cada cuadro y el gesto iba a los saltos.
  const zoomVivo = useRef(1)
  const pausa = useRef(null)
  const aplicar = useCallback((z) => {
    zoomVivo.current = z
    if (tablero.current) tablero.current.style.transform = `scale(${z})`
    if (escala.current) {
      escala.current.style.width = `${ancho * z}px`
      escala.current.style.height = `${(tablero.current?.offsetHeight || alto) * z}px`
    }
  }, [ancho, alto])

  // Acerca o aleja dejando quieto el punto que está debajo del cursor, como un visor de PDF.
  const zoomEn = useCallback((z, cx, cy) => {
    const c = lienzo.current
    if (!c) return
    const nuevo = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
    const viejo = zoomVivo.current
    const r = c.getBoundingClientRect()
    const px = (cx ?? r.left + c.clientWidth / 2) - r.left
    const py = (cy ?? r.top + c.clientHeight / 2) - r.top
    const ox = escala.current?.offsetLeft || 0
    const oy = escala.current?.offsetTop || 0
    const x = (c.scrollLeft + px - ox) / viejo
    const y = (c.scrollTop + py - oy) / viejo
    aplicar(nuevo)
    c.scrollLeft = x * nuevo + (escala.current?.offsetLeft || 0) - px
    c.scrollTop = y * nuevo + (escala.current?.offsetTop || 0) - py
    clearTimeout(pausa.current)
    pausa.current = setTimeout(() => setZoom(zoomVivo.current), 120)
  }, [aplicar])

  useEffect(() => {
    const c = lienzo.current
    if (!c) return undefined
    const rueda = (e) => {
      // El pellizco del trackpad llega como rueda con ctrlKey; ⌘ + rueda también hace zoom.
      // La rueda sola sigue desplazando, como en un PDF.
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      zoomEn(zoomVivo.current * Math.exp(-e.deltaY * 0.0045), e.clientX, e.clientY)
    }
    c.addEventListener('wheel', rueda, { passive: false })
    return () => c.removeEventListener('wheel', rueda)
  }, [zoomEn, d])

  const paso = (factor) => zoomEn(zoomVivo.current * factor)
  const ajustar = () => {
    const c = lienzo.current
    if (!c) return
    zoomEn(zoomInicial(c, ancho))
    c.scrollTo({ top: 0, left: 0 })
  }

  if (error && !d) return <p className="fd-vacio">{error}</p>
  if (!d) {
    return (
      <div className="pz-cargando">
        <span className="pz-lapiz" aria-hidden="true">✏️</span>
        <b>{armando ? 'Armando el diagnóstico…' : 'Abriendo la pizarra…'}</b>
        <span>{armando ? 'La IA lee el formulario y busca los cuellos de botella: tarda menos de un minuto. Podés seguir trabajando y volver.' : 'Un momento.'}</span>
      </div>
    )
  }

  const varios = d.negocios.length > 1
  return (
    <div className="pz-marco">
      <div className="pz-lienzo" ref={lienzo} onPointerDown={bajar}>
        <div className="pz-escala" ref={escala} style={{ width: ancho * zoom, height: alto * zoom }}>
          <div className="pz-tablero" ref={tablero} style={{ width: ancho, transform: `scale(${zoom})` }}>
            <svg className="pz-trazos" ref={svg} width={ancho} aria-hidden="true" />
            <header className="pz-cabeza">
              <div>
                <h1 className="pz-titulo">{titulo(d)}</h1>
                <p className="pz-bajada">{[d.plan, varios ? `${d.negocios.length} negocios` : null, d.llegada.find((x) => x.p === '32') ? `llegó por ${d.llegada.find((x) => x.p === '32').valor}` : null].filter(Boolean).join(' · ')}</p>
              </div>
              {varios ? (
                <div className="pz-postit" style={{ '--g': '2deg' }}>
                  <p className="pz-et pz-rojo">¡Ojo! Son {d.negocios.length} negocios, no 1</p>
                  <p className="pz-tx">{d.negocios.map((n) => n.persona).join(' y ')} tienen cada uno el suyo. En la llamada vas a atender {d.negocios.length} empresas.</p>
                </div>
              ) : null}
              {d.sin_responder.length ? (
                <div className="pz-faltan">
                  <p className="pz-et">Lo que no respondieron</p>
                  <p className="pz-tx"><span className="pz-num">{d.sin_responder.length}</span> <span className="pz-chico">de {d.total_preguntas} preguntas sin responder</span></p>
                  <p className="pz-chico">{rangos(d.sin_responder)} → preguntalo en la llamada</p>
                </div>
              ) : null}
            </header>
            <Franja d={d} />
            <div className="pz-negocios">
              {d.negocios.map((n, k) => <Negocio key={k} n={n} i={k} varios={varios} />)}
            </div>
          </div>
        </div>
      </div>
      <div className="pz-zoom" role="group" aria-label="Zoom">
        <button type="button" onClick={() => paso(1 / 1.2)} aria-label="Alejar">−</button>
        <span title="Pellizcá el trackpad o usá ⌘ + rueda para hacer zoom">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => paso(1.2)} aria-label="Acercar">+</button>
        <button type="button" className="is-texto" onClick={ajustar}>Ajustar</button>
        {isAdmin ? <button type="button" className="is-texto" onClick={rearmar} disabled={rearmando} title="Vuelve a leer el formulario con la IA">{rearmando ? 'Dibujando…' : 'Volver a dibujar'}</button> : null}
      </div>
      {error ? <p className="pz-error">{error}</p> : null}
    </div>
  )
}
