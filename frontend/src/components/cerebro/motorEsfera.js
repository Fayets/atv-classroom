// Motor 3D del cerebro: las neuronas viven en una esfera que gira, dibujadas en canvas 2D con
// proyección en perspectiva. Todo lo caro (formas, brillos, fondo) se calcula una vez; cada cuadro
// solo rota, proyecta, ordena por profundidad y pinta.

export const TIPOS = {
  modulo: { nombre: 'Módulos', color: '#ff3b2f', base: 7 },
  coach: { nombre: 'Coaches', color: '#ffffff', base: 6.5 },
  frente: { nombre: 'Frentes', color: '#ffb08f', base: 5 },
  plan: { nombre: 'Planes', color: '#8f9bd6', base: 5.5 },
  concepto: { nombre: 'Conceptos', color: '#ff6a5b', base: 3.6 },
  clase: { nombre: 'Clases', color: '#eadbd2', base: 2.8 },
  cliente: { nombre: 'Clientes', color: '#c3cbef', base: 3.4 },
  solicitud: { nombre: 'Pedidos de SOP', color: '#ffd166', base: 3.6 },
  nicho: { nombre: 'Nichos', color: '#7ee0c3', base: 6 },
}

const CAPA = { modulo: 0, coach: 1, frente: 1, plan: 1, nicho: 1, clase: 2, concepto: 2, cliente: 3, solicitud: 3 }
const RADIO_CAPA = [95, 185, 285, 370]
const MORPH_MS = 1100
const SPRITE = 64
const FUENTE = '11.5px -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif'
const FUENTE_CENTRO = '600 12.5px -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif'

function fibonacci(i, total) {
  const y = 1 - (2 * (i + 0.5)) / total
  const r = Math.sqrt(1 - y * y)
  const t = i * Math.PI * (3 - Math.sqrt(5))
  return [Math.cos(t) * r, y, Math.sin(t) * r]
}

// Direcciones sobre la esfera: se repelen dentro de la misma capa y los vínculos las acercan.
function sobreEsfera(nodos, enlaces, capaDe, radioDe, pasos = 240) {
  const N = nodos.length
  const u = new Float64Array(N * 3)
  const orden = nodos.map((_, i) => i).sort((a, b) => nodos[b].grado - nodos[a].grado)
  orden.forEach((idx, k) => u.set(fibonacci(k, N), idx * 3))
  const f = new Float64Array(N * 3)
  const capa = nodos.map(capaDe)
  for (let paso = 0; paso < pasos; paso++) {
    const temp = 0.06 * (1 - paso / pasos) + 0.004
    f.fill(0)
    for (let i = 0; i < N; i++) {
      const ix = i * 3
      for (let j = i + 1; j < N; j++) {
        if (capa[i] !== capa[j]) continue
        const jx = j * 3
        const dx = u[ix] - u[jx], dy = u[ix + 1] - u[jx + 1], dz = u[ix + 2] - u[jx + 2]
        const k = 0.0016 / (dx * dx + dy * dy + dz * dz + 1e-4)
        f[ix] += dx * k; f[ix + 1] += dy * k; f[ix + 2] += dz * k
        f[jx] -= dx * k; f[jx + 1] -= dy * k; f[jx + 2] -= dz * k
      }
    }
    for (const e of enlaces) {
      const a = e.ia * 3, b = e.ib * 3
      const k = 0.05 / Math.sqrt(1 + Math.min(nodos[e.ia].grado, nodos[e.ib].grado))
      const dx = u[b] - u[a], dy = u[b + 1] - u[a + 1], dz = u[b + 2] - u[a + 2]
      f[a] += dx * k; f[a + 1] += dy * k; f[a + 2] += dz * k
      f[b] -= dx * k; f[b + 1] -= dy * k; f[b + 2] -= dz * k
    }
    for (let i = 0; i < N; i++) {
      const ix = i * 3
      let fx = f[ix], fy = f[ix + 1], fz = f[ix + 2]
      const m = Math.hypot(fx, fy, fz)
      if (m > temp) { fx *= temp / m; fy *= temp / m; fz *= temp / m }
      const x = u[ix] + fx, y = u[ix + 1] + fy, z = u[ix + 2] + fz
      const l = Math.hypot(x, y, z) || 1
      u[ix] = x / l; u[ix + 1] = y / l; u[ix + 2] = z / l
    }
  }
  const p = new Float64Array(N * 3)
  nodos.forEach((n, i) => {
    const r = radioDe(n)
    p[i * 3] = u[i * 3] * r; p[i * 3 + 1] = u[i * 3 + 1] * r; p[i * 3 + 2] = u[i * 3 + 2] * r
  })
  return p
}

