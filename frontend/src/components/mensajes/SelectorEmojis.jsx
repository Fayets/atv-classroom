import { useEffect, useMemo, useRef, useState } from 'react'
import github from 'emojibase-data/en/shortcodes/github.json'
import { normal } from '../../utils/mensajes'

// Grupos de emojibase (el 2 son los tonos de piel sueltos: no van).
const GRUPOS = [
  [0, 'Caras', '😀'],
  [1, 'Personas', '👋'],
  [3, 'Naturaleza', '🐶'],
  [4, 'Comida', '🍕'],
  [5, 'Viajes', '✈️'],
  [6, 'Actividades', '⚽'],
  [7, 'Objetos', '💡'],
  [8, 'Símbolos', '✅'],
  [9, 'Banderas', '🏁'],
]
const RECIENTES = 'atv_emojis_recientes'
const sinVS = (hex) => hex.replace(/-FE0F/g, '')
const ATAJOS_POR_HEX = new Map(Object.entries(github).map(([hex, c]) => [sinVS(hex), [].concat(c)]))

let datos = null // se baja una sola vez, cuando alguien abre el selector
function cargar() {
  datos ??= import('emojibase-data/es/compact.json').then((m) =>
    (m.default || m)
      .filter((e) => e.group !== undefined && e.group !== 2)
      .map((e) => ({
        emoji: e.unicode,
        grupo: e.group,
        buscar: normal([e.label, ...(e.tags || []), ...(ATAJOS_POR_HEX.get(sinVS(e.hexcode)) || [])].join(' ')),
        nombre: e.label,
      })),
  )
  return datos
}

function leerRecientes() {
  try {
    return JSON.parse(localStorage.getItem(RECIENTES) || '[]').slice(0, 24)
  } catch {
    return []
  }
}

export default function SelectorEmojis({ onElegir, onCerrar }) {
  const [lista, setLista] = useState(null)
  const [q, setQ] = useState('')
  const [recientes, setRecientes] = useState(leerRecientes)
  const raiz = useRef(null)
  const grilla = useRef(null)

  useEffect(() => {
    let vivo = true
    cargar().then((l) => vivo && setLista(l))
    return () => {
      vivo = false
    }
  }, [])

  useEffect(() => {
    const fuera = (e) => raiz.current && !raiz.current.contains(e.target) && !e.target.closest?.('.msj-emoji-abrir') && onCerrar()
    const esc = (e) => e.key === 'Escape' && onCerrar()
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', fuera)
      document.removeEventListener('keydown', esc)
    }
  }, [onCerrar])

  const encontrados = useMemo(() => {
    const b = normal(q.trim().replace(/^:/, ''))
    if (!b || !lista) return null
    // Primero los que se llaman así ("fuego" → 🔥), después los que lo mencionan.
    const exacto = (e) => (normal(e.nombre) === b ? 0 : normal(e.nombre).startsWith(b) ? 1 : 2)
    return lista
      .filter((e) => e.buscar.includes(b))
      .sort((x, y) => exacto(x) - exacto(y))
      .slice(0, 120)
  }, [q, lista])

  function elegir(emoji) {
    const nuevos = [emoji, ...recientes.filter((x) => x !== emoji)].slice(0, 24)
    setRecientes(nuevos)
    try {
      localStorage.setItem(RECIENTES, JSON.stringify(nuevos))
    } catch {
      /* sin almacenamiento: los recientes duran lo que la pestaña */
    }
    onElegir(emoji)
  }

  const boton = (e) => (
    <button key={e.emoji} type="button" title={e.nombre} onClick={() => elegir(e.emoji)}>
      {e.emoji}
    </button>
  )

  return (
    <div className="msj-emojis" ref={raiz} role="dialog" aria-label="Emojis">
      <input className="msj-emojis__buscar" autoFocus placeholder="Buscar emoji" value={q} onChange={(e) => setQ(e.target.value)} />
      {!encontrados ? (
        <nav className="msj-emojis__grupos">
          {GRUPOS.map(([id, nombre, icono]) => (
            <button key={id} type="button" title={nombre} onClick={() => grilla.current?.querySelector(`[data-grupo="${id}"]`)?.scrollIntoView({ block: 'start' })}>
              {icono}
            </button>
          ))}
        </nav>
      ) : null}
      <div className="msj-emojis__grilla" ref={grilla}>
        {!lista ? <p className="msj-emojis__vacio">Cargando…</p> : null}
        {encontrados ? (
          encontrados.length ? <div className="msj-emojis__fila">{encontrados.map(boton)}</div> : <p className="msj-emojis__vacio">No hay emojis con “{q}”.</p>
        ) : lista ? (
          <>
            {recientes.length ? (
              <section>
                <h4>Recientes</h4>
                <div className="msj-emojis__fila">{recientes.map((emoji) => boton({ emoji, nombre: '' }))}</div>
              </section>
            ) : null}
            {GRUPOS.map(([id, nombre]) => (
              <section key={id} data-grupo={id}>
                <h4>{nombre}</h4>
                <div className="msj-emojis__fila">{lista.filter((e) => e.grupo === id).map(boton)}</div>
              </section>
            ))}
          </>
        ) : null}
      </div>
    </div>
  )
}
