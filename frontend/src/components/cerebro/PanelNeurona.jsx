import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchNeurona } from '../../api/cerebro'
import { cuandoCorto } from '../../utils/mensajes'
import { TIPOS } from './motorEsfera'

const NOMBRE_TIPO = {
  modulo: 'Módulo',
  clase: 'Clase',
  concepto: 'Concepto',
  frente: 'Frente',
  coach: 'Coach',
  plan: 'Plan',
  cliente: 'Cliente',
  solicitud: 'Pedido de SOP',
  nicho: 'Nicho',
}

const TIPO_HECHO = {
  tema: 'Tema',
  dolor: 'Le duele',
  objecion: 'Objeción',
  pedido: 'Pidió',
  recomendacion: 'Le recomendaron',
  le_funciono: 'Le funcionó',
  no_le_funciono: 'No le funcionó',
  logro: 'Logro',
}

const RASGOS = [
  ['palabras_promedio', (v) => `${v} palabras por mensaje`],
  ['todo_minuscula_pct', (v) => (v >= 60 ? 'escribe todo en minúscula' : null)],
  ['mayuscula_inicial_pct', (v) => (v >= 80 ? 'arranca con mayúscula' : null)],
  ['punto_final_pct', (v) => (v <= 20 ? 'casi nunca pone punto final' : v >= 60 ? 'cierra con punto' : null)],
  ['preguntas_pct', (v) => (v >= 20 ? `${v}% de sus mensajes preguntan algo` : null)],
  ['voseo_pct', (v) => (v >= 30 ? `voseo en el ${v}%` : null)],
  ['alarga_palabras_pct', (v) => (v >= 8 ? 'alarga palabras ("buenísimooo")' : null)],
  ['emojis_pct', (v) => `emojis en el ${v}%`],
]