// Nube libre: resortes + repulsión + gravedad al centro, en 3D y sin superficie.
function nube(nodos, enlaces, pasos = 300) {
  const N = nodos.length
  const p = new Float64Array(N * 3), v = new Float64Array(N * 3)
  nodos.forEach((_, i) => {
    const q = fibonacci(i, N)
    const r = 120 + ((i * 7919) % 160)
    p[i * 3] = q[0] * r; p[i * 3 + 1] = q[1] * r; p[i * 3 + 2] = q[2] * r
  })
  for (let paso = 0; paso < pasos; paso++) {
    const alfa = 1 - paso / pasos
    for (let i = 0; i < N; i++) {
      const ix = i * 3
      for (let j = i + 1; j < N; j++) {
        const jx = j * 3
        const dx = p[ix] - p[jx], dy = p[ix + 1] - p[jx + 1], dz = p[ix + 2] - p[jx + 2]
        const d2 = dx * dx + dy * dy + dz * dz + 25
        if (d2 > 160000) continue
        const k = (260 * alfa) / d2
        v[ix] += dx * k; v[ix + 1] += dy * k; v[ix + 2] += dz * k
        v[jx] -= dx * k; v[jx + 1] -= dy * k; v[jx + 2] -= dz * k
      }
    }
    for (const e of enlaces) {
      const a = e.ia * 3, b = e.ib * 3
      const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2]
      const d = Math.hypot(dx, dy, dz) || 1
      const largo = 34 + 3 * Math.sqrt(Math.max(nodos[e.ia].grado, nodos[e.ib].grado))
      const k = (0.06 * alfa * (d - largo)) / d / Math.sqrt(1 + Math.min(nodos[e.ia].grado, nodos[e.ib].grado))
      v[a] += dx * k; v[a + 1] += dy * k; v[a + 2] += dz * k
      v[b] -= dx * k; v[b + 1] -= dy * k; v[b + 2] -= dz * k
    }
    for (let i = 0; i < N * 3; i++) {
      v[i] -= p[i] * 0.004 * alfa
      v[i] *= 0.6
      p[i] += v[i]
    }
  }
  let max = 1
  for (let i = 0; i < N; i++) max = Math.max(max, Math.hypot(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]))
  const s = 360 / max
  for (let i = 0; i < N * 3; i++) p[i] *= s
  return p
}

export class MotorGrafo {
  constructor(canvas, { alSeleccionar, alHover } = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.alSeleccionar = alSeleccionar
    this.alHover = alHover
    this.nodos = []
    this.enlaces = []
    this.porId = new Map()
    this.formaActual = 'esfera'
    this.formas = {}
    this.pos = new Float64Array(0)
    this.desde = new Float64Array(0)
    this.hacia = null
    this.morphT0 = 0
    this.proy = new Float64Array(0)
    this.ordenZ = []
    this.ocultos = new Set()
    this.cam = { yaw: 0.6, pitch: -0.25, zoom: 1, vyaw: 0, vpitch: 0, objYaw: null, objPitch: null, objZoom: 1, dx: 0 }
    this.hover = -1
    this.sel = -1
    this.foco = 0
    this.puntero = null
    this.arrastre = null
    this.toques = new Map()
    this.replay = null
    this.tPrev = performance.now()
    this.dpr = 1
    this.W = 0
    this.H = 0
    this.vivo = true

    this.sprites = {}
    for (const [t, { color }] of Object.entries(TIPOS)) {
      const c = document.createElement('canvas')
      c.width = c.height = SPRITE
      const g = c.getContext('2d')
      const gr = g.createRadialGradient(SPRITE / 2, SPRITE / 2, 0, SPRITE / 2, SPRITE / 2, SPRITE / 2)
      gr.addColorStop(0, color); gr.addColorStop(0.18, color + 'cc'); gr.addColorStop(0.42, color + '33'); gr.addColorStop(1, color + '00')
      g.fillStyle = gr
      g.fillRect(0, 0, SPRITE, SPRITE)
      this.sprites[t] = c
    }
    this.fondo = document.createElement('canvas')

    this._cuadro = this._cuadro.bind(this)
    this._eventos()
    this.ro = new ResizeObserver(() => this._medir())
    this.ro.observe(canvas)
    this._medir()
    this.raf = requestAnimationFrame(this._cuadro)
  }

