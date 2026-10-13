import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchNeurona } from '../../api/cerebro'
import { cuandoCorto } from '../../utils/mensajes'
import { TIPOS } from './motorGrafo'

const NOMBRE_TIPO = {
  modulo: 'Módulo',
  clase: 'Clase',
  concepto: 'Concepto',
  frente: 'Frente',
  coach: 'Coach',
  plan: 'Plan',
  cliente: 'Cliente',
  solicitud: 'Pedido de SOP',
}

function Lista({ titulo, items }) {
  if (!items?.length) return null
  return (
    <div className="cb-bloque">
      <h4>{titulo}</h4>
      <ul className="cb-puntos">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  )
}

// Lo que hay adentro de una neurona: su contenido real y con qué está conectada (y desde cuándo).
// `base` sale del grafo que ya está en memoria: el panel se pinta en el mismo cuadro del click
// y el contenido de la neurona (resumen, mensajes, etc.) entra apenas llega.
export default function PanelNeurona({ id, base, onIr, onCerrar }) {
  const [cargado, setCargado] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    setError('')
    fetchNeurona(id)
      .then((d) => vivo && setCargado(d))
      .catch((e) => vivo && setError(e.message || 'No se pudo abrir la neurona.'))
    return () => {
      vivo = false
    }
  }, [id])

  const datos = cargado?.id === id ? cargado : base
  if (!datos) return <aside className="cb-panel"><p className="cb-vacio">{error || 'Abriendo…'}</p></aside>

  const d = datos.detalle || {}
  const cargando = !datos.detalle && !error
  const porVinculo = {}
  for (const v of datos.vecinos) (porVinculo[v.vinculo] ||= []).push(v)
  const aprendidas = datos.vecinos.filter((v) => v.creado_en).length

  return (
    <aside className="cb-panel" aria-label={`Neurona ${datos.nombre}`}>
      <header className="cb-panel__head">
        <span className="cb-tipo" style={{ '--c': TIPOS[datos.tipo]?.color }}>
          {NOMBRE_TIPO[datos.tipo] || datos.tipo}
        </span>
        <button type="button" className="cb-cerrar" onClick={onCerrar} aria-label="Cerrar">
          ✕
        </button>
      </header>
      <h3 className="cb-panel__titulo">{datos.nombre}</h3>
      <p className="cb-panel__meta">
        {datos.vecinos.length} conexiones{aprendidas ? ` · ${aprendidas} aprendidas de la actividad` : ''}
      </p>

      {cargando ? <div className="cb-esqueleto" aria-hidden="true"><i /><i /><i /></div> : null}
      {error && !cargado ? <p className="cb-vacio">{error}</p> : null}
      {d.modulo ? <p className="cb-ruta">{d.modulo} › {d.seccion}</p> : null}
      {d.definicion ? <p className="cb-texto">{d.definicion}</p> : null}
      {d.resumen ? <p className="cb-texto">{d.resumen}</p> : null}
      {d.descripcion ? <p className="cb-texto">{d.descripcion}</p> : null}
      {d.sintoma ? <p className="cb-texto">{d.sintoma}</p> : null}
      {d.area && datos.tipo !== 'frente' ? <p className="cb-ruta">Área: {d.area}</p> : null}

      {datos.tipo === 'cliente' ? (
        <dl className="cb-datos">
          <div><dt>Plan</dt><dd>{d.plan ? d.plan.charAt(0).toUpperCase() + d.plan.slice(1) : '—'}</dd></div>
          <div><dt>Acceso hasta</dt><dd>{d.vence ? new Date(`${d.vence}T00:00:00`).toLocaleDateString('es-AR') : '—'}{d.dias_restantes != null ? ` · ${d.dias_restantes} días` : ''}</dd></div>
          <div><dt>Mail</dt><dd>{d.email}</dd></div>
        </dl>
      ) : null}

      <Lista titulo="Claves de la clase" items={d.claves} />
      <Lista titulo="Cómo lo dice un cliente" items={(d.sintomas || []).slice(0, 5)} />
      <Lista titulo="Señales" items={d.senales} />

      {d.recursos?.length ? (
        <div className="cb-bloque">
          <h4>Plantillas y recursos</h4>
          <ul className="cb-links">
            {d.recursos.map((r, i) => (
              <li key={i}>
                <a href={r.url} target="_blank" rel="noopener noreferrer">{r.titulo}</a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {d.mensajes?.length ? (
        <div className="cb-bloque">
          <h4>Últimos mensajes</h4>
          <ul className="cb-mensajes">
            {d.mensajes.map((m, i) => (
              <li key={i}>
                <b>{m.autor}</b> <time>{cuandoCorto(m.creado_en)}</time>
                <p>{m.texto}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {d.consultas?.length ? (
        <div className="cb-bloque">
          <h4>Le preguntó a la guía</h4>
          <ul className="cb-mensajes">
            {d.consultas.map((q, i) => (
              <li key={i}>
                <time>{cuandoCorto(q.creado_en)}</time>
                <p>“{q.texto}”</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {d.consulta ? <p className="cb-texto">“{d.consulta}”</p> : null}

      {d.enlace ? (
        <Link className="cb-boton" to={d.enlace}>
          {datos.tipo === 'cliente' ? 'Abrir el chat' : datos.tipo === 'frente' ? 'Abrir el frente' : 'Abrir en el classroom'}
        </Link>
      ) : null}

      <div className="cb-bloque">
        <h4>Conexiones</h4>
        {Object.entries(porVinculo).map(([vinculo, lista]) => (
          <div key={vinculo} className="cb-grupo">
            <span className="cb-grupo__nombre">{vinculo}</span>
            <div className="cb-chips">
              {lista.slice(0, 40).map((v) => (
                <button key={v.id} type="button" className="cb-chip" style={{ '--c': TIPOS[v.tipo]?.color }} onClick={() => onIr(v.id)} title={v.creado_en ? `Desde ${cuandoCorto(v.creado_en)}` : undefined}>
                  <i />
                  {v.nombre}
                  {v.veces > 1 ? <small>×{v.veces}</small> : null}
                </button>
              ))}
              {lista.length > 40 ? <span className="cb-mas">y {lista.length - 40} más</span> : null}
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}
