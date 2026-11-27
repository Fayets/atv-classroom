// ---------- Automatizaciones de Instagram, como ManyChat ----------
// El flujo dibujado en cajas, con el celular del lead al lado. El agente lo arma y lo corrige con lo que le pedís;
// prenderlo es solo de una persona, desde acá.
const auto = { lista: null, error: "", abierta: null, flujo: null, cargando: false, guardando: false, aviso: "", elegida: null, sigue: true, responde: false, pedido: "", archivo: null, subiendo: false, pidiendo: null, contenido: null, picker: null, reloj: null, pestana: "flujo", corridas: null, palabras: null, numeros: null };
const ESTADO_AUTO = { active: ["Prendida", "on"], draft: ["Borrador", ""], paused: ["Apagada", "off"] };

async function cargarAutomatizaciones() {
	const r = await api("/ig/flujos").catch(() => null);
	const d = r ? await r.json().catch(() => ({})) : {};
	auto.lista = r?.ok ? d.automatizaciones : [];
	auto.error = r?.ok ? "" : d.error ?? "No se pudo traer las automatizaciones";
	renderBody();
}

async function cargarContenidoIg() {
	const r = await api("/ig/contenido").catch(() => null);
	auto.contenido = r?.ok ? await r.json().catch(() => null) : { historias: [], reels: [] };
	renderBody();
}

async function abrirFlujo(id) {
	auto.abierta = id;
	auto.aviso = "";
	auto.elegida = null;
	if (auto.flujo?.id !== id) auto.flujo = null;
	renderBody();
	await refrescarFlujo();
	void cargarNumerosFlujo();
}

/** Los números de cada caja, como en ManyChat. Se piden aparte: leer los recorridos tarda más que el flujo. */
async function cargarNumerosFlujo() {
	const id = auto.abierta;
	if (!id) return;
	const r = await api(`/ig/flujos/${id}/estadisticas`).catch(() => null);
	const d = r?.ok ? await r.json().catch(() => null) : null;
	if (auto.abierta !== id || !d) return;
	auto.numeros = { id, ...d };
	if (!document.activeElement?.closest?.(".aeditor,.apedido")) renderBody();
}

async function refrescarFlujo() {
	const id = auto.abierta;
	if (!id) return;
	const r = await api(`/ig/flujos/${id}`).catch(() => null);
	const d = r ? await r.json().catch(() => ({})) : {};
	if (auto.abierta !== id) return;
	if (!r?.ok) {
		auto.aviso = d.error ?? "No se pudo abrir la automatización";
		return renderBody();
	}
	auto.flujo = d;
	renderBody();
}

function abrirAutomatizaciones() {
	if (auto.abierta) void refrescarFlujo();
	else void cargarAutomatizaciones();
	if (!auto.contenido) void cargarContenidoIg();
	// Arranca a leer cómo escribe la gente, así al crear una automatización las sugerencias ya están.
	void api("/ig/palabras?base=").catch(() => null);
	clearInterval(auto.reloj);
	// Mientras el agente arma el flujo, se mira cada 4 segundos; si no, cada 30.
	let vuelta = 0;
	auto.reloj = setInterval(() => {
		if (view.type !== "auto") return clearInterval(auto.reloj);
		vuelta++;
		const agente = auto.pidiendo && state.agents.find(a => a.id === auto.pidiendo.agente);
		if (auto.pidiendo && agente && !agente.busy && Date.now() - auto.pidiendo.desde > 8000) auto.pidiendo = null;
		if (document.activeElement?.closest?.(".aeditor,.apedido")) return;
		if (auto.abierta && auto.pestana === "contactos" && vuelta % 8 === 0) void cargarCorridas();
		if (auto.abierta && (auto.pidiendo || vuelta % 8 === 0)) void refrescarFlujo();
		if (auto.abierta && vuelta % 15 === 0) void cargarNumerosFlujo();
		else if (!auto.abierta && vuelta % 8 === 0) void cargarAutomatizaciones();
	}, 4000);
}

// ---- Cómo se lee cada caja ----
const horasDe = min => (min % 60 ? `${min} min` : `${min / 60} h`);
function disparoTexto(d, cfg) {
	if (d?.tipo === "historia") return `Responde «${d.palabras.join(" / ")}» a ${d.mediaId ? "esta historia" : "una historia"}${d.tambienDm ? " o por DM" : ""}`;
	if (d?.tipo === "reel") return `Comenta «${d.palabras.join(" / ")}» en el reel`;
	if (d?.tipo === "mencion") return "Te menciona en su historia";
	if (d?.tipo === "dm") return `Escribe «${d.palabras.join(" / ")}» por DM`;
	const kw = cfg?.keywords ?? cfg?.comment?.keywords ?? [];
	return kw.length ? `Escribe «${kw.join(" / ")}»` : "Cuando llega un mensaje";
}
function cajaTexto(n, d) {
	const c = n.config ?? {};
	if (n.type === "trigger") return ["Cuando", disparoTexto(d, c)];
	if (n.type === "send_message") return [n.label || "Mensaje", c.text || "(sin texto)"];
	if (n.type === "wait_for_reply") return [n.label || "Espera respuesta", `hasta ${horasDe(c.timeoutMinutes ?? 0)}`];
	if (n.type === "delay") return [n.label || "Espera", horasDe(c.delayMinutes ?? 0)];
	if (n.type === "condition") return ["Si", n.label || (c.rules ?? []).map(r => `${r.variable} ${r.operator} ${r.value ?? ""}`).join(" · ")];
	if (n.type === "add_tag") return ["Etiqueta", c.tag ?? ""];
	if (n.type === "remove_tag") return ["Saca la etiqueta", c.tag ?? ""];
	if (n.type === "handoff") return ["Pasa a una persona", c.note ?? n.label ?? ""];
	if (n.type === "end") return ["Fin", n.label && n.label !== "Fin" ? n.label : ""];
	return [n.label || n.type, ""];
}
function nombreRama(n, handle) {
	if (!handle) return "";
	if (n?.type === "wait_for_reply") return handle === "reply" ? "responde" : "no responde";
	if (n?.type === "a_b_split") return handle.toUpperCase();
	if (n?.type !== "condition") return handle;
	if (handle === "default") return (n.config?.rules ?? []).some(r => r.variable === "contact.isFollower") ? "no nos sigue" : n.id === "filtro-historia" ? "otra historia" : "si no";
	const regla = (n.config?.rules ?? []).find(r => r.id === handle);
	if (regla?.variable === "contact.isFollower") return "nos sigue";
	if (regla?.variable === "story.id") return regla.operator === "not_exists" ? "por DM" : "esa historia";
	return handle;
}