function Hechos({ titulo, hechos }) {
  if (!hechos?.length) return null
  return (
    <div className="cb-bloque">
      <h4>{titulo}</h4>
      <ul className="cb-hechos">
        {hechos.map((h, i) => (
          <li key={i} className={`is-${h.tipo}`}>
            <span className="cb-hecho__tipo">{TIPO_HECHO[h.tipo] || h.tipo}</span>
            <p>{h.texto}</p>
            {h.cita ? <q>{h.cita}</q> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Conteo({ titulo, items }) {
  if (!items?.length) return null
  return (
    <div className="cb-bloque">
      <h4>{titulo}</h4>
      <ul className="cb-puntos">
        {items.map((x, i) => (
          <li key={i}>
            {x.que} {x.veces > 1 ? <small>×{x.veces}</small> : null}
          </li>
        ))}
      </ul>
    </div>
  )
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

const ESTADO_PASO = { hecho: 'Hecho', parcial: 'A medias', no_hecho: 'No lo hizo', no_se_hablo: 'No se habló' }

// Roadmaps del cliente: avance (lo que tildó) y qué pasó con cada paso según la llamada siguiente.
function RoadmapsCliente({ items }) {
  if (!items?.length) return null
  return (
    <div className="cb-bloque">
      <h4>Roadmaps y resultados</h4>
      <ul className="cb-roadmaps">
        {items.map((r, i) => (
          <li key={i}>
            <b>{r.titulo}</b> <small>{new Date(`${r.fecha}T00:00:00`).toLocaleDateString('es-AR')}{r.coach ? ` · ${r.coach.split(' ')[0]}` : ''} · {r.hechos} de {r.total} pasos</small>
            {r.resultado?.length ? (
              <ul>
                {r.resultado.map((p, j) => (
                  <li key={j} className={`is-${p.estado}`}>
                    <em>{ESTADO_PASO[p.estado] || p.estado}</em> {p.paso}
                    {p.resultado ? <q>{p.resultado}</q> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

// Cómo arma sus roadmaps un coach: cuánto corrige los borradores de la IA y cuánto se cumplen.
function RoadmapsCoach({ r }) {
  if (!r) return null
  return (
    <div className="cb-bloque">
      <h4>Sus roadmaps con IA</h4>
      <dl className="cb-datos">
        <div><dt>Armados</dt><dd>{r.guardados} de {r.borradores} borradores{r.enviados ? ` · ${r.enviados} enviados` : ''}</dd></div>
        <div><dt>Sin tocar</dt><dd>{r.sin_cambios} de {r.guardados}</dd></div>
        <div><dt>Correcciones</dt><dd>{r.pasos_sacados} sacados · {r.pasos_agregados} agregados · {r.pasos_reescritos} reescritos</dd></div>
        {r.cumplimiento != null ? <div><dt>Los clientes cumplen</dt><dd>{r.cumplimiento}% de los pasos</dd></div> : null}
      </dl>
      {r.ultimos?.some((u) => !u.sin_cambios) ? (
        <ul className="cb-correcciones">
          {r.ultimos.filter((u) => !u.sin_cambios).slice(0, 3).map((u, i) => (
            <li key={i}>
              <b>{u.cliente}</b>
              {u.sacados.slice(0, 2).map((t, j) => <span key={`s${j}`} className="is-sacado">− {t}</span>)}
              {u.agregados.slice(0, 2).map((t, j) => <span key={`a${j}`} className="is-agregado">+ {t}</span>)}
              {u.reescritos.slice(0, 1).map((t, j) => <span key={`r${j}`} className="is-reescrito">{t.antes} → {t.despues}</span>)}
            </li>
          ))}
        </ul>
      ) : null}
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

      {d.perfil ? (
        <div className="cb-bloque">
          <h4>Lo que el cerebro sabe de su negocio</h4>
          <dl className="cb-datos">
            {d.perfil.nicho_nombre ? <div><dt>Nicho</dt><dd>{d.perfil.nicho_nombre}</dd></div> : null}
            {d.perfil.que_vende ? <div><dt>Vende</dt><dd>{d.perfil.que_vende}</dd></div> : null}
            {d.perfil.etapa ? <div><dt>Etapa</dt><dd>{d.perfil.etapa}</dd></div> : null}
            {d.perfil.facturacion ? <div><dt>Factura</dt><dd>{d.perfil.facturacion}</dd></div> : null}
            {d.perfil.objetivo ? <div><dt>Quiere</dt><dd>{d.perfil.objetivo}</dd></div> : null}
            {d.perfil.tono_cliente ? <div><dt>Cómo escribe</dt><dd>{d.perfil.tono_cliente}</dd></div> : null}
          </dl>
        </div>
      ) : null}
      <Hechos titulo="Lo que aprendió de sus conversaciones" hechos={d.aprendido} />
      {datos.tipo === 'cliente' ? <RoadmapsCliente items={d.roadmaps} /> : <RoadmapsCoach r={d.roadmaps} />}

      {datos.tipo === 'nicho' ? (
        <>
          {d.clientes?.length ? (
            <div className="cb-bloque">
              <h4>Clientes del nicho</h4>
              <ul className="cb-puntos">
                {d.clientes.map((c) => (
                  <li key={c.id}>{c.nombre}{c.que_vende ? ` · ${c.que_vende}` : ''}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <Conteo titulo="Lo que más les duele" items={d.dolores} />
          <Conteo titulo="Lo que objetan" items={d.objeciones} />
          <Conteo titulo="Lo que más se les recomienda" items={d.recomendaciones} />
          <Hechos titulo="Les funcionó" hechos={d.le_funciono?.map((h) => ({ ...h, tipo: 'le_funciono', texto: `${h.cliente}: ${h.texto}` }))} />
          <Hechos titulo="No les funcionó" hechos={d.no_le_funciono?.map((h) => ({ ...h, tipo: 'no_le_funciono', texto: `${h.cliente}: ${h.texto}` }))} />
        </>
      ) : null}

      {d.voz?.mensajes ? (
        <div className="cb-bloque">
          <h4>Cómo escribe ({d.voz.mensajes} mensajes)</h4>
          <ul className="cb-puntos">
            {RASGOS.map(([k, f]) => [k, d.voz[k] != null ? f(d.voz[k]) : null])
              .filter(([, txt]) => txt)
              .map(([k, txt]) => (
                <li key={k}>{txt}</li>
              ))}
            {d.voz.muletillas?.length ? <li>muletillas: “{d.voz.muletillas.slice(0, 5).join('”, “')}”</li> : null}
            {d.voz.abreviaturas?.length ? <li>abrevia: {d.voz.abreviaturas.join(', ')}</li> : null}
            {d.voz.palabras_propias?.length ? <li>palabras suyas: {d.voz.palabras_propias.slice(0, 6).join(', ')}</li> : null}
            {d.voz.aperturas_top?.length ? <li>suele arrancar con “{d.voz.aperturas_top.slice(0, 3).join('”, “')}”</li> : null}
            {d.voz.emojis_top?.length ? <li>emojis: {d.voz.emojis_top.join(' ')}</li> : null}
          </ul>
        </div>
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
