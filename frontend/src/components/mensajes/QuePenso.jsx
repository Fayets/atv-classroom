import { useCallback, useEffect, useState } from 'react'
import { agregarReglaVoz, borrarReglaVoz, fetchReglasVoz } from '../../api/mensajes'

// "Qué pensó": al costado del chat, lo que el Tab entendió antes de sugerir (lo calcula el código, sin
// gastar IA) y cómo corregirlo. Cada corrección queda como regla de tu voz y entra en todas tus sugerencias.
const RAPIDAS = [
  ['Ya pregunté eso', 'Si ya hice una pregunta y el cliente no contestó, no la repitas ni la reformules: empujá con una propuesta concreta.'],
  ['Muy largo', 'Más corto: una o dos líneas.'],
  ['Muy formal', 'Más informal, como hablo yo en el chat.'],
  ['Inventó algo', 'No inventes fechas, datos ni promesas que no dije.'],
]

export default function QuePenso({ info }) {
  const [reglas, setReglas] = useState(null) // { propia, reglas: [] }
  const [elegidas, setElegidas] = useState([])
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [verReglas, setVerReglas] = useState(false)

  const cargar = useCallback(() => {
    fetchReglasVoz()
      .then(setReglas)
      .catch(() => setReglas({ propia: false, reglas: [] }))
  }, [])
  useEffect(cargar, [cargar])
  // Una sugerencia nueva arranca sin correcciones marcadas.
  useEffect(() => {
    setElegidas([])
    setError('')
  }, [info?.id])

  if (!info) return null
  const v = info.voz || {}
  const propia = reglas ? reglas.propia : info.propia
  const textos = [...elegidas.map((i) => RAPIDAS[i][1]), nota.trim()].filter(Boolean)

  async function corregir() {
    if (!textos.length) return
    setGuardando(true)
    setError('')
    try {
      for (const t of textos) await agregarReglaVoz(t, info.id)
      setElegidas([])
      setNota('')
      cargar()
      info.otra?.()
    } catch (e) {
      setError(e.message || 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  async function quitar(id) {
    setReglas((r) => ({ ...r, reglas: r.reglas.filter((x) => x.id !== id) }))
    borrarReglaVoz(id).catch(cargar)
  }

  return (
    <section className="qp" aria-label="Qué pensó el Tab">
      <p className="msj-seccion qp__titulo">
        <span>✦ Qué pensó</span>
        {info.cargando ? <em>escribiendo…</em> : null}
      </p>

      <div className="qp__bloque">
        <p className="qp__que">{info.que}</p>
        {info.retoma ? (
          <p className="qp__dato">
            <span>{info.modo === 'seguimiento' ? 'Retoma' : 'Responde a'}</span>
            <q>{info.retoma}</q>
          </p>
        ) : null}
        {info.pregunta_abierta ? (
          <p className="qp__dato is-aviso">
            <span>Tu pregunta sin respuesta</span>
            <q>{info.pregunta_abierta}</q>
            <small>No la va a repetir: empuja con una propuesta.</small>
          </p>
        ) : null}
      </div>

      <div className="qp__bloque">
        <p className="qp__eti">Cómo lo escribió</p>
        <div className="qp__chips">
          {v.de ? <span className="is-azul">Voz de {v.de}</span> : null}
          {v.minusculas != null ? <span>{v.minusculas}% en minúsculas</span> : null}
          {v.palabras ? <span>~{v.palabras} palabras</span> : null}
          {v.seguidos ? <span>mensajes cortos seguidos</span> : null}
          {v.ejemplos ? <span>{v.ejemplos} ejemplos tuyos</span> : null}
          {v.reglas ? <span className="is-verde">{v.reglas} {v.reglas === 1 ? 'regla tuya' : 'reglas tuyas'}</span> : null}
        </div>
      </div>

      {propia ? (
        <div className="qp__bloque">
          <p className="qp__eti">Corregile</p>
          <div className="qp__chips is-botones">
            {RAPIDAS.map(([nombre], i) => (
              <button
                key={nombre}
                type="button"
                className={elegidas.includes(i) ? 'is-on' : ''}
                aria-pressed={elegidas.includes(i)}
                onClick={() => setElegidas((e) => (e.includes(i) ? e.filter((x) => x !== i) : [...e, i]))}
              >
                {nombre}
              </button>
            ))}
          </div>
          <textarea
            className="qp__nota"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="O decile con tus palabras qué hacer distinto…"
            rows={2}
            maxLength={300}
          />
          {error ? <p className="qp__error">{error}</p> : null}
          <button type="button" className="qp__guardar" onClick={corregir} disabled={guardando || !textos.length}>
            {guardando ? 'Guardando…' : 'Guardar y sugerir de nuevo'}
          </button>
        </div>
      ) : (
        <p className="qp__ajena">Estás usando la voz de {v.de || 'otra persona'}: sus reglas las pone esa persona.</p>
      )}

      {reglas?.reglas.length ? (
        <div className="qp__bloque">
          <button type="button" className="qp__ver" onClick={() => setVerReglas((x) => !x)} aria-expanded={verReglas}>
            {propia ? 'Tus reglas' : 'Sus reglas'} <b>{reglas.reglas.length}</b>
            <span>{verReglas ? 'Ocultar' : 'Ver'}</span>
          </button>
          {verReglas ? (
            <ul className="qp__reglas">
              {reglas.reglas.map((r) => (
                <li key={r.id}>
                  <span>{r.texto}</span>
                  {propia ? (
                    <button type="button" onClick={() => quitar(r.id)} aria-label="Quitar esta regla">
                      Quitar
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