// ---- El lienzo: por niveles desde el disparo; las flechas que vuelven atrás van punteadas al costado ----
const CAJA_W = 232;
const CAJA_H = 88;
const PASO_X = 262;
const PASO_Y = 128;
function acomodar(f) {
	const nivel = new Map();
	const orden = [];
	const entrada = f.entrada ?? f.nodos.find(n => n.type === "trigger")?.id;
	if (!entrada) return { pos: new Map(), ancho: 0, alto: 0 };
	nivel.set(entrada, 0);
	const cola = [entrada];
	while (cola.length) {
		const id = cola.shift();
		orden.push(id);
		for (const a of f.aristas.filter(x => x.source === id)) {
			if (nivel.has(a.target)) continue;
			nivel.set(a.target, nivel.get(id) + 1);
			cola.push(a.target);
		}
	}
	// Las cajas sueltas (sin flecha que llegue) van abajo de todo.
	let max = Math.max(0, ...nivel.values());
	for (const n of f.nodos) if (!nivel.has(n.id)) (nivel.set(n.id, ++max), orden.push(n.id));
	const filas = new Map();
	for (const id of orden) {
		const l = nivel.get(id);
		if (!filas.has(l)) filas.set(l, []);
		filas.get(l).push(id);
	}
	const anchoMax = Math.max(...[...filas.values()].map(f => f.length));
	const ancho = Math.max(anchoMax * PASO_X, PASO_X) + 80;
	const pos = new Map();
	for (const [l, ids] of filas) ids.forEach((id, i) => pos.set(id, { x: ancho / 2 + (i - (ids.length - 1) / 2) * PASO_X - CAJA_W / 2, y: 30 + l * PASO_Y }));
	return { pos, ancho, alto: 30 + (Math.max(...filas.keys()) + 1) * PASO_Y + 90, nivel };
}

function camino(f) {
	// Lo que recorre el lead según lo que se eligió arriba del celular: nos sigue o no, responde o no.
	const porId = new Map(f.nodos.map(n => [n.id, n]));
	const sale = (id, handle) => f.aristas.find(a => a.source === id && (handle == null ? !a.sourceHandle : a.sourceHandle === handle)) ?? (handle == null ? f.aristas.find(a => a.source === id) : null);
	const pasos = [];
	const visto = new Map();
	let id = f.entrada ?? f.nodos.find(n => n.type === "trigger")?.id;
	let ultimoBoton = null;
	while (id && pasos.length < 40) {
		const veces = (visto.get(id) ?? 0) + 1;
		visto.set(id, veces);
		if (veces > 2) break;
		const n = porId.get(id);
		if (!n) break;
		let siguiente = null;
		if (n.type === "condition") {
			const reglas = n.config?.rules ?? [];
			const deSeguir = reglas.find(r => r.variable === "contact.isFollower");
			const regla = deSeguir ? (auto.sigue === (deSeguir.operator !== "is_false") ? deSeguir : null) : reglas[0];
			siguiente = sale(id, regla ? regla.id : "default") ?? sale(id, "default");
			pasos.push({ id, tipo: "rama", texto: nombreRama(n, regla ? regla.id : "default") });
		} else if (n.type === "wait_for_reply") {
			const responde = auto.responde || Boolean(ultimoBoton);
			pasos.push(responde ? { id, tipo: "lead", texto: ultimoBoton ?? "(responde)" } : { id, tipo: "pausa", texto: `pasan ${horasDe(n.config?.timeoutMinutes ?? 0)} sin respuesta` });
			siguiente = sale(id, responde ? "reply" : "timeout");
			ultimoBoton = null;
		} else if (n.type === "a_b_split") {
			pasos.push({ id, tipo: "rama", texto: "A/B" });
			siguiente = sale(id, "a");
		} else {
			if (n.type === "trigger") pasos.push({ id, tipo: "disparo" });
			if (n.type === "send_message") {
				pasos.push({ id, tipo: "nosotros", texto: n.config?.text ?? "", botones: n.config?.buttons ?? [] });
				const postback = (n.config?.buttons ?? []).find(b => b.type === "postback");
				ultimoBoton = postback?.title ?? null;
			}
			if (n.type === "delay") pasos.push({ id, tipo: "pausa", texto: `${horasDe(n.config?.delayMinutes ?? 0)} después` });
			if (n.type === "add_tag") pasos.push({ id, tipo: "sistema", texto: `etiqueta «${n.config?.tag ?? ""}»` });
			if (n.type === "handoff") pasos.push({ id, tipo: "sistema", texto: "pasa el chat a una persona" });
			if (n.type === "end") break;
			siguiente = sale(id, null);
		}
		id = siguiente?.target ?? null;
	}
	return pasos;
}

function celularHtml(f) {
	const d = f.disparo;
	const usuario = esc(state.instagram?.username ?? "tu cuenta");
	const burbujas = camino(f).map(p => {
		const sel = p.id === auto.elegida ? " elegida" : "";
		if (p.tipo === "disparo") {
			if (d?.tipo === "historia") return `<span class="cel-sis der">Respondiste a su historia</span>${d.miniatura ? `<img class="cel-hist" src="${esc(scoped(d.miniatura))}" alt="">` : `<span class="cel-hist"></span>`}<div class="cel-b der${sel}">${esc(d.palabras[0] ?? "")}</div>`;
			if (d?.tipo === "reel") return `<span class="cel-sis">Comentaste «${esc(d.palabras[0] ?? "")}» en su reel</span>`;
			if (d?.tipo === "mencion") return `<span class="cel-sis">Lo mencionaste en tu historia</span>`;
			const kw = d?.palabras?.[0] ?? f.nodos.find(n => n.type === "trigger")?.config?.keywords?.[0] ?? "hola";
			return `<div class="cel-b der${sel}">${esc(kw)}</div>`;
		}
		if (p.tipo === "nosotros") return `<div class="cel-b${sel}">${esc(p.texto)}</div>${p.botones.map(b => `<span class="cel-boton">${esc(b.title ?? "")}</span>`).join("")}`;
		if (p.tipo === "lead") return `<div class="cel-b der${sel}">${esc(p.texto)}</div>`;
		if (p.tipo === "pausa") return `<span class="cel-pausa${sel}">${esc(p.texto)}</span>`;
		if (p.tipo === "sistema") return `<span class="cel-sis centro${sel}">${esc(p.texto)}</span>`;
		return "";
	}).join("");
	const tieneSeguir = f.nodos.some(n => n.type === "condition" && (n.config?.rules ?? []).some(r => r.variable === "contact.isFollower"));
	const tieneEspera = f.nodos.some(n => n.type === "wait_for_reply");
	const seg = (clave, si, no, valor) => `<div class="aseg" role="group"><button class="${valor ? "on" : ""}" data-auto-sim="${clave}:1">${si}</button><button class="${valor ? "" : "on"}" data-auto-sim="${clave}:0">${no}</button></div>`;
	return `<aside class="acel">
		<div class="acel-sim">${tieneSeguir ? seg("sigue", "Nos sigue", "No nos sigue", auto.sigue) : ""}${tieneEspera ? seg("responde", "Responde", "No responde", auto.responde) : ""}</div>
		<div class="cel"><div class="cel-cab"><span class="cel-cara">${usuario.slice(0, 2).toUpperCase()}</span><b>${usuario}</b></div><div class="cel-msgs">${burbujas}</div></div>
	</aside>`;
}

