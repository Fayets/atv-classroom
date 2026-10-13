import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchCerebro, olvidarNeuronas, precargarNeurona } from '../api/cerebro'
import AppHeader from '../components/AppHeader'
import PanelNeurona from '../components/cerebro/PanelNeurona'
import { FORMAS, MotorGrafo, TIPOS } from '../components/cerebro/motorEsfera'
import { useMensajeria } from '../context/MensajeriaContext'
import { cuandoCorto, normal } from '../utils/mensajes'
import '../styles/cerebro.css'

// Lo mismo que arma el backend en /nodo, pero sacado del grafo que ya está cargado: cero espera.
function baseDe(grafo, id) {
  const nodos = new Map(grafo.nodos.map((n) => [n.id, n]))
  const yo = nodos.get(id)
  if (!yo) return null
  const vecinos = []
  for (const e of grafo.enlaces) {
    if (e.a !== id && e.b !== id) continue
    const otro = nodos.get(e.a === id ? e.b : e.a)
    if (otro) vecinos.push({ id: otro.id, tipo: otro.tipo, nombre: otro.nombre, vinculo: e.tipo, veces: e.veces, creado_en: e.creado_en })
  }
  vecinos.sort((x, y) => (!x.creado_en - !y.creado_en) || (x.creado_en || '').localeCompare(y.creado_en || '') || x.nombre.localeCompare(y.nombre))
  return { ...yo, vecinos }
}

// El cerebro del classroom: todo lo que sabe ATV y lo que va pasando con cada cliente, como Obsidian.
export default function CerebroPage() {
  const canvas = useRef(null)
  const motor = useRef(null)
  const [grafo, setGrafo] = useState(null)
  const [error, setError] = useState('')
  const [seleccion, setSeleccion] = useState(null)
  const [hover, setHover] = useState(null)
  const [ocultos, setOcultos] = useState([])
  const [buscar, setBuscar] = useState('')
  const [forma, setForma] = useState(() => {
    try {
      return FORMAS[localStorage.getItem('atv_cerebro_forma')] ? localStorage.getItem('atv_cerebro_forma') : 'esfera'
    } catch {
      return 'esfera'
    }
  })
  const { suscribir } = useMensajeria()
  const recarga = useRef(null)
  const precarga = useRef(null)

  const cargar = useCallback(() => {
    fetchCerebro()
      .then((g) => {
        olvidarNeuronas()
        setGrafo(g)
      })
      .catch((e) => setError(e.message || 'No se pudo cargar el cerebro.'))
  }, [])

  useEffect(() => {
    motor.current = new MotorGrafo(canvas.current, {
      alSeleccionar: (id) => setSeleccion(id),
      alHover: (n) => {
        setHover(n ? { id: n.id, nombre: n.nombre, tipo: n.tipo, grado: n.grado } : null)
        clearTimeout(precarga.current)
        if (n) precarga.current = setTimeout(() => precargarNeurona(n.id), 140)
      },
    })
    cargar()
    return () => motor.current?.destruir()
  }, [cargar])

  useEffect(() => {
    if (grafo) motor.current?.datos(grafo)
  }, [grafo])

  useEffect(() => {
    motor.current?.seleccionar(seleccion)
  }, [seleccion])

  useEffect(() => {
    motor.current?.ocultar(ocultos)
  }, [ocultos])

  useEffect(() => {
    motor.current?.forma(forma)
    try {
      localStorage.setItem('atv_cerebro_forma', forma)
    } catch {
      // sin almacenamiento, la forma vale mientras la página esté abierta
    }
  }, [forma])

  // Aprende en vivo: cada mensaje o etiqueta nueva puede sumar neuronas o conexiones.
  useEffect(
    () =>
      suscribir((ev) => {
        if (!['mensaje', 'mencion', 'borrado'].includes(ev.tipo)) return
        clearTimeout(recarga.current)
        recarga.current = setTimeout(cargar, 6000)
      }),
    [suscribir, cargar],
  )

  const resultados = useMemo(() => {
    const q = normal(buscar.trim())
    if (!q || !grafo) return []
    return grafo.nodos.filter((n) => normal(n.nombre).includes(q)).slice(0, 8)
  }, [buscar, grafo])

  const base = useMemo(() => (grafo && seleccion ? baseDe(grafo, seleccion) : null), [grafo, seleccion])
  const r = grafo?.resumen
  const alternar = (tipo) => setOcultos((o) => (o.includes(tipo) ? o.filter((x) => x !== tipo) : [...o, tipo]))

  return (
    <div className="app-shell cb-root">
      <AppHeader />
      <div className={seleccion ? 'cb-lienzo con-panel' : 'cb-lienzo'}>
        <canvas ref={canvas} className="cb-canvas" aria-label="Cerebro en 3D: arrastrá para girarlo y tocá una neurona para ver qué tiene" />

        <div className="cb-arriba">
          <div className="cb-titulo">
            <h1>Cerebro</h1>
            {r ? (
              <p>
                <b>{r.neuronas}</b> neuronas · <b>{r.conexiones}</b> conexiones · <b>{r.aprendidas}</b> aprendidas
                {r.ultima ? ` · la última ${cuandoCorto(r.ultima)}` : ''}
              </p>
            ) : (
              <p>{error || 'Cargando…'}</p>
            )}
          </div>
          <div className="cb-formas">
            <div className="cb-segmento" role="group" aria-label="Forma del cerebro">
              {Object.entries(FORMAS).map(([id, f]) => (
                <button key={id} type="button" aria-pressed={forma === id} onClick={() => setForma(id)}>
                  <span>{f.letra}</span>
                  {f.nombre}
                </button>
              ))}
            </div>
            <p className="cb-explica">{FORMAS[forma].texto}</p>
          </div>
          <div className="cb-buscar">
            <input
              id="cb-buscar"
              type="search"
              placeholder="Buscar una neurona"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && resultados[0]) {
                  setSeleccion(resultados[0].id)
                  setBuscar('')
                }
              }}
              aria-label="Buscar una neurona"
            />
            {resultados.length ? (
              <ul className="cb-resultados">
                {resultados.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSeleccion(n.id)
                        setBuscar('')
                      }}
                    >
                      <i style={{ background: TIPOS[n.tipo]?.color }} />
                      {n.nombre}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        <div className="cb-abajo">
          <div className="cb-leyenda" role="group" aria-label="Mostrar u ocultar tipos de neurona">
            {Object.entries(TIPOS).map(([tipo, t]) =>
              r?.por_tipo?.[tipo] ? (
                <button key={tipo} type="button" className={ocultos.includes(tipo) ? 'is-off' : ''} onClick={() => alternar(tipo)} aria-pressed={!ocultos.includes(tipo)}>
                  <i style={{ background: t.color }} />
                  {t.nombre} <small>{r.por_tipo[tipo]}</small>
                </button>
              ) : null,
            )}
          </div>
          <button type="button" className="cb-crecer" onClick={() => motor.current?.reproducir()}>
            Ver cómo creció
          </button>
        </div>

        {hover && hover.id !== seleccion ? (
          <div className="cb-tooltip">
            <i style={{ background: TIPOS[hover.tipo]?.color }} />
            {hover.nombre} <small>{hover.grado} conexiones</small>
          </div>
        ) : null}

        {seleccion ? <PanelNeurona id={seleccion} base={base} onIr={setSeleccion} onCerrar={() => setSeleccion(null)} /> : null}
      </div>
    </div>
  )
}