  _medir() {
    const r = this.canvas.getBoundingClientRect()
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.W = r.width
    this.H = r.height
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr))
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr))
    // Fondo del escritorio de ATV, pintado una vez: vino, rojo abajo a la derecha, acero arriba.
    const W = this.W, H = this.H
    this.fondo.width = this.canvas.width
    this.fondo.height = this.canvas.height
    const g = this.fondo.getContext('2d')
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    g.fillStyle = '#120b0d'
    g.fillRect(0, 0, W, H)
    const capa = (x, y, r, color) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, Math.max(1, r))
      gr.addColorStop(0, color)
      gr.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = gr
      g.fillRect(0, 0, W, H)
    }
    capa(W * 0.82, H * 1.08, Math.max(W, H) * 0.62, 'rgba(214, 70, 58, 0.42)')
    capa(W * 0.08, -H * 0.12, Math.max(W, H) * 0.5, 'rgba(120, 128, 168, 0.32)')
    capa(W * 0.5, H * 0.5, Math.min(W, H) * 0.62, 'rgba(110, 28, 28, 0.42)')
  }

  /** Carga o actualiza el grafo. Lo que ya estaba conserva su lugar; lo nuevo nace brillando. */
  datos({ nodos, enlaces }) {
    const previo = this.porId
    const posPrevia = this.pos
    const ahora = performance.now()
    const lista = nodos.map((n, i) => {
      const viejo = previo.get(n.id)
      const r = viejo
        ? Object.assign(viejo.n, n, { i, grado: 0, vecinos: new Set(), _w: null })
        : { ...n, i, grado: 0, vecinos: new Set(), nace: previo.size ? ahora : 0, _w: null }
      r._previo = viejo ? viejo.i : -1
      return r
    })
    const porId = new Map(lista.map((n) => [n.id, { n, i: n.i }]))
    const links = []
    for (const e of enlaces) {
      const a = porId.get(e.a), b = porId.get(e.b)
      if (!a || !b) continue
      links.push({ ia: a.i, ib: b.i, tipo: e.tipo, creado_en: e.creado_en })
      a.n.grado++; b.n.grado++
      a.n.vecinos.add(b.i); b.n.vecinos.add(a.i)
    }
    for (const n of lista) n.r = TIPOS[n.tipo]?.base * (1 + Math.sqrt(n.grado) * 0.16) || 3
    const cambioEstructura = lista.length !== this.nodos.length || links.length !== this.enlaces.length || lista.some((n) => n._previo < 0)
    const selId = this.sel >= 0 ? this.nodos[this.sel]?.id : null
    this.nodos = lista
    this.enlaces = links
    this.porId = porId
    this.ordenZ = lista.map((n) => n.i)
    this.proy = new Float64Array(lista.length * 4)
    this.sel = selId && porId.has(selId) ? porId.get(selId).i : -1
    this.hover = -1

    // Orden de nacimiento para "Ver cómo creció": primero lo que no tiene fecha (el conocimiento).
    this.ordenNacimiento = lista.map((n) => n.i).sort((a, b) => (lista[a].creado_en || '').localeCompare(lista[b].creado_en || ''))
    this.rangoNacimiento = new Int32Array(lista.length)
    this.ordenNacimiento.forEach((idx, k) => (this.rangoNacimiento[idx] = k))

    // Posición actual reordenada a los nuevos índices; lo nuevo arranca en el centro.
    const pos = new Float64Array(lista.length * 3)
    for (const n of lista) {
      if (n._previo >= 0 && posPrevia.length) pos.set(posPrevia.subarray(n._previo * 3, n._previo * 3 + 3), n.i * 3)
    }
    this.pos = pos
    if (cambioEstructura || !this.formas[this.formaActual]) {
      this.formas = {}
      this.forma(this.formaActual, posPrevia.length > 0)
      if (!posPrevia.length) {
        // Primera carga: nace desde el centro.
        this.desde = new Float64Array(lista.length * 3)
        for (let i = 0; i < this.desde.length; i++) this.desde[i] = (Math.sin(i * 12.9898) * 43758.5453 % 1) * 20
        this.morphT0 = performance.now() + 120
      }
    }
  }

  _calcular(nombre) {
    if (!this.formas[nombre]) {
      const { nodos, enlaces } = this
      this.formas[nombre] =
        nombre === 'nucleo'
          ? sobreEsfera(nodos, enlaces, (n) => CAPA[n.tipo] ?? 2, (n) => RADIO_CAPA[CAPA[n.tipo] ?? 2])
          : nombre === 'nube'
            ? nube(nodos, enlaces)
            : sobreEsfera(nodos, enlaces, () => 0, () => 320)
    }
    return this.formas[nombre]
  }

  /** Cambia la forma con una transición: cada neurona viaja de donde está a su nuevo lugar. */
  forma(nombre, animar = true) {
    this.formaActual = nombre
    if (!this.nodos.length) return
    this.desde = new Float64Array(this.pos)
    this.hacia = this._calcular(nombre)
    this.morphT0 = animar ? performance.now() : -1e9
    // Si había una neurona elegida, la cámara la sigue a su lugar nuevo.
    if (this.sel >= 0) this.seleccionar(this.nodos[this.sel].id)
  }

  ocultar(tipos) {
    this.ocultos = new Set(tipos)
    if (this.sel >= 0 && this.ocultos.has(this.nodos[this.sel]?.tipo)) this.seleccionar(null)
  }

  /** Gira la esfera hasta dejar la neurona de frente, corrida para que no la tape el panel. */
  seleccionar(id) {
    const e = id ? this.porId.get(id) : null
    this.sel = e ? e.i : -1
    if (!e) {
      this.cam.dx = 0
      return
    }
    const i = e.i
    const p = this.hacia || this.pos // si está cambiando de forma, apunta a donde va a quedar
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2]
    this.cam.objYaw = Math.atan2(-x, z)
    this.cam.objPitch = Math.atan2(y, Math.hypot(x, z))
    this.cam.objZoom = Math.max(this.cam.objZoom, 1.05)
    this.cam.vyaw = this.cam.vpitch = 0
    this.cam.dx = this.W < 700 ? 0 : -(Math.min(380, this.W - 24) + 12) / 2
  }

  /** "Ver cómo creció": las neuronas aparecen en el orden en que se fueron sumando. */
  reproducir(ms = 7000) {
    if (!this.nodos.length) return
    this.replay = { t0: performance.now(), ms }
  }

  despertar() {}

  destruir() {
    this.vivo = false
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this._quitarEventos?.()
  }

  _visible(i) {
    return !this.ocultos.has(this.nodos[i].tipo)
  }

  _cuadro(t) {
    if (!this.vivo) return
    const dt = Math.min(0.05, (t - this.tPrev) / 1000)
    this.tPrev = t
    const N = this.nodos.length
    const cam = this.cam

    if (this.hacia) {
      const k = Math.max(0, Math.min(1, (t - this.morphT0) / MORPH_MS))
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
      const d = this.desde, h = this.hacia, p = this.pos
      for (let i = 0; i < N * 3; i++) p[i] = d[i] + (h[i] - d[i]) * e
      if (k >= 1) this.hacia = null
    }

    if (cam.objYaw != null) {
      const s = 1 - Math.exp(-dt * 7)
      let d = cam.objYaw - cam.yaw
      d = Math.atan2(Math.sin(d), Math.cos(d))
      cam.yaw += d * s
      cam.pitch += (cam.objPitch - cam.pitch) * s
      if (Math.abs(d) < 0.002 && Math.abs(cam.objPitch - cam.pitch) < 0.002) cam.objYaw = null
    } else if (!this.arrastre) {
      cam.yaw += cam.vyaw * dt
      cam.pitch += cam.vpitch * dt
      const amort = Math.exp(-dt * 3.2)
      cam.vyaw *= amort
      cam.vpitch *= amort
      if (this.sel < 0 && Math.abs(cam.vyaw) < 0.12) cam.yaw += 0.09 * dt
    }
    cam.pitch = Math.max(-1.35, Math.min(1.35, cam.pitch))
    cam.zoom += (cam.objZoom - cam.zoom) * (1 - Math.exp(-dt * 12))
    cam.ox = (cam.ox || 0) + ((this.sel >= 0 ? cam.dx : 0) - (cam.ox || 0)) * (1 - Math.exp(-dt * 8))
    this.foco += ((this.hover >= 0 || this.sel >= 0 ? 1 : 0) - this.foco) * (1 - Math.exp(-dt * 10))

    let aparece = null
    if (this.replay) {
      const k = (t - this.replay.t0) / this.replay.ms
      if (k >= 1.15) this.replay = null
      else aparece = Math.max(0, k) * N
    }
    this.aparece = aparece

    this._proyectar()
    if (this.puntero && !this.arrastre) {
      const h = this._buscarEn(this.puntero.x, this.puntero.y)
      if (h !== this.hover) {
        this.hover = h
        this.canvas.style.cursor = h >= 0 ? 'pointer' : 'grab'
        this.alHover?.(h >= 0 ? this.nodos[h] : null)
      }
    }
    this._dibujar(t)
    this.raf = requestAnimationFrame(this._cuadro)
  }

  _proyectar() {
    const { cam, W, H, pos, proy } = this
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch)
    const D = 1150, esc = (Math.min(W, H) / 900) * cam.zoom
    const cx = W / 2 + (cam.ox || 0)
    for (let i = 0; i < this.nodos.length; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]
      const x1 = x * cy + z * sy
      const z1 = -x * sy + z * cy
      const y2 = y * cp - z1 * sp
      const z2 = y * sp + z1 * cp
      const s = (D / (D - z2)) * esc
      proy[i * 4] = cx + x1 * s
      proy[i * 4 + 1] = H / 2 + y2 * s
      proy[i * 4 + 2] = s
      proy[i * 4 + 3] = Math.max(0, Math.min(1, (z2 / 380 + 1) / 2))
    }
  }

  _nacio(i) {
    return this.aparece == null || this.rangoNacimiento[i] < this.aparece
  }

  _buscarEn(px, py) {
    const { proy } = this
    let mejor = -1, mejorZ = -1
    for (let i = 0; i < this.nodos.length; i++) {
      if (!this._visible(i) || !this._nacio(i)) continue
      const dx = proy[i * 4] - px, dy = proy[i * 4 + 1] - py
      const rad = Math.max(9, this.nodos[i].r * proy[i * 4 + 2] + 5)
      if (dx * dx + dy * dy < rad * rad && proy[i * 4 + 3] > mejorZ) {
        mejor = i
        mejorZ = proy[i * 4 + 3]
      }
    }
    return mejor
  }

  _dibujar(t) {
    const { ctx, proy, nodos, enlaces, W, H } = this
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.drawImage(this.fondo, 0, 0)
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)

    const centro = this.sel >= 0 ? this.sel : this.hover
    const cerca = centro >= 0 ? nodos[centro].vecinos : null
    const resaltado = (i) => centro < 0 || i === centro || cerca.has(i)
    const apagar = 1 - 0.82 * this.foco
    const vis = (i) => this._visible(i) && this._nacio(i)

    // Conexiones en 3 bandas de profundidad: atrás casi invisibles, adelante nítidas.
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineWidth = 0.7
    for (let banda = 0; banda < 3; banda++) {
      ctx.beginPath()
      for (const e of enlaces) {
        if (!vis(e.ia) || !vis(e.ib)) continue
        if (centro >= 0 && (e.ia === centro || e.ib === centro)) continue
        const z = (proy[e.ia * 4 + 3] + proy[e.ib * 4 + 3]) / 2
        if (Math.min(2, Math.floor(z * 3)) !== banda) continue
        ctx.moveTo(proy[e.ia * 4], proy[e.ia * 4 + 1])
        ctx.lineTo(proy[e.ib * 4], proy[e.ib * 4 + 1])
      }
      ctx.strokeStyle = `rgba(255, 150, 130, ${(0.03 + banda * 0.045) * apagar})`
      ctx.stroke()
    }
    if (centro >= 0) {
      ctx.beginPath()
      for (const e of enlaces) {
        if (e.ia !== centro && e.ib !== centro) continue
        if (!vis(e.ia) || !vis(e.ib)) continue
        ctx.moveTo(proy[e.ia * 4], proy[e.ia * 4 + 1])
        ctx.lineTo(proy[e.ib * 4], proy[e.ib * 4 + 1])
      }
      ctx.strokeStyle = `rgba(255, 130, 110, ${0.25 + 0.5 * this.foco})`
      ctx.lineWidth = 1.2
      ctx.stroke()
    }

    // Neuronas de atrás hacia adelante, con brillo aditivo.
    const orden = this.ordenZ
    orden.sort((a, b) => proy[a * 4 + 3] - proy[b * 4 + 3])
    for (const i of orden) {
      if (!vis(i)) continue
      const n = nodos[i]
      const z = proy[i * 4 + 3], s = proy[i * 4 + 2]
      let a = 0.22 + 0.78 * z
      if (!resaltado(i)) a *= apagar
      if (this.aparece != null) a *= Math.min(1, this.aparece - this.rangoNacimiento[i])
      const rr = n.r * s
      const tam = rr * 5.2
      const x = proy[i * 4], y = proy[i * 4 + 1]
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = a * 0.75
      ctx.drawImage(this.sprites[n.tipo] || this.sprites.clase, x - tam / 2, y - tam / 2, tam, tam)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = a
      ctx.fillStyle = TIPOS[n.tipo]?.color || '#fff'
      ctx.beginPath()
      ctx.arc(x, y, Math.max(0.8, rr * 0.62), 0, Math.PI * 2)
      ctx.fill()
      // Lo que aprendió recién nace con un anillo que se expande.
      if (n.nace) {
        const k = (t - n.nace) / 1600
        if (k < 1) {
          ctx.globalAlpha = (1 - k) * 0.8
          ctx.strokeStyle = '#ff6a5b'
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(x, y, rr + 4 + k * 22, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
    }
    ctx.globalAlpha = 1
    for (const i of [this.sel, this.hover]) {
      if (i < 0 || !vis(i)) continue
      ctx.beginPath()
      ctx.arc(proy[i * 4], proy[i * 4 + 1], nodos[i].r * proy[i * 4 + 2] * 0.62 + 5, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    this._etiquetas(centro, cerca, apagar, vis)
  }

  // Adelante y sin pisarse; con una neurona elegida, primero sus vecinas.
  _etiquetas(centro, cerca, apagar, vis) {
    const { ctx, proy, nodos, cam } = this
    const cand = []
    for (let i = 0; i < nodos.length; i++) {
      if (!vis(i)) continue
      const n = nodos[i], z = proy[i * 4 + 3]
      const enFoco = centro >= 0 && (i === centro || cerca.has(i))
      const importante = n.tipo === 'modulo' || n.tipo === 'coach' || n.tipo === 'plan' || n.tipo === 'frente' || n.grado >= 16
      let a
      if (i === centro) a = 1
      else if (enFoco) a = 0.35 + 0.65 * z
      else if (importante) a = Math.max(0, (z - 0.45) / 0.55) * (centro >= 0 ? apagar : 1)
      else a = Math.max(0, (z - 0.7) / 0.3) * Math.max(0, (cam.zoom - 1.1) / 0.7) * (centro >= 0 ? apagar : 1)
      if (a < 0.05) continue
      cand.push({ i, a, pr: (i === centro ? 1e6 : 0) + (enFoco ? 1e4 : 0) + (importante ? 1e3 : 0) + n.grado + z })
    }
    cand.sort((x, y) => y.pr - x.pr)
    const ocupado = []
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    let fuenteActual = ''
    for (const { i, a } of cand) {
      const n = nodos[i]
      const fuerte = i === centro
      const fuente = fuerte ? FUENTE_CENTRO : FUENTE
      if (fuente !== fuenteActual) {
        ctx.font = fuente
        fuenteActual = fuente
      }
      const texto = n.nombre.length > 36 ? n.nombre.slice(0, 34) + '…' : n.nombre
      n._w ||= {}
      const w = n._w[fuerte] ?? (n._w[fuerte] = ctx.measureText(texto).width)
      const x = proy[i * 4], y = proy[i * 4 + 1] + n.r * proy[i * 4 + 2] * 0.62 + 6
      const r = [x - w / 2 - 3, y - 1, x + w / 2 + 3, y + 15]
      if (!fuerte && ocupado.some((o) => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1])) continue
      ocupado.push(r)
      if (ocupado.length > 70) break
      ctx.fillStyle = `rgba(0,0,0,${a * 0.55})`
      ctx.fillText(texto, x, y + 1)
      ctx.fillStyle = `rgba(246,236,230,${a})`
      ctx.fillText(texto, x, y)
    }
  }

  _eventos() {
    const c = this.canvas
    const cam = this.cam
    const abajo = (e) => {
      c.setPointerCapture(e.pointerId)
      this.toques.set(e.pointerId, { x: e.offsetX, y: e.offsetY })
      this.arrastre = { x: e.offsetX, y: e.offsetY, x0: e.offsetX, y0: e.offsetY, t: performance.now(), movio: false }
      cam.vyaw = cam.vpitch = 0
      cam.objYaw = null
      c.style.cursor = 'grabbing'
    }
    const mover = (e) => {
      this.puntero = { x: e.offsetX, y: e.offsetY }
      if (this.toques.has(e.pointerId)) this.toques.set(e.pointerId, { x: e.offsetX, y: e.offsetY })
      if (this.toques.size === 2 && this.arrastre) {
        const [p, q] = [...this.toques.values()]
        const d = Math.hypot(p.x - q.x, p.y - q.y)
        if (this.arrastre.pinza) cam.objZoom = Math.max(0.5, Math.min(3.2, (cam.objZoom * d) / this.arrastre.pinza))
        this.arrastre.pinza = d
        this.arrastre.movio = true
        return
      }
      if (!this.arrastre) return
      const dx = e.offsetX - this.arrastre.x, dy = e.offsetY - this.arrastre.y
      if (Math.hypot(e.offsetX - this.arrastre.x0, e.offsetY - this.arrastre.y0) > 4) this.arrastre.movio = true
      const k = 0.0062 / cam.zoom
      cam.yaw += dx * k
      cam.pitch += dy * k
      const ahora = performance.now(), dtm = Math.max(8, ahora - this.arrastre.t) / 1000
      cam.vyaw = (dx * k) / dtm
      cam.vpitch = (dy * k) / dtm
      this.arrastre.x = e.offsetX
      this.arrastre.y = e.offsetY
      this.arrastre.t = ahora
    }
    const soltar = (e) => {
      this.toques.delete(e.pointerId)
      if (!this.arrastre || this.toques.size) return
      if (!this.arrastre.movio) {
        const i = this._buscarEn(e.offsetX, e.offsetY)
        this.alSeleccionar?.(i >= 0 ? this.nodos[i].id : null)
        cam.vyaw = cam.vpitch = 0
      } else if (performance.now() - this.arrastre.t > 90) {
        cam.vyaw = cam.vpitch = 0
      }
      this.arrastre = null
      c.style.cursor = this.hover >= 0 ? 'pointer' : 'grab'
    }
    const salir = () => {
      this.puntero = null
      if (this.hover >= 0) {
        this.hover = -1
        this.alHover?.(null)
      }
    }
    const rueda = (e) => {
      e.preventDefault()
      cam.objZoom = Math.max(0.5, Math.min(3.2, cam.objZoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))))
    }
    c.addEventListener('pointerdown', abajo)
    c.addEventListener('pointermove', mover)
    c.addEventListener('pointerup', soltar)
    c.addEventListener('pointercancel', soltar)
    c.addEventListener('pointerleave', salir)
    c.addEventListener('wheel', rueda, { passive: false })
    this._quitarEventos = () => {
      c.removeEventListener('pointerdown', abajo)
      c.removeEventListener('pointermove', mover)
      c.removeEventListener('pointerup', soltar)
      c.removeEventListener('pointercancel', soltar)
      c.removeEventListener('pointerleave', salir)
      c.removeEventListener('wheel', rueda)
    }
  }
}