/** El número de cada caja: el disparo cuenta los que entraron; un mensaje, los enviados; el resto, los que pasaron. */
function numeroCaja(n, numeros) {
	if (!numeros) return null;
	const c = numeros.porCaja?.[n.id];
	const pasaron = c?.pasaron ?? 0;
	const fmt = x => x.toLocaleString("es-AR");
	const falla = c?.fallaron ? ` · <em>${fmt(c.fallaron)} con error</em>` : "";
	if (n.type === "trigger") return { texto: `<b>${fmt(numeros.entraron)}</b> ${numeros.entraron === 1 ? "entró" : "entraron"}`, titulo: "Personas que dispararon la automatización" };
	if (n.type === "send_message") {
		const clics = c?.clics == null ? "" : ` · <b>${fmt(c.clics)}</b> ${c.clics === 1 ? "clic" : "clics"}${pasaron ? ` <small>${Math.round((c.clics / pasaron) * 100)} %</small>` : ""}`;
		return { texto: `<b>${fmt(pasaron)}</b> ${pasaron === 1 ? "enviado" : "enviados"}${clics}${falla}`, titulo: c?.clics == null ? "Mensajes enviados desde esta caja" : "Mensajes enviados y personas que tocaron el link (sin contar la vista previa de Instagram)" };
	}
	// La caja Fin no se dibuja: lo que terminaron ya está en la lista.
	if (n.type === "end") return null;
	return { texto: `<b>${fmt(pasaron)}</b> ${pasaron === 1 ? "pasó" : "pasaron"}${falla}`, titulo: "Personas que pasaron por esta caja" };
}

function lienzoHtml(f) {
	const { pos, ancho, alto, nivel } = acomodar(f);
	const porId = new Map(f.nodos.map(n => [n.id, n]));
	const numeros = auto.numeros?.id === f.id ? auto.numeros : null;
	const conCuantos = (rama, a) => {
		const n = numeros?.porCaja?.[a.source]?.ramas?.[a.sourceHandle];
		return numeros && rama ? `${rama} · ${(n ?? 0).toLocaleString("es-AR")}` : rama;
	};
	const lineas = [];
	const etiquetas = [];
	for (const a of f.aristas) {
		const p = pos.get(a.source);
		const q = pos.get(a.target);
		if (!p || !q) continue;
		const atras = nivel.get(a.target) <= nivel.get(a.source);
		if (atras) {
			// Vuelve a una caja de más arriba: va por el costado derecho, punteada.
			const x1 = p.x + CAJA_W;
			const y1 = p.y + CAJA_H / 2;
			const x2 = q.x + CAJA_W;
			const y2 = q.y + CAJA_H / 2;
			const lado = Math.max(x1, x2) + 40;
			lineas.push(`<path d="M${x1} ${y1} C${lado} ${y1} ${lado} ${y2} ${x2 + 6} ${y2}" class="vuelve" marker-end="url(#punta)"/>`);
			const rama = conCuantos(nombreRama(porId.get(a.source), a.sourceHandle), a);
			if (rama) etiquetas.push(`<span class="arama" style="left:${lado - 10}px;top:${(y1 + y2) / 2}px">${esc(rama)}</span>`);
		} else {
			const x1 = p.x + CAJA_W / 2;
			const y1 = p.y + CAJA_H;
			const x2 = q.x + CAJA_W / 2;
			const y2 = q.y - 4;
			const medio = (y1 + y2) / 2;
			lineas.push(`<path d="M${x1} ${y1} C${x1} ${medio} ${x2} ${medio} ${x2} ${y2}" marker-end="url(#punta)"/>`);
			const rama = conCuantos(nombreRama(porId.get(a.source), a.sourceHandle), a);
			if (rama) etiquetas.push(`<span class="arama" style="left:${(x1 + x2) / 2}px;top:${medio}px">${esc(rama)}</span>`);
		}
	}
	const cajas = f.nodos.map(n => {
		const p = pos.get(n.id);
		const [tipo, texto] = cajaTexto(n, f.disparo);
		const numero = numeroCaja(n, numeros);
		const mini = n.type === "trigger" && f.disparo?.miniatura ? `<img class="amini" src="${esc(scoped(f.disparo.miniatura))}" alt="">` : "";
		const botones = n.type === "send_message" && n.config?.buttons?.length ? `<span class="abot">${n.config.buttons.map(b => esc(b.title ?? "")).join(" · ")}</span>` : "";
		return `<button class="acaja t-${n.type} ${n.id === auto.elegida ? "on" : ""}" style="left:${p.x}px;top:${p.y}px" data-auto-caja="${esc(n.id)}">${mini}<span class="atx"><small>${esc(tipo)}</small><span>${esc(texto)}</span>${botones}</span></button>${numero ? `<span class="anumcaja" style="left:${p.x + CAJA_W}px;top:${p.y}px" title="${esc(numero.titulo)}">${numero.texto}</span>` : ""}`;
	}).join("");
	return `<div class="alienzo-in" style="width:${ancho}px;height:${alto}px"><svg class="alineas" width="${ancho}" height="${alto}" aria-hidden="true"><defs><marker id="punta" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="rgba(36,35,33,.5)"/></marker></defs>${lineas.join("")}</svg>${etiquetas.join("")}${cajas}</div>`;
}

// ---- Editar una caja a mano ----
function editorCajaHtml(f) {
	const n = f.nodos.find(x => x.id === auto.elegida);
	if (!n) return "";
	const c = n.config ?? {};
	let campos = "";
	if (n.type === "send_message") {
		campos = `<label>Lo que le llega<textarea id="ae-texto" rows="4" maxlength="1000">${esc(c.text ?? "")}</textarea></label>
			<div class="ae-botones">${[0, 1, 2].map(i => `<input id="ae-boton-${i}" placeholder="Botón ${i + 1}" maxlength="20" value="${esc(c.buttons?.[i]?.title ?? "")}"><input id="ae-link-${i}" placeholder="Link (si no, espera que lo toque)" value="${esc(c.buttons?.[i]?.url ?? "")}">`).join("")}</div>`;
	} else if (n.type === "wait_for_reply" || n.type === "delay") {
		const min = n.type === "delay" ? c.delayMinutes : c.timeoutMinutes;
		campos = `<label>Horas<input id="ae-horas" type="number" min="0.1" max="720" step="0.5" value="${(min ?? 60) / 60}"></label>${(min ?? 0) > 1200 ? `<span class="ae-nota">Más de 20 h: si después sale un mensaje automático, Instagram no lo deja pasar.</span>` : ""}`;
	} else if (n.type === "add_tag" || n.type === "remove_tag") {
		campos = `<label>Etiqueta<input id="ae-tag" value="${esc(c.tag ?? "")}"></label>`;
	} else if (n.type === "trigger") {
		return `<div class="aeditor"><div class="ae-cab"><b>Dónde se dispara</b><button class="ic" data-auto-cerrar-caja aria-label="Cerrar">${ic("x")}</button></div><p class="ae-nota">${esc(disparoTexto(f.disparo, c))}</p><div class="ae-pie"><button class="b p" data-auto-disparo>Cambiar</button></div></div>`;
	} else {
		return `<div class="aeditor"><div class="ae-cab"><b>${esc(cajaTexto(n, f.disparo)[0])}</b><button class="ic" data-auto-cerrar-caja aria-label="Cerrar">${ic("x")}</button></div><p class="ae-nota">Esta caja se cambia pidiéndoselo al agente abajo.</p></div>`;
	}
	return `<div class="aeditor"><div class="ae-cab"><b>${esc(cajaTexto(n, f.disparo)[0])}</b><button class="ic" data-auto-cerrar-caja aria-label="Cerrar">${ic("x")}</button></div>${campos}<div class="ae-pie"><button class="b p" data-auto-guardar-caja ${auto.guardando ? "disabled" : ""}>${auto.guardando ? "Guardando…" : "Guardar"}</button></div></div>`;
}

