import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force'

// Motor del cerebro: simulación de fuerzas (como la vista de grafo de Obsidian) y dibujo en canvas.
// Pensado para ir a la tasa de refresco de la pantalla (60, 120 o 240 Hz):
//  - todo se dibuja en pocas pasadas (una por color), sin sombras ni objetos por cuadro;
//  - zoom y paneo se interpolan con el tiempo real del cuadro, no con "pasos" fijos;
//  - cuando nada se mueve, el bucle se apaga: cero consumo en reposo.

export const TIPOS = {
  modulo: { nombre: 'Módulos', color: '#ef5350', base: 7 },
  clase: { nombre: 'Clases', color: '#a8a29e', base: 2.6 },
  concepto: { nombre: 'Conceptos', color: '#a78bfa', base: 3.2 },
  frente: { nombre: 'Frentes', color: '#f5a524', base: 5 },
  coach: { nombre: 'Coaches', color: '#f5f5f4', base: 6 },
  plan: { nombre: 'Planes', color: '#60a5fa', base: 5.5 },
  cliente: { nombre: 'Clientes', color: '#34d399', base: 3.6 },
  solicitud: { nombre: 'Pedidos de SOP', color: '#f472b6', base: 3.4 },
}

const FONDO = '#161616'
const LINEA = 'rgba(255,255,255,0.11)'
const LINEA_TENUE = 'rgba(255,255,255,0.035)'
const LINEA_FOCO = 'rgba(167,139,250,0.85)'
const ZOOM_MIN = 0.12
const ZOOM_MAX = 7

function hexAlfa(hex, a) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