async function guardarCaja() {
	const f = auto.flujo;
	const n = f?.nodos.find(x => x.id === auto.elegida);
	if (!n) return;
	const val = id => document.getElementById(id)?.value ?? "";
	const config = { ...(n.config ?? {}) };
	if (n.type === "send_message") {
		config.text = val("ae-texto").trim();
		const botones = [0, 1, 2].map(i => ({ title: val(`ae-boton-${i}`).trim(), url: val(`ae-link-${i}`).trim() })).filter(b => b.title).map(b => (b.url ? { type: "url", title: b.title, url: /^https?:\/\//.test(b.url) ? b.url : `https://${b.url}` } : { type: "postback", title: b.title }));
		if (botones.length) config.buttons = botones;
		else delete config.buttons;
	}
	if (n.type === "wait_for_reply" || n.type === "delay") config[n.type === "delay" ? "delayMinutes" : "timeoutMinutes"] = Math.max(1, Math.round(Number(val("ae-horas")) * 60));
	if (n.type === "add_tag" || n.type === "remove_tag") config.tag = val("ae-tag").trim();
	auto.guardando = true;
	renderBody();
	const nodos = f.nodos.map(x => (x.id === n.id ? { ...x, config } : x));
	const r = await api(`/ig/flujos/${f.id}`, { method: "PATCH", body: JSON.stringify({ nodos, aristas: f.aristas, version: f.actualizado }) }).catch(() => null);
	const d = r ? await r.json().catch(() => ({})) : {};
	auto.guardando = false;
	if (r?.ok) {
		auto.flujo = d;
		auto.aviso = "";
	} else auto.aviso = d.error ?? "No se pudo guardar";
	// Otra persona del equipo la guardó en el medio: se trae su versión para no pisarla.
	if (r?.status === 409) await recargarFlujo(f.id);
	renderBody();
}

async function recargarFlujo(id) {
	const r = await api(`/ig/flujos/${id}`).catch(() => null);
	if (r?.ok && auto.abierta === id) auto.flujo = await r.json().catch(() => auto.flujo);
}
// Quién la tocó por última vez: con la base del equipo puede ser cualquiera.
const editadoTexto = e => (e?.por ? `editó ${e.por} · ${haceDm(e.at)}` : "");

// ---- Elegir dónde se dispara ----
function abrirPicker(base) {
	const d = base ?? auto.flujo?.disparo ?? null;
	auto.picker = { tipo: d?.tipo ?? "historia", mediaId: d?.mediaId ?? null, miniatura: d?.miniatura ?? null, palabras: (d?.palabras ?? []).join(", "), tambienDm: d?.tambienDm ?? true, seguir: d?.seguir ?? true, nombre: "", nueva: !base?.cambiar && !auto.abierta, error: "", enviando: false };
	// Cada vez que se abre se vuelven a traer: un reel subido recién tiene que aparecer.
	void cargarContenidoIg();
	auto.palabras = null;
	renderBody();
	buscarPalabras();
}

function pickerHtml() {
	const p = auto.picker;
	if (!p) return "";
	const tabs = [["historia", "Historia"], ["reel", "Reel o publicación"], ["dm", "Cualquier DM"], ["mencion", "Te mencionan en una historia"]];
	const todos = p.tipo === "historia" ? auto.contenido?.historias : p.tipo === "reel" ? auto.contenido?.reels : null;
	const q = normalizarP(p.busca ?? "");
	const items = todos && q ? todos.filter(i => normalizarP(i.texto ?? "").includes(q)) : todos;
	const cuantos = p.tipo === "reel" && todos ? (() => {
		const r = todos.filter(i => i.tipo !== "post").length;
		const po = todos.length - r;
		return `${r} reels${po ? ` y ${po} publicaciones` : ""}`;
	})() : "";
	const herramientas = p.tipo === "reel" && auto.contenido ? `<div class="pk-herr"><label class="pk-buscar">${ic("search")}<input id="pk-busca" type="search" placeholder="Buscar por lo que dice" value="${esc(p.busca ?? "")}" autocomplete="off"></label><label class="pk-buscar">${ic("arrow-up-right")}<input id="pk-link" placeholder="¿No está? Pegá el link del reel" value="${esc(p.link ?? "")}" autocomplete="off"></label><button class="b" data-pk-link ${p.buscandoLink ? "disabled" : ""}>${p.buscandoLink ? "Buscando…" : "Traer"}</button></div>${p.linkError ? `<span class="acont-error">${esc(p.linkError)}</span>` : ""}` : "";
	const grilla = items == null
		? ""
		: `<div class="pk-sub">${p.tipo === "historia" ? "Elegí la historia" : `Elegí el reel${cuantos ? ` · ${cuantos} de la cuenta` : ""}`}</div>${herramientas}<div class="pk-grilla ${p.tipo}">${p.tipo === "historia" ? `<button class="pk-item cualquiera ${p.mediaId ? "" : "on"}" data-pk-media="">Cualquier historia</button>` : ""}${!auto.contenido ? `<span class="pk-vacio">Cargando…</span>` : items.length ? items.map(i => `<button class="pk-item ${p.mediaId === i.id ? "on" : ""}" data-pk-media="${esc(i.id)}" data-pk-mini="${esc(i.miniatura ?? "")}" title="${esc(i.texto ?? "")}">${i.miniatura ? `<img src="${esc(i.miniatura.startsWith("/") ? scoped(i.miniatura) : i.miniatura)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : ""}<span>${i.tipo === "post" ? "Publicación · " : ""}${i.fecha ? esc(haceDm(i.fecha)) : ""}</span></button>`).join("") : `<span class="pk-vacio">${p.tipo === "historia" ? "No hay historias de los últimos 2 días." : q ? "Ningún reel dice eso." : "No se encontraron reels."}</span>`}</div>`;
	const palabras = p.tipo === "mencion" ? `<p class="ae-nota">Se dispara cuando alguien menciona la cuenta en su historia. No lleva palabra.</p>` : `<div class="pk-campo"><label for="pk-palabras">Palabra que tiene que ${p.tipo === "reel" ? "comentar" : "responder"}</label><input id="pk-palabras" value="${esc(p.palabras)}" placeholder="STORY" autocomplete="off"><small>Varias, separadas por coma. No importan mayúsculas, y entra también si la palabra está dentro de otra.</small><div class="pk-sugeridas" id="pk-sugeridas">${sugeridasHtml()}</div></div>`;
	const opciones = `<div class="pk-opciones">${p.tipo === "historia" ? `<label><input type="checkbox" id="pk-dm" ${p.tambienDm ? "checked" : ""}>También si la escribe por DM</label>` : ""}${p.tipo !== "reel" ? `<label><input type="checkbox" id="pk-seguir" ${p.seguir ? "checked" : ""}>Que nos tenga que seguir para recibirlo</label>` : `<span class="ae-nota">En un reel el primer mensaje sale pegado al comentario: el pedido de seguir va después, si se lo pedís al agente.</span>`}</div>`;
	return `<div class="pk-fondo" data-pk-fondo><div class="pk" role="dialog" aria-modal="true" aria-labelledby="pk-titulo">
		<div class="pk-cab"><h2 id="pk-titulo">${p.nueva ? "Nueva automatización" : "¿Dónde se dispara?"}</h2><button class="ic" data-pk-cerrar aria-label="Cerrar">${ic("x")}</button></div>
		${p.nueva ? `<label class="pk-campo pk-nombre">Nombre<input id="pk-nombre" value="${esc(p.nombre)}" placeholder="STORY → SOPs de historias" autocomplete="off"></label>
		<label class="pk-campo pk-nombre pk-prompt">Qué tiene que pasar<textarea id="pk-prompt" rows="3" placeholder="Cuando alguien responda mi historia con MARKETING, pasale la clase y preguntale a qué se dedica y cuánto factura. Si factura más de 2k, mandale mi link de agenda. Si no, la clase gratis. A los 3 días, seguimiento.">${esc(p.prompt ?? "")}</textarea><small>Opcional. Si lo escribís, el Setter arma los mensajes y los pasos; vos la revisás y la prendés.</small></label>` : ""}
		<div class="pk-tabs" role="tablist">${tabs.map(([id, n]) => `<button role="tab" aria-selected="${p.tipo === id}" class="${p.tipo === id ? "on" : ""}" data-pk-tipo="${id}">${n}</button>`).join("")}</div>
		<div class="pk-cuerpo">${grilla}<div class="pk-dos">${palabras}${opciones}</div>${p.error ? `<div class="dmaviso">${esc(p.error)}</div>` : ""}</div>
		<div class="pk-pie"><button class="b" data-pk-cerrar>Cancelar</button><button class="b p" data-pk-ok ${p.enviando ? "disabled" : ""}>${p.enviando ? "Guardando…" : p.nueva ? "Crear" : "Usar este disparo"}</button></div>
	</div></div>`;
}

// Las palabras sugeridas: lo que la gente escribió de verdad (con el corrector incluido) y los errores típicos del celular.
const normalizarP = t => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();
function palabrasDelPicker() {
	return (auto.picker?.palabras ?? "").split(",").map(x => x.trim()).filter(Boolean);
}
const yaEntra = (texto, palabras) => palabras.some(p => normalizarP(texto).replace(/ /g, "").includes(normalizarP(p).replace(/ /g, "")));
function sugeridasHtml() {
	const w = auto.palabras;
	const actuales = palabrasDelPicker();
	if (!actuales.length) return "";
	if (!w) return `<span class="pk-sug-nota">Buscando cómo la escriben…</span>`;
	const chip = (texto, veces) => {
		const entra = yaEntra(texto, actuales);
		return `<button class="pk-chip ${entra ? "entra" : ""}" ${entra ? "disabled" : `data-pk-sumar="${esc(texto)}"`} title="${entra ? "Ya entra con lo que pusiste" : "Sumarla"}">${esc(texto)}${veces ? `<small>×${veces}</small>` : ""}${entra ? ` ${ic("check")}` : " +"}</button>`;
	};
	const reales = w.escritas.length ? `<div class="pk-sug"><span>Cómo la escribieron de verdad</span>${w.escritas.map(e => chip(e.texto, e.veces)).join("")}</div>` : "";
	const errores = w.variantes.filter(v => !yaEntra(v, actuales)).slice(0, 8);
	const celu = errores.length ? `<div class="pk-sug"><span>Errores del celular y del corrector</span>${errores.map(v => chip(v)).join("")}</div>` : "";
	const otras = w.mas_escritas?.length && auto.picker?.tipo === "historia" ? `<div class="pk-sug"><span>Lo que más responden a tus historias</span>${w.mas_escritas.map(e => chip(e.texto, e.veces)).join("")}</div>` : "";
	return `${reales}${celu}${otras}${w.listo ? "" : `<span class="pk-sug-nota">Leyendo tus DMs para ver cómo la escriben…</span>`}`;
}
let pidePalabras = 0;
function buscarPalabras() {
	clearTimeout(pidePalabras);
	pidePalabras = setTimeout(async () => {
		const base = palabrasDelPicker().join(",");
		if (!base) return pintarSugeridas();
		const r = await api(`/ig/palabras?base=${encodeURIComponent(base)}`).catch(() => null);
		const d = r?.ok ? await r.json().catch(() => null) : null;
		if (!auto.picker || palabrasDelPicker().join(",") !== base) return;
		auto.palabras = d;
		pintarSugeridas();
		// La primera vez lee los DMs en el fondo: se vuelve a preguntar hasta que esté.
		if (d && !d.listo) setTimeout(buscarPalabras, 5000);
	}, 350);
}
function pintarSugeridas() {
	const caja = document.getElementById("pk-sugeridas");
	if (caja) caja.innerHTML = sugeridasHtml();
}

function leerPicker() {
	const p = auto.picker;
	const v = id => document.getElementById(id);
	if (v("pk-palabras")) p.palabras = v("pk-palabras").value;
	if (v("pk-nombre")) p.nombre = v("pk-nombre").value;
	if (v("pk-prompt")) p.prompt = v("pk-prompt").value;
	if (v("pk-dm")) p.tambienDm = v("pk-dm").checked;
	if (v("pk-seguir")) p.seguir = v("pk-seguir").checked;
}

async function confirmarPicker() {
	leerPicker();
	const p = auto.picker;
	const disparo = { tipo: p.tipo, mediaId: p.mediaId, miniatura: p.miniatura, palabras: p.palabras.split(",").map(x => x.trim()).filter(Boolean), tambienDm: p.tambienDm, seguir: p.seguir };
	p.enviando = true;
	p.error = "";
	renderBody();
	const nombre = p.nombre.trim() || (disparo.palabras[0] ? `${disparo.palabras[0]} · ${p.tipo === "historia" ? "historia" : p.tipo === "reel" ? "reel" : p.tipo === "dm" ? "DM" : "mención"}` : "Menciones en historias");
	const r = p.nueva
		? await api("/ig/flujos", { method: "POST", body: JSON.stringify({ nombre, disparo }) }).catch(() => null)
		: await api(`/ig/flujos/${auto.abierta}/disparo`, { method: "PUT", body: JSON.stringify({ disparo, version: auto.flujo?.actualizado }) }).catch(() => null);
	const d = r ? await r.json().catch(() => ({})) : {};
	p.enviando = false;
	if (!r?.ok) {
		p.error = d.error ?? "No se pudo guardar";
		if (r?.status === 409) await recargarFlujo(auto.abierta);
		return renderBody();
	}
	const prompt = p.nueva ? (p.prompt ?? "").trim() : "";
	auto.picker = null;
	auto.flujo = d;
	auto.abierta = d.id;
	auto.lista = null;
	renderBody();
	// Armada por prompt: el disparo ya quedó; los mensajes y los pasos los arma el Setter con lo que escribió el dueño.
	if (prompt) {
		auto.pedido = prompt;
		await pedirAlAgente();
	}
}

// ---- Pedirle el cambio al agente ----
async function pedirAlAgente() {
	const f = auto.flujo;
	const campo = document.getElementById("auto-pedido");
	const texto = (campo?.value ?? auto.pedido).trim();
	if (!f || (!texto && !auto.archivo)) return;
	const r = await api(`/ig/flujos/${f.id}/pedir`, { method: "POST", body: JSON.stringify({ texto, archivo: auto.archivo?.path, nombre: f.nombre }) }).catch(() => null);
	const d = r ? await r.json().catch(() => ({})) : {};
	if (!r?.ok) {
		auto.aviso = d.error ?? "No se pudo pedir";
		return renderBody();
	}
	auto.pedido = "";
	auto.archivo = null;
	auto.pidiendo = { agente: d.agente, nombre: d.nombre, desde: Date.now() };
	auto.aviso = "";
	renderBody();
	const caja = document.getElementById("auto-pedido");
	if (caja) caja.value = "";
}

async function subirSecuencia(file) {
	auto.subiendo = true;
	renderBody();
	const r = await api(`/attachments?name=${encodeURIComponent(file.name)}`, { method: "POST", body: file, headers: { "content-type": "application/octet-stream" } }).catch(() => null);
	const d = r ? await r.json().catch(() => ({})) : {};
	auto.subiendo = false;
	if (r?.ok) auto.archivo = { path: d.path, nombre: d.nombre || file.name };
	else auto.aviso = d.error ?? "No se pudo subir";
	renderBody();
}

// ---- Las dos pantallas ----
function autoHtml() {
	if (!state.instagram?.connected) return `<div class="empty"><b>Instagram no está conectado</b>Conectalo en Ajustes, Conexiones.</div>`;
	return `${auto.abierta ? editorFlujoHtml() : `<div class="dmsrep">${ventasModos("auto")}${listaFlujosHtml()}</div>`}${pickerHtml()}`;
}

function historiaNueva() {
	const ultima = auto.contenido?.historias?.[0];
	if (!ultima || Date.now() - Date.parse(ultima.fecha) > 24 * 3600_000) return null;
	if ((auto.lista ?? []).some(f => f.disparo?.mediaId === ultima.id)) return null;
	if (stored("historiaDescartada", "") === ultima.id) return null;
	return ultima;
}

function listaFlujosHtml() {
	const nueva = historiaNueva();
	const aviso = nueva ? `<div class="anueva">${nueva.miniatura ? `<img src="${esc(scoped(nueva.miniatura))}" alt="">` : `<span class="amini-v"></span>`}<span class="dmtx"><b>@${esc(state.instagram.username)} subió una historia</b><small>Hace ${esc(haceDm(nueva.fecha))} · todavía no tiene automatización</small></span><button class="b ghost" data-auto-descartar="${esc(nueva.id)}">Ahora no</button><button class="b p" data-auto-desde-historia="${esc(nueva.id)}">Armar la automatización</button></div>` : "";
	const filas = auto.lista == null
		? `<div class="dmvacio">Cargando…</div>`
		: auto.lista.length
			? auto.lista.map(f => {
					const [estado, cls] = ESTADO_AUTO[f.estado] ?? [f.estado, ""];
					const mini = f.disparo?.miniatura ? `<img class="amini" src="${esc(f.disparo.miniatura.startsWith("/") ? scoped(f.disparo.miniatura) : f.disparo.miniatura)}" alt="" referrerpolicy="no-referrer">` : `<span class="amini-v">${ic(f.disparo?.tipo === "dm" ? "inbox" : "instagram")}</span>`;
					return `<button class="afila" data-auto-abrir="${esc(f.id)}">${mini}<span class="dmtx"><b>${esc(f.nombre)}</b><small>${esc(disparoTexto(f.disparo, null))}${f.editado ? ` · ${esc(editadoTexto(f.editado))}` : ""}</small></span>${numerosFlujoHtml(f)}<span class="aestado ${cls}">${estado}</span></button>`;
				}).join("")
			: `<div class="dmvacio grande">${ic("route")}<b>Todavía no hay automatizaciones</b><span>Elegí una historia o un reel y la palabra que tienen que responder.</span></div>`;
	const cabNumeros = auto.lista?.length ? `<div class="afila acab-num"><span class="amini-hueco"></span><span class="dmtx"></span>${COLS_AUTO.map(([, n, ext]) => `<span class="anum${ext ? " ext" : ""}">${n}</span>`).join("")}<span class="aestado-hueco"></span></div>` : "";
	return `<div class="alista"><div class="alista-cab"><h1>Automatizaciones</h1><button class="b p" data-auto-nueva>+ Nueva</button></div>${auto.error ? `<div class="dmaviso">${esc(auto.error)}</div>` : ""}${aviso}<div class="afilas">${cabNumeros}${filas}</div></div>`;
}

// Como ManyChat: los números de cada automatización en su fila. Entraron sale de Zernio; lo demás, de los recorridos que guarda Leverage.
// Clics: personas que tocaron algún link (Leverage los cuenta; Zernio no). "—" si la automatización no manda links.
const COLS_AUTO = [["entraron", "Entraron", false], ["respondieron", "Respondieron", false], ["clics", "Clics", false], ["terminaron", "Terminaron", true], ["ultimos7", "Últimos 7 días", true]];
function numerosFlujoHtml(f) {
	const e = f.estadisticas;
	const entraron = f.corridas.empezaron;
	const fmt = n => n.toLocaleString("es-AR");
	const pc = n => (entraron ? ` <small>${Math.round((n / entraron) * 100)} %</small>` : "");
	const leyendo = !e || e.parcial ? ` title="Todavía leyendo los recorridos: los números pueden subir"` : "";
	// Cada celda: el número en negrita y, al lado, el porcentaje sobre los que entraron.
	const valores = {
		entraron: entraron ? [fmt(entraron), ""] : ["—", ""],
		respondieron: entraron && e?.respondieron != null ? [fmt(e.respondieron), pc(e.respondieron)] : ["—", ""],
		clics: entraron && e?.clics != null ? [fmt(e.clics), pc(e.clics)] : ["—", ""],
		terminaron: entraron ? [fmt(f.corridas.terminaron), pc(f.corridas.terminaron)] : ["—", ""],
		ultimos7: [!entraron ? "—" : e ? `+${fmt(e.ultimos7)}` : "…", ""],
	};
	return COLS_AUTO.map(([k, , ext], i) => `<span class="anum${ext ? " ext" : ""}"${i === 0 ? leyendo : ""}><b>${valores[k][0]}</b>${valores[k][1]}</span>`).join("");
}

function editorFlujoHtml() {
	const f = auto.flujo;
	if (!f) return `<div class="aed"><div class="dmvacio">${auto.aviso ? esc(auto.aviso) : "Cargando…"}</div></div>`;
	const [estado, cls] = ESTADO_AUTO[f.estado] ?? [f.estado, ""];
	const prendida = f.estado === "active";
	const mini = f.disparo?.miniatura ? `<img src="${esc(f.disparo.miniatura.startsWith("/") ? scoped(f.disparo.miniatura) : f.disparo.miniatura)}" alt="" referrerpolicy="no-referrer">` : "";
	const agente = auto.pidiendo && state.agents.find(a => a.id === auto.pidiendo.agente);
	const trabajando = auto.pidiendo ? `<div class="apidiendo"><span class="apunto"></span>${esc(auto.pidiendo.nombre)} está armando el flujo… <button class="lnk" data-auto-ver-agente="${esc(auto.pidiendo.agente)}">ver el chat</button></div>` : "";
	return `<div class="aed">
		<header class="aed-cab">
			<button class="ic" data-auto-volver aria-label="Volver a las automatizaciones">${ic("chevron-left")}</button>
			<span class="dmtx"><b>${esc(f.nombre)}</b><small>${estado}${f.corridas.empezaron ? ` · empezó con ${f.corridas.empezaron} ${f.corridas.empezaron === 1 ? "persona" : "personas"}` : prendida ? " · todavía nadie" : " · todavía no corrió"}${f.editado ? ` · ${esc(editadoTexto(f.editado))}` : ""}</small></span>
			<button class="adisp" data-auto-disparo>${mini ? `<span class="adisp-mini">${mini}</span>` : ""}<span>${esc(disparoTexto(f.disparo, f.nodos.find(n => n.type === "trigger")?.config))}</span></button>
			<span class="sp"></span>
			<button class="b ghost" data-auto-borrar>Borrar</button>
			<button class="b ${prendida ? "" : "p"}" data-auto-prender="${prendida ? "0" : "1"}" ${auto.guardando ? "disabled" : ""}>${prendida ? "Apagar" : "Prender"}</button>
		</header>
		<div class="apest" role="tablist">${[["flujo", "Flujo"], ["contactos", `Contactos${f.corridas.empezaron ? ` · ${f.corridas.empezaron}` : ""}`]].map(([id, n]) => `<button role="tab" aria-selected="${auto.pestana === id}" class="${auto.pestana === id ? "on" : ""}" data-auto-pestana="${id}">${n}</button>`).join("")}</div>
		${auto.aviso ? `<div class="dmaviso">${esc(auto.aviso)}</div>` : ""}
		${auto.pestana === "contactos" ? contactosHtml(f) : `<div class="aed-cuerpo">
			<section class="alienzo" aria-label="El flujo">
				${lienzoHtml(f)}
				${editorCajaHtml(f)}
				<div class="apedido">
					${trabajando}
					${auto.archivo ? `<span class="aadjunto">${ic("file-text")}${esc(auto.archivo.nombre)}<button class="ic" data-auto-quitar-archivo aria-label="Quitar">${ic("x")}</button></span>` : ""}
					<div class="apedido-caja">
						<label class="ic aadj" title="Subir la secuencia (PDF, Word o texto)">${auto.subiendo ? "…" : ic("upload")}<input type="file" id="auto-archivo" accept=".pdf,.doc,.docx,.txt,.md" hidden></label>
						<textarea id="auto-pedido" rows="1" placeholder="Pedile un cambio al flujo, o subí la secuencia…">${esc(auto.pedido)}</textarea>
						<button class="b p" data-auto-pedir>Pedir</button>
					</div>
				</div>
			</section>
			${celularHtml(f)}
		</div>`}
	</div>`;
}

// ---- Quién entró: cada persona con en qué paso va, y los números arriba ----
const ESTADO_CORRIDA = { running: "En curso", waiting: "Esperando", completed: "Terminó", exited: "Se cortó", failed: "Falló" };
async function cargarCorridas() {
	const id = auto.abierta;
	if (!id) return;
	const r = await api(`/ig/flujos/${id}/corridas`).catch(() => null);
	const d = r ? await r.json().catch(() => ({})) : {};
	if (auto.abierta !== id) return;
	auto.corridas = r?.ok ? d : { error: d.error ?? "No se pudo traer quién entró", corridas: [] };
	renderBody();
}

function contactosHtml(f) {
	const c = auto.corridas;
	if (!c) return `<div class="acont"><div class="dmvacio">Cargando…</div></div>`;
	if (c.error) return `<div class="acont"><div class="dmaviso">${esc(c.error)}</div></div>`;
	const cuenta = estado => c.corridas.filter(x => estado.includes(x.estado)).length;
	const tiles = [["Entraron", c.total], ["Esperando", cuenta(["waiting", "running"])], ["Terminaron", cuenta(["completed"])], ["Se cortaron", cuenta(["exited", "failed"])]];
	const filas = c.corridas.map(x => {
		const quien = x.nombre || x.usuario || "Usuario de Instagram";
		const espera = x.estado === "waiting" ? (x.esperando === "reply" ? "esperando que responda" : "esperando el tiempo") : ESTADO_CORRIDA[x.estado] ?? x.estado;
		return `<tr><td><span class="acont-quien">${x.foto ? `<img class="dmcara chica" src="${esc(x.foto)}" alt="" referrerpolicy="no-referrer" data-inicial="${esc(quien.charAt(0).toUpperCase())}">` : `<span class="dmcara letra chica">${esc(quien.charAt(0).toUpperCase())}</span>`}<span class="dmtx"><b>${esc(quien)}</b>${x.usuario ? `<small>@${esc(x.usuario.replace(/^@/, ""))}</small>` : ""}</span></span></td><td>${x.empezo ? esc(haceDm(x.empezo)) : ""}</td><td>${esc(x.paso ?? "")}</td><td><span class="acont-estado e-${esc(x.estado)}">${esc(espera)}</span>${x.error ? `<small class="acont-error" title="${esc(x.error)}">${esc(x.error.slice(0, 60))}</small>` : ""}</td><td>${x.conversacion ? `<button class="lnk" data-auto-chat="${esc(x.conversacion)}" data-nombre="${esc(quien)}" data-usuario="${esc(x.usuario ?? "")}">Ver chat</button>` : ""}</td></tr>`;
	}).join("");
	return `<div class="acont">
		<div class="acont-tiles">${tiles.map(([n, v]) => `<div class="cls-tile"><b>${v}</b><small>${n}</small></div>`).join("")}</div>
		<div class="acont-cab"><span>Cada persona queda en tus contactos con la etiqueta <b>${esc(f.disparo?.etiqueta ?? "")}</b>${c.contactos ? ` · ${c.contactos} con la etiqueta` : ""}</span>${c.corridas.length ? `<button class="b" data-auto-csv>Descargar CSV</button>` : ""}</div>
		${c.corridas.length ? `<div class="acont-tabla"><table><thead><tr><th>Persona</th><th>Entró</th><th>Va en</th><th>Estado</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>` : `<div class="dmvacio grande">${ic("users")}<b>Todavía no entró nadie</b><span>Cuando alguien responda la palabra con la automatización prendida, aparece acá.</span></div>`}
	</div>`;
}

function descargarCsv() {
	const c = auto.corridas?.corridas ?? [];
	const campo = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
	const lineas = [["nombre", "usuario", "entro", "va_en", "estado"].join(","), ...c.map(x => [x.nombre, x.usuario, x.empezo, x.paso, ESTADO_CORRIDA[x.estado] ?? x.estado].map(campo).join(","))];
	const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([lineas.join("\n")], { type: "text/csv;charset=utf-8" })), download: `${(auto.flujo?.nombre ?? "automatizacion").replace(/[^\w-]+/g, "-")}-contactos.csv` });
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

document.addEventListener("click", async e => {
	const t = e.target.closest("[data-auto-abrir],[data-auto-volver],[data-auto-nueva],[data-auto-caja],[data-auto-cerrar-caja],[data-auto-guardar-caja],[data-auto-disparo],[data-auto-prender],[data-auto-borrar],[data-auto-pedir],[data-auto-sim],[data-auto-quitar-archivo],[data-auto-ver-agente],[data-auto-desde-historia],[data-auto-descartar],[data-pk-tipo],[data-pk-media],[data-pk-cerrar],[data-pk-ok],[data-pk-fondo],[data-pk-sumar],[data-pk-link],[data-auto-pestana],[data-auto-csv],[data-auto-chat]");
	if (!t) return;
	const ds = t.dataset;
	if ("pkFondo" in ds) {
		if (e.target !== t) return;
		auto.picker = null;
		return renderBody();
	}
	if (ds.autoPestana) {
		auto.pestana = ds.autoPestana;
		renderBody();
		if (ds.autoPestana === "contactos") void cargarCorridas();
		return;
	}
	if ("autoCsv" in ds) return descargarCsv();
	if (ds.autoChat) {
		// Abre ese chat en la vista de DMs, aunque no esté entre los cargados.
		if (!dms.lista.some(x => x.id === ds.autoChat)) dms.resultados = [{ id: ds.autoChat, nombre: ds.nombre, usuario: ds.usuario || null, foto: null, sin_leer: 0 }, ...(dms.resultados ?? [])];
		dms.abierto = ds.autoChat;
		go({ type: "dms" });
		return void abrirChatDm(ds.autoChat);
	}
	if (ds.autoAbrir) {
		auto.pestana = "flujo";
		auto.corridas = null;
		return void abrirFlujo(ds.autoAbrir);
	}
	if ("autoVolver" in ds) {
		auto.abierta = null;
		auto.flujo = null;
		auto.elegida = null;
		auto.aviso = "";
		renderBody();
		return void cargarAutomatizaciones();
	}
	if ("autoNueva" in ds) return abrirPicker();
	if (ds.autoDesdeHistoria) {
		const h = auto.contenido?.historias?.find(x => x.id === ds.autoDesdeHistoria);
		abrirPicker();
		Object.assign(auto.picker, { tipo: "historia", mediaId: h?.id ?? null, miniatura: h?.miniatura ?? null });
		return renderBody();
	}
	if (ds.autoDescartar) {
		store("historiaDescartada", ds.autoDescartar);
		return renderBody();
	}
	if (ds.autoCaja) {
		auto.elegida = auto.elegida === ds.autoCaja ? null : ds.autoCaja;
		return renderBody();
	}
	if ("autoCerrarCaja" in ds) {
		auto.elegida = null;
		return renderBody();
	}
	if ("autoGuardarCaja" in ds) return void guardarCaja();
	if ("autoDisparo" in ds) return abrirPicker({ ...(auto.flujo?.disparo ?? {}), cambiar: true });
	if (ds.autoSim) {
		const [clave, valor] = ds.autoSim.split(":");
		auto[clave] = valor === "1";
		return renderBody();
	}
	if ("autoQuitarArchivo" in ds) {
		auto.archivo = null;
		return renderBody();
	}
	if (ds.autoVerAgente) return go({ type: "agent", id: ds.autoVerAgente });
	if ("autoPedir" in ds) return void pedirAlAgente();
	if (ds.autoPrender) {
		auto.guardando = true;
		renderBody();
		const r = await api(`/ig/flujos/${auto.flujo.id}/prender`, { method: "POST", body: JSON.stringify({ prender: ds.autoPrender === "1" }) }).catch(() => null);
		const d = r ? await r.json().catch(() => ({})) : {};
		auto.guardando = false;
		if (r?.ok) {
			auto.flujo = d;
			auto.aviso = "";
		} else auto.aviso = d.error ?? "No se pudo";
		return renderBody();
	}
	if ("autoBorrar" in ds) {
		if (!confirm(`¿Borrar «${auto.flujo.nombre}»? Deja de responder y no se puede deshacer.`)) return;
		const r = await api(`/ig/flujos/${auto.flujo.id}`, { method: "DELETE" }).catch(() => null);
		if (!r?.ok) {
			auto.aviso = "No se pudo borrar";
			return renderBody();
		}
		auto.abierta = null;
		auto.flujo = null;
		renderBody();
		return void cargarAutomatizaciones();
	}
	// El selector de dónde se dispara.
	if (ds.pkTipo) {
		leerPicker();
		Object.assign(auto.picker, { tipo: ds.pkTipo, mediaId: null, miniatura: null, error: "", busca: "", linkError: "" });
		return renderBody();
	}
	if ("pkMedia" in ds) {
		leerPicker();
		Object.assign(auto.picker, { mediaId: ds.pkMedia || null, miniatura: ds.pkMini || null });
		return renderBody();
	}
	if ("pkLink" in ds) {
		leerPicker();
		const p = auto.picker;
		p.link = document.getElementById("pk-link")?.value ?? p.link ?? "";
		p.buscandoLink = true;
		p.linkError = "";
		renderBody();
		const r = await api("/ig/contenido/link", { method: "POST", body: JSON.stringify({ url: p.link }) }).catch(() => null);
		const d = r ? await r.json().catch(() => ({})) : {};
		p.buscandoLink = false;
		if (!r?.ok) p.linkError = d.error ?? "No se pudo traer";
		else {
			if (auto.contenido && !auto.contenido.reels.some(x => x.id === d.id)) auto.contenido.reels.unshift(d);
			Object.assign(p, { mediaId: d.id, miniatura: d.miniatura, link: "", busca: "" });
		}
		return renderBody();
	}
	if (ds.pkSumar) {
		leerPicker();
		auto.picker.palabras = [...palabrasDelPicker(), ds.pkSumar].join(", ");
		const campo = document.getElementById("pk-palabras");
		if (campo) campo.value = auto.picker.palabras;
		pintarSugeridas();
		return;
	}
	if ("pkCerrar" in ds) {
		auto.picker = null;
		return renderBody();
	}
	if ("pkOk" in ds) return void confirmarPicker();
});
document.addEventListener("change", e => {
	if (e.target.id === "auto-archivo" && e.target.files?.[0]) void subirSecuencia(e.target.files[0]);
});
document.addEventListener("input", e => {
	if (e.target.id === "pk-busca" && auto.picker) {
		leerPicker();
		auto.picker.busca = e.target.value;
		return renderBody();
	}
	if (e.target.id === "pk-link" && auto.picker) auto.picker.link = e.target.value;
	if (e.target.id === "pk-palabras" && auto.picker) {
		auto.picker.palabras = e.target.value;
		pintarSugeridas();
		buscarPalabras();
	}
	if (e.target.id === "auto-pedido") {
		auto.pedido = e.target.value;
		e.target.style.height = "auto";
		e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
	}
});
// La caja de la Bandeja y la del Tablero: Enter manda, Shift+Enter baja de línea, y crecen hasta 6 líneas.
document.addEventListener("input", e => {
	if (e.target.id !== "bw-input" && e.target.id !== "tb-input") return;
	e.target.style.height = "auto";
	e.target.style.height = `${Math.min(e.target.scrollHeight, 154)}px`;
});
document.addEventListener("keydown", e => {
	if ((e.target.id === "bw-input" || e.target.id === "tb-input") && e.key === "Enter" && !e.shiftKey && !e.isComposing) {
		e.preventDefault();
		e.target.form?.requestSubmit();
		return;
	}
	if (e.target.id === "auto-pedido" && e.key === "Enter" && !e.shiftKey && !e.isComposing) {
		e.preventDefault();
		void pedirAlAgente();
	}
	if (e.key === "Escape" && auto.picker && view.type === "auto") {
		auto.picker = null;
		renderBody();
	}
});