export class MotorGrafo {
  constructor(canvas, { alSeleccionar, alHover }) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })
    this.alSeleccionar = alSeleccionar
    this.alHover = alHover
    this.nodos = []
    this.enlaces = []
    this.porId = new Map()
    this.vecinos = new Map()
    this.ocultos = new Set()
    this.cam = { x: 0, y: 0, k: 0.55 }
    this.obj = { x: 0, y: 0, k: 0.55 }
    this.hover = null
    this.seleccion = null
    this.foco = 0 // 0 = todo visible, 1 = resaltando vecinas del hover/selección
    this.puntero = null
    this.arrastre = null
    this.raf = null
    this.ultimo = 0
    this.revelados = Infinity
    this.W = 0
    this.H = 0
    this.dpr = 1

    this.sim = forceSimulation([])
      .force('link', forceLink([]).id((d) => d.id).distance(this._distancia).strength(0.22))
      .force('carga', forceManyBody().strength((d) => -26 - Math.min(160, d.grado * 4)).distanceMax(520).theta(0.95))
      .force('x', forceX(0).strength(0.03))
      .force('y', forceY(0).strength(0.03))
      .force('choque', forceCollide((d) => d.r + 2).iterations(1))
      .velocityDecay(0.38)
      .alphaDecay(0.022)
      .stop()

    this._cuadro = this._cuadro.bind(this)
    this._eventos()
    this.medir()
  }

  _distancia(l) {
    const a = l.source.tipo
    const b = l.target.tipo
    if (a === 'modulo' || b === 'modulo') return 46
    if (a === 'concepto' || b === 'concepto') return 62
    if (a === 'cliente' || b === 'cliente') return 54
    return 50
  }

  medir() {
    const r = this.canvas.getBoundingClientRect()
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.W = r.width
    this.H = r.height
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr))
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr))
    this.despertar()
  }

  /** Carga o actualiza el grafo conservando posiciones: lo nuevo nace al lado de una vecina. */
  datos({ nodos, enlaces }) {
    const ahora = performance.now()
    const previo = this.porId
    const porId = new Map()
    const lista = nodos.map((n) => {
      const viejo = previo.get(n.id)
      const nodo = viejo ? Object.assign(viejo, n, { _texto: null, _ancho: 0, _anchoC: 0 }) : { ...n, nace: previo.size ? ahora : 0 }
      porId.set(n.id, nodo)
      return nodo
    })
    const vecinos = new Map(lista.map((n) => [n.id, new Set()]))
    const links = []
    for (const e of enlaces) {
      if (!porId.has(e.a) || !porId.has(e.b)) continue
      links.push({ source: e.a, target: e.b, tipo: e.tipo, creado_en: e.creado_en })
      vecinos.get(e.a).add(e.b)
      vecinos.get(e.b).add(e.a)
    }
    for (const n of lista) {
      n.grado = vecinos.get(n.id).size
      n.r = (TIPOS[n.tipo]?.base || 3) + Math.min(9, Math.sqrt(n.grado) * 0.75)
      if (n.x === undefined) {
        const vecina = [...vecinos.get(n.id)].map((id) => porId.get(id)).find((v) => v && v.x !== undefined)
        n.x = vecina ? vecina.x + (Math.random() - 0.5) * 40 : (Math.random() - 0.5) * 600
        n.y = vecina ? vecina.y + (Math.random() - 0.5) * 40 : (Math.random() - 0.5) * 600
      }
    }
    // Orden de nacimiento para "ver cómo creció": primero el conocimiento, después lo que pasó, por fecha.
    const orden = { modulo: 0, concepto: 1, clase: 2, frente: 3, coach: 4, plan: 5, cliente: 6, solicitud: 7 }
    const primeraFecha = new Map()
    for (const e of enlaces) {
      if (!e.creado_en) continue
      for (const id of [e.a, e.b]) if (!primeraFecha.has(id) || e.creado_en < primeraFecha.get(id)) primeraFecha.set(id, e.creado_en)
    }
    this.ordenNacimiento = [...lista].sort((a, b) => {
      const fa = primeraFecha.get(a.id) || a.creado_en || ''
      const fb = primeraFecha.get(b.id) || b.creado_en || ''
      if (fa !== fb) return fa < fb ? -1 : 1
      return (orden[a.tipo] ?? 9) - (orden[b.tipo] ?? 9)
    })
    this.ordenNacimiento.forEach((n, i) => {
      n.turno = i
    })
    this.nodos = lista
    this.porId = porId
    this.vecinos = vecinos
    this.enlaces = links
    this.sim.nodes(lista)
    this.sim.force('link').links(links)
    this.enlaces = this.sim.force('link').links()
    const primera = previo.size === 0
    this.sim.alpha(primera ? 1 : 0.35)
    if (primera) for (let i = 0; i < 160; i++) this.sim.tick() // arranca acomodado, no como una explosión
    this.despertar()
  }

  ocultar(tipos) {
    this.ocultos = new Set(tipos)
    if (this.hover && this.ocultos.has(this.hover.tipo)) this.hover = null
    this.despertar()
  }

  seleccionar(id, { centrar = true } = {}) {
    const n = id ? this.porId.get(id) : null
    this.seleccion = n || null
    if (n && centrar) {
      // El panel tapa un costado: se centra en lo que queda a la vista, no en el medio del lienzo.
      this.obj.k = Math.max(this.obj.k, 1.25)
      const angosto = this.W < 700
      const der = n && !angosto ? Math.min(380, this.W - 24) + 12 : 0
      const abajo = n && angosto ? this.H * 0.62 : 0
      this.obj.x = n.x + der / 2 / this.obj.k
      this.obj.y = n.y + abajo / 2 / this.obj.k
    }
    this.despertar()
  }

  /** Repite el crecimiento: las neuronas aparecen en el orden en que se fueron sumando. */
  reproducir(ms = 7000) {
    const total = this.ordenNacimiento?.length || 0
    if (!total) return
    this.revelados = 0
    this.replay = { inicio: performance.now(), ms, total }
    this.obj = { x: 0, y: 0, k: 0.42 }
    this.despertar()
  }

  visible(n) {
    return !this.ocultos.has(n.tipo) && n.turno < this.revelados
  }

  despertar() {
    if (this.raf == null) {
      this.ultimo = performance.now()
      this.raf = requestAnimationFrame(this._cuadro)
    }
  }

  destruir() {
    cancelAnimationFrame(this.raf)
    this.raf = null
    this.sim.stop()
    this._quitarEventos?.()
  }

  // ---------- coordenadas ----------
  aMundo(px, py) {
    return { x: (px - this.W / 2) / this.cam.k + this.cam.x, y: (py - this.H / 2) / this.cam.k + this.cam.y }
  }

  buscarEn(px, py) {
    const p = this.aMundo(px, py)
    let mejor = null
    let dist = Infinity
    const margen = 6 / this.cam.k
    for (const n of this.nodos) {
      if (!this.visible(n)) continue
      const dx = n.x - p.x
      const dy = n.y - p.y
      const d = dx * dx + dy * dy
      const alcance = (n.r + margen) * (n.r + margen)
      if (d < alcance && d < dist) {
        dist = d
        mejor = n
      }
    }
    return mejor
  }

  // ---------- bucle ----------
  _cuadro(t) {
    const dt = Math.min(0.05, (t - this.ultimo) / 1000)
    this.ultimo = t
    let sigue = false

    if (this.replay) {
      const p = Math.min(1, (t - this.replay.inicio) / this.replay.ms)
      this.revelados = Math.floor(this.replay.total * (p * p * (3 - 2 * p)))
      const recien = this.ordenNacimiento[this.revelados - 1]
      if (recien) recien.nace = recien.nace && t - recien.nace < 600 ? recien.nace : t
      if (p >= 1) {
        this.revelados = Infinity
        this.replay = null
      } else {
        sigue = true
        if (this.sim.alpha() < 0.08) this.sim.alpha(0.08)
      }
    }

    if (this.sim.alpha() > this.sim.alphaMin()) {
      this.sim.tick()
      sigue = true
    }
    if (this.arrastre?.nodo) sigue = true

    // Cámara: acercamiento exponencial según el tiempo real (igual de suave a 60 o 240 Hz).
    const s = 1 - Math.exp(-dt * 16)
    const dx = this.obj.x - this.cam.x
    const dy = this.obj.y - this.cam.y
    const dk = this.obj.k - this.cam.k
    if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05 || Math.abs(dk) > 0.0005) {
      this.cam.x += dx * s
      this.cam.y += dy * s
      this.cam.k += dk * s
      sigue = true
    } else {
      this.cam.x = this.obj.x
      this.cam.y = this.obj.y
      this.cam.k = this.obj.k
    }

    // Hover: se resuelve una vez por cuadro, no en cada evento del mouse.
    if (this.puntero && !this.arrastre) {
      const n = this.buscarEn(this.puntero.x, this.puntero.y)
      if (n !== this.hover) {
        this.hover = n
        this.canvas.style.cursor = n ? 'pointer' : 'grab'
        this.alHover?.(n)
      }
    }
    const objetivoFoco = this.hover || this.seleccion ? 1 : 0
    const df = objetivoFoco - this.foco
    if (Math.abs(df) > 0.01) {
      this.foco += df * (1 - Math.exp(-dt * 14))
      sigue = true
    } else this.foco = objetivoFoco

    // Neuronas recién nacidas: brillan un instante.
    for (const n of this.nodos) if (n.nace && t - n.nace < 900) sigue = true

    this._dibujar(t)
    this.raf = sigue ? requestAnimationFrame(this._cuadro) : null
  }

  _dibujar(t) {
    const { ctx, cam, dpr, W, H } = this
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = FONDO
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.setTransform(dpr * cam.k, 0, 0, dpr * cam.k, dpr * (W / 2 - cam.x * cam.k), dpr * (H / 2 - cam.y * cam.k))

    const centro = this.hover || this.seleccion
    const cercanos = centro ? this.vecinos.get(centro.id) : null
    const resaltado = (n) => !centro || n === centro || cercanos?.has(n.id)

    // Enlaces: una sola pasada por estilo.
    ctx.lineWidth = 1 / cam.k
    ctx.beginPath()
    for (const l of this.enlaces) {
      if (!this.visible(l.source) || !this.visible(l.target)) continue
      if (centro && (l.source === centro || l.target === centro)) continue
      ctx.moveTo(l.source.x, l.source.y)
      ctx.lineTo(l.target.x, l.target.y)
    }
    ctx.strokeStyle = this.foco > 0.5 ? LINEA_TENUE : LINEA
    ctx.globalAlpha = 1
    ctx.stroke()
    if (centro) {
      ctx.beginPath()
      for (const l of this.enlaces) {
        if (l.source !== centro && l.target !== centro) continue
        if (!this.visible(l.source) || !this.visible(l.target)) continue
        ctx.moveTo(l.source.x, l.source.y)
        ctx.lineTo(l.target.x, l.target.y)
      }
      ctx.strokeStyle = LINEA_FOCO
      ctx.lineWidth = 1.4 / cam.k
      ctx.globalAlpha = this.foco
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    // Neuronas: una pasada por tipo (y otra atenuada para las que no son vecinas del foco).
    for (const [tipo, estilo] of Object.entries(TIPOS)) {
      if (this.ocultos.has(tipo)) continue
      for (const tenue of [false, true]) {
        ctx.beginPath()
        let hay = false
        for (const n of this.nodos) {
          if (n.tipo !== tipo || !this.visible(n)) continue
          if (resaltado(n) === tenue) continue
          let r = n.r
          if (n.nace) {
            const p = Math.min(1, (t - n.nace) / 500)
            r *= 0.3 + 0.7 * (1 - Math.pow(1 - p, 3))
          }
          ctx.moveTo(n.x + r, n.y)
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
          hay = true
        }
        if (!hay) continue
        ctx.fillStyle = tenue ? hexAlfa(estilo.color, 1 - 0.82 * this.foco) : estilo.color
        ctx.fill()
      }
    }

    // Brillo de nacimiento y anillo de selección.
    for (const n of this.nodos) {
      if (!n.nace || !this.visible(n)) continue
      const p = (t - n.nace) / 900
      if (p >= 1) continue
      ctx.beginPath()
      ctx.arc(n.x, n.y, n.r + 14 * p, 0, Math.PI * 2)
      ctx.strokeStyle = hexAlfa(TIPOS[n.tipo]?.color || '#ffffff', 0.7 * (1 - p))
      ctx.lineWidth = 2 / cam.k
      ctx.stroke()
    }
    for (const n of [this.seleccion, this.hover]) {
      if (!n || !this.visible(n)) continue
      ctx.beginPath()
      ctx.arc(n.x, n.y, n.r + 3 / cam.k, 0, Math.PI * 2)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.6 / cam.k
      ctx.stroke()
    }

    // Etiquetas en pantalla (tamaño fijo): las grandes siempre, el resto al acercarse.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const aparicion = Math.max(0, Math.min(1, (cam.k - 0.85) / 0.6))
    // Con muchas vecinas, se etiquetan las más conectadas y el resto aparece al acercarse.
    const muchas = (cercanos?.size || 0) > 18
    const candidatas = []
    for (const n of this.nodos) {
      if (!this.visible(n)) continue
      const importante = n.grado >= 14 || n.tipo === 'modulo' || n.tipo === 'coach'
      const enFoco = centro && resaltado(n)
      let alfa
      if (n === centro) alfa = 1
      else if (enFoco) alfa = !muchas || importante || n.grado >= 8 ? 1 : Math.max(0.12, aparicion)
      else alfa = importante ? Math.max(0.55, aparicion) : aparicion
      if (centro && !enFoco) alfa *= 1 - 0.85 * this.foco
      if (alfa < 0.04) continue
      const sx = (n.x - cam.x) * cam.k + W / 2
      const sy = (n.y - cam.y) * cam.k + H / 2 + n.r * cam.k + 4
      if (sx < -80 || sx > W + 80 || sy < -20 || sy > H + 20) continue
      // Prioridad: la elegida, después sus vecinas, después las más conectadas.
      const prioridad = (n === centro ? 1e6 : 0) + (enFoco ? 1e4 : 0) + (importante ? 1e3 : 0) + n.grado * 10 + alfa
      candidatas.push({ n, sx, sy, alfa, prioridad })
    }
    candidatas.sort((a, b) => b.prioridad - a.prioridad)

    // Como Obsidian: una etiqueta que pisaría a otra más importante no se dibuja (grilla de 64px para chequear rápido).
    const FUENTE = '11px -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif'
    const FUENTE_CENTRO = '600 12px -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif'
    const celdas = new Map()
    const CELDA = 64
    const libre = (x0, y0, x1, y1) => {
      for (let cx = Math.floor(x0 / CELDA); cx <= Math.floor(x1 / CELDA); cx++)
        for (let cy = Math.floor(y0 / CELDA); cy <= Math.floor(y1 / CELDA); cy++) {
          const lista = celdas.get(cx * 4096 + cy)
          if (lista) for (const r of lista) if (x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1]) return false
        }
      return true
    }
    const ocupar = (r) => {
      for (let cx = Math.floor(r[0] / CELDA); cx <= Math.floor(r[2] / CELDA); cx++)
        for (let cy = Math.floor(r[1] / CELDA); cy <= Math.floor(r[3] / CELDA); cy++) {
          const k = cx * 4096 + cy
          const lista = celdas.get(k)
          if (lista) lista.push(r)
          else celdas.set(k, [r])
        }
    }
    let fuenteActual = ''
    for (const { n, sx, sy, alfa } of candidatas) {
      const texto = n._texto || (n._texto = n.nombre.length > 34 ? n.nombre.slice(0, 32) + '…' : n.nombre)
      const fuente = n === centro ? FUENTE_CENTRO : FUENTE
      if (fuente !== fuenteActual) {
        ctx.font = fuente
        fuenteActual = fuente
      }
      const clave = n === centro ? '_anchoC' : '_ancho'
      const ancho = n[clave] || (n[clave] = ctx.measureText(texto).width)
      const r = [sx - ancho / 2 - 3, sy - 1, sx + ancho / 2 + 3, sy + 14]
      if (n !== centro && !libre(r[0], r[1], r[2], r[3])) continue
      ocupar(r)
      ctx.fillStyle = `rgba(232,230,227,${alfa})`
      ctx.fillText(texto, sx, sy)
    }
  }

  // ---------- eventos ----------
  _eventos() {
    const c = this.canvas
    const pos = (e) => {
      const r = c.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const abajo = (e) => {
      const p = pos(e)
      c.setPointerCapture(e.pointerId)
      const n = this.buscarEn(p.x, p.y)
      this.arrastre = { inicio: p, previo: p, nodo: n, movido: false }
      if (n) {
        n.fx = n.x
        n.fy = n.y
        this.sim.alphaTarget(0.18).alpha(Math.max(this.sim.alpha(), 0.18))
      } else c.style.cursor = 'grabbing'
      this.despertar()
    }
    const mover = (e) => {
      const p = pos(e)
      this.puntero = p
      const a = this.arrastre
      if (a) {
        if (Math.hypot(p.x - a.inicio.x, p.y - a.inicio.y) > 3) a.movido = true
        if (a.nodo) {
          const m = this.aMundo(p.x, p.y)
          a.nodo.fx = m.x
          a.nodo.fy = m.y
        } else {
          // Paneo directo (sin interpolar): el mapa sigue al dedo sin retraso.
          const dx = (p.x - a.previo.x) / this.cam.k
          const dy = (p.y - a.previo.y) / this.cam.k
          this.cam.x -= dx
          this.cam.y -= dy
          this.obj.x = this.cam.x
          this.obj.y = this.cam.y
        }
        a.previo = p
      }
      this.despertar()
    }
    const arriba = () => {
      const a = this.arrastre
      this.arrastre = null
      if (a?.nodo) {
        a.nodo.fx = null
        a.nodo.fy = null
        this.sim.alphaTarget(0)
        if (!a.movido) this.alSeleccionar?.(a.nodo.id)
      } else if (a && !a.movido) {
        this.alSeleccionar?.(null)
      }
      c.style.cursor = this.hover ? 'pointer' : 'grab'
      this.despertar()
    }
    const salir = () => {
      this.puntero = null
      if (this.hover) {
        this.hover = null
        this.alHover?.(null)
      }
      this.despertar()
    }
    const rueda = (e) => {
      e.preventDefault()
      const p = pos(e)
      // Pellizco del trackpad (ctrlKey) más sensible que la rueda.
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0018))
      const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.obj.k * factor))
      const m = this.aMundo(p.x, p.y)
      this.obj.k = k
      this.obj.x = m.x - (p.x - this.W / 2) / k
      this.obj.y = m.y - (p.y - this.H / 2) / k
      this.despertar()
    }
    c.addEventListener('pointerdown', abajo)
    c.addEventListener('pointermove', mover)
    c.addEventListener('pointerup', arriba)
    c.addEventListener('pointercancel', arriba)
    c.addEventListener('pointerleave', salir)
    c.addEventListener('wheel', rueda, { passive: false })
    const ro = new ResizeObserver(() => this.medir())
    ro.observe(c)
    this._quitarEventos = () => {
      c.removeEventListener('pointerdown', abajo)
      c.removeEventListener('pointermove', mover)
      c.removeEventListener('pointerup', arriba)
      c.removeEventListener('pointercancel', arriba)
      c.removeEventListener('pointerleave', salir)
      c.removeEventListener('wheel', rueda)
      ro.disconnect()
    }
  }
}
