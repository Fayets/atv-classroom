function bibliotecaHtml() {
	const lib = extra.library;
	if (!lib) return `<div class="empty">Cargando…</div>`;
	const tabs = `<div class="lhead"><div class="seg"><button class="${libTab === "mine" ? "on" : ""}" data-lib-tab="mine">Tu material</button><button class="${libTab === "mercado" ? "on" : ""}" data-lib-tab="mercado">Mercado</button><button class="${libTab === "swipes" ? "on" : ""}" data-lib-tab="swipes">Swipes</button></div><span class="sp"></span><button class="b p" data-lib-form>Sumar material</button></div>${libForm ? formHtml() : ""}`;
	if (libTab === "swipes") return `<div class="lib">${tabs}${swipesHtml()}</div>`;
	if (libTab === "mercado") {
		const list = shelfList(["mercado"]);
		return `<div class="lib">${tabs}${list ? `<section class="shelf"><h3>Referencias</h3>${list}${guideHtml("mercado")}</section>` : `<div class="empty"><b>Todavía no hay nada del mercado</b>Lo que encuentres o le pases a tus agentes va a quedar acá, con su motivo.</div>`}</div>`;
	}
	const stories = lib.stories.length
		? `<div class="sgrid">${lib.stories.map(s => `<div class="scard"><img src="${scoped(`/media/historias/${s.id}.jpg`)}" alt="Historia del ${hora(s.fecha)}" loading="lazy"><div><b>${num(s.metricas.views)} vistas</b><small>${num(s.metricas.exits)} salidas · ${num(s.metricas.replies)} respuestas</small></div></div>`).join("")}</div>`
		: `<span class="muted">Conectá Instagram y tus historias entran solas.</span>`;
		const posts = lib.posts.length
		? `<div class="kt" style="margin:0;max-width:none"><table><thead><tr><th>Fecha</th><th>Pieza</th><th>Vistas</th><th>Guardados</th><th>Compartidos</th></tr></thead><tbody>${lib.posts.map(p => `<tr><td>${new Date(p.fecha).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}</td><td>${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noreferrer">${esc(p.texto.split("\n")[0].slice(0, 70) || "Sin texto")}</a>` : esc(p.texto.split("\n")[0].slice(0, 70))}</td><td>${num(p.metricas.views)}</td><td>${num(p.metricas.saves)}</td><td>${num(p.metricas.shares)}</td></tr>`).join("")}</tbody></table></div>`
		: `<span class="muted">Todavía no hay reels guardados.</span>`;
	const secuencias = lib.secuencias ?? [];
	const conHistorias = lib.stories.length + secuencias.length > 0;
	if (libCarpeta === "historias") {
		const lista = secuencias.map(q => `<div class="secu"><b>${esc(q.nombre)}</b><div class="secur">${q.pantallas.map(f => `<img src="/media/archivo?path=${encodeURIComponent(f)}" alt="Pantalla de ${esc(q.nombre)}" loading="lazy">`).join("")}</div></div>`).join("");
		return `<div class="lib">${tabs}<button class="fold-h" data-lib-carpeta="">${ic("chevron-left")} Tu material</button>
	<section><h3>Historias <small>${lib.stories.length} guardadas</small></h3>${stories}${guideHtml("historias")}</section>
	${lista ? `<section><h3>Secuencias de historias <small>${secuencias.length} guardadas</small></h3>${lista}</section>` : ""}</div>`;
	}
	if (libCarpeta === "reels") return `<div class="lib">${tabs}<button class="fold-h" data-lib-carpeta="">${ic("chevron-left")} Tu material</button>
	<section><h3>Reels y publicaciones <small>${lib.posts.length} en 90 días, ordenados por vistas</small></h3>${posts}${guideHtml("reels")}</section></div>`;
	const mejor = lib.posts[0];
	const carpetaReels = lib.posts.length
		? `<button class="libfolder" data-lib-carpeta="reels"><span class="doc">${ic("video")}</span><span class="ltext"><b>Reels y publicaciones</b><small>${lib.posts.length} en 90 días · el mejor, ${num(mejor.metricas?.views ?? mejor.vistas ?? 0)} vistas</small></span>${ic("chevron-right")}</button>`
		: `<section><h3>Reels y publicaciones</h3>${posts}</section>`;
	const fotos = lib.stories.slice(-3).map(s => `<img src="${scoped(`/media/historias/${s.id}.jpg`)}" alt="" loading="lazy">`).join("");
	const carpetaHistorias = conHistorias
		? `<button class="libfolder" data-lib-carpeta="historias"><span class="lfotos">${fotos}</span><span class="ltext"><b>Historias</b><small>${lib.stories.length} guardadas${secuencias.length ? ` · ${secuencias.length} ${secuencias.length === 1 ? "secuencia" : "secuencias"}` : ""}</small></span>${ic("chevron-right")}</button>`
		: `<section><h3>Historias</h3>${stories}</section>`;
	return `<div class="lib">${tabs}
	${carpetaHistorias}
	${carpetaReels}
	${lib.guides.some(g => g.topic === "voz") ? `<section><h3>Voz</h3>${guideHtml("voz")}</section>` : ""}
	<div class="shelves">${shelf("Brandbook", ["marca"], "marca", "Falta. Con su marca, las imágenes y piezas salen con sus colores.")}${shelf("Landings", ["landing"], "landings", "Falta. Sumá tus landings para que las nuevas salgan parecidas.")}${shelf("Miros", ["miro"], "miros", "Todavía no hay. Cada Miro que se crea queda acá como modelo.")}${shelf("Casos y VSL", ["caso", "vsl"], "casos", "Falta. Con casos reales, las piezas usan tus números.")}${(lib.material ?? []).some(m => ["otro", "instagram", "red"].includes(m.kind) || (m.kind === "secuencia" && !lib.secuencias?.some(q => q.id === m.id))) ? shelf("Otro material", ["otro", "instagram", "red", "secuencia"], "", "") : ""}${shelf("Video crudo y editado", ["video", "canal"], "video", "Falta. El editor aprende comparando un crudo con su versión final.")}</div></div>`;
}

/** Al lado de la biblioteca: lo que le corregiste a tu equipo, que es lo que ya no repite. */
function bibliotecaConDecisiones() {
	const corregido = state.requests.filter(r => (r.state === "cambios" || r.state === "rechazado") && r.note).reverse().slice(0, 6);
	const decididas = state.requests.filter(r => r.state !== "pendiente").length;
	const lista = corregido.length
		? corregido.map(r => `<div><b>${esc(r.note)}</b><small>${esc(r.author)} · ${ago(r.at)}</small></div>`).join("")
		: `<p class="muted">Lo que le corrijas a tu equipo desde la Bandeja va a quedar acá.</p>`;
	return `<div class="libdos">${bibliotecaHtml()}<aside class="libdec"><h2>Tus decisiones</h2><small>Lo que le corregiste a tu equipo</small><div class="tblista">${lista}</div>${decididas ? `<button class="tbmas" data-view="decisiones">Ver las ${decididas}</button>` : ""}</aside></div>`;
}

function swipesHtml() {
	const data = extra.swipes;
	if (!data) return `<div class="muted">Cargando…</div>`;
	const chip = (f, n) => `<button class="chipb ${swipeFilter.formato === f ? "on" : ""}" data-swipe-f="${esc(f)}">${esc(f || "Todos")}${n ? ` <small>${n}</small>` : ""}</button>`;
	const card = s => `<article class="swipe"><div class="dech"><span class="pill idle">${esc(s.formato)}</span>${s.origen === "tercero" ? `<span class="pill wait">Ajeno</span>` : ""}<small class="muted">${esc(s.angulo)}</small><span class="sp"></span>${s.resultado ? `<b>${esc(s.resultado)}</b>` : ""}</div><p>${esc(s.texto.slice(0, 280))}${s.texto.length > 280 ? "…" : ""}</p>${s.link ? `<a href="${esc(s.link)}" target="_blank" rel="noreferrer">Ver pieza</a>` : ""}</article>`;
	return `<div class="swfilters"><input id="swipe-q" placeholder="Buscar por tema" value="${esc(swipeFilter.texto)}" autocomplete="off"><div class="chips">${chip("", 0)}${Object.entries(data.formatos).sort((a, b) => b[1] - a[1]).map(([f, n]) => chip(f, n)).join("")}</div></div>
	${data.piezas.length ? `<div class="swipes">${data.piezas.map(card).join("")}</div>` : `<div class="empty"><b>No hay piezas con ese filtro</b>Probá con otra palabra.</div>`}`;
}

async function loadSwipes() {
	const res = await api(`/swipes?texto=${encodeURIComponent(swipeFilter.texto)}&formato=${encodeURIComponent(swipeFilter.formato)}`);
	if (res.ok) extra.swipes = await res.json();
	renderBody();
}

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

function rutinasHtml() {
	const list = extra.routines ?? [];
	const fixed = state.instagram?.connected ? [["Guardar las historias de Instagram<small class=\"rtq\"> · Leverage</small>", "Cada hora", state.instagram.lastSync]] : [];
	const rows = [...fixed.map(([n, w, l]) => `<tr><td>${n}</td><td>${w}</td><td>${l ? hora(l) : "—"}</td><td></td></tr>`), ...list.map(r => `<tr><td>${esc(rutinaNombre(r))}<small class="rtq"> · ${esc(rutinaQuien(r))}</small></td><td>${DIAS_CORTOS(r.dias)} a las ${r.hora}</td><td>${r.ultima ? new Date(r.ultima).toLocaleDateString("es-AR") : "—"}</td><td><button class="sw ${r.prendida ? "on" : ""}" role="switch" aria-checked="${r.prendida}" aria-label="${esc(rutinaNombre(r))}" data-rutina="${esc(r.departamento)}|${esc(r.id)}"><i></i></button></td></tr>`)];
	if (!rows.length) return `<div class="empty"><b>Todavía no hay rutinas</b>Aparecen cuando armás un departamento.</div>`;
	return `<div class="kt"><table><thead><tr><th>Rutina</th><th>Cuándo</th><th>Última vez</th><th>Prendida</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

document.addEventListener("click", async e => {
	const t = e.target.closest("[data-rutina]");
	if (!t) return;
	const [departamento, id] = t.dataset.rutina.split("|");
	t.disabled = true;
	const res = await api("/routines", { method: "POST", body: JSON.stringify({ departamento, id, prendida: t.getAttribute("aria-checked") !== "true" }) });
	if (res.ok) extra.routines = await res.json();
	renderBody();
});

const CLAUDE_MARK = `<svg viewBox="0 0 24 24" fill="none" stroke="#D97757" stroke-width="2.1" stroke-linecap="round" aria-hidden="true"><path d="M12 12L21.92 13.30"/><path d="M12 12L19.94 18.08"/><path d="M12 12L15.84 21.24"/><path d="M12 12L10.70 21.92"/><path d="M12 12L5.92 19.94"/><path d="M12 12L2.76 15.84"/><path d="M12 12L2.08 10.70"/><path d="M12 12L4.06 5.92"/><path d="M12 12L8.16 2.76"/><path d="M12 12L13.30 2.08"/><path d="M12 12L18.08 4.06"/><path d="M12 12L21.24 8.16"/></svg>`;

function resetsIn(at) {
	if (!at) return "";
	const min = Math.max(0, Math.round((at - Date.now()) / 60000));
	const d = Math.floor(min / 1440);
	const h = Math.floor((min % 1440) / 60);
	const left = d ? `${d} d ${h} h` : h ? `${h} h ${min % 60} min` : `${min} min`;
	const when = new Date(at).toLocaleString("es-AR", d ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } : { hour: "2-digit", minute: "2-digit" });
	return `Se renueva en ${left} · ${when}`;
}

const limitRow = l => `<div class="lim"><span>${esc(l.label)}</span><div class="bar"><i class="${l.used >= 90 ? "hot" : l.used >= 70 ? "warm" : ""}" style="width:${Math.min(100, l.used)}%"></i></div><b>${l.used}%</b><small>${resetsIn(l.resetsAt)}</small></div>`;

function usoHtml() {
	const u = extra.usage;
	if (!u) return `<div class="empty">Cargando…</div>`;
	const accounts = u.accounts ?? [];
	const stat = (label, n) => `<div class="stat"><small>${label}</small><b>${usd(n)}</b></div>`;
	return `<div class="uso"><section><h3 class="label">Esta Mac</h3><div class="who">Las cuentas que usan tus agentes y cuánto les queda.</div></section>
	<div class="accts">${accounts.map(a => `<div class="acct"><div class="ah"><span class="tile">${a.provider === "anthropic" ? CLAUDE_MARK : ic("user-round")}</span><span><b>${esc(a.email || a.provider)}</b><small>${a.provider === "anthropic" ? "Claude" : esc(a.provider)}</small></span></div>${a.limits.map(limitRow).join("")}</div>`).join("") || `<div class="muted">No pude leer los límites.</div>`}</div>
	<section><h3 class="label">Costo a precio de API</h3><div class="who">Con la suscripción de Claude no se paga aparte: sirve para comparar.</div></section>
	<div class="stats">${stat("Hoy", u.today)}${stat("7 días", u.week)}${stat("30 días", u.month)}</div>
	<div class="kt" style="margin:0;max-width:none"><table><thead><tr><th>Agente</th><th>Hoy</th><th>7 días</th><th>30 días</th></tr></thead><tbody>${u.rows.map(r => `<tr><td>${esc(r.agent)}</td><td>${usd(r.today)}</td><td>${usd(r.week)}</td><td>${usd(r.month)}</td></tr>`).join("")}</tbody></table></div></div>`;
}

function decisionesHtml() {
	const done = state.requests.filter(r => r.state !== "pendiente").reverse().map(reqCard);
	if (!done.length) return `<div class="empty"><b>Todavía no decidiste nada</b>Lo que apruebes o corrijas en la Bandeja queda guardado acá.</div>`;
	return `<div class="reqs">${done.join("")}</div>`;
}

function diaDe(iso) {
	const dia = d => new Date(d).toDateString();
	const ayer = Date.now() - 86_400_000;
	if (dia(iso) === dia(Date.now())) return "Hoy";
	if (dia(iso) === dia(ayer)) return "Ayer";
	return new Date(iso).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
}

/** Lo que pasó, dicho como lo diría alguien: quién, qué hizo y sobre qué. */
function eventoDe(r) {
	const tablero = /^Crear tablero en Miro: /.test(r.title);
	const verbo = tablero ? "armó un Miro" : r.kind === "entrega" ? "entregó" : "te pidió el OK";
	const estado = { pendiente: "Espera tu OK", aprobado: r.kind === "entrega" ? "Aprobada" : "Aprobado", cambios: "Pediste cambios", rechazado: "Rechazado", respondido: "Respondido" }[r.state] ?? "";
	return { at: r.at, id: r.agentId, who: r.author, verbo, sobre: (actionOf(r)?.title ?? r.title).replace(/^Crear tablero en Miro: /, ""), file: r.file, tipo: r.kind === "entrega" ? "entregas" : "aprobaciones", estado, rojo: r.state === "pendiente" || r.state === "rechazado" };
}

let histPeriodo = "hoy";
const histAbiertos = new Set();
/** El historial agrupado por quién lo hizo. Cada cosa una vez: el aviso de #ceo de una entrega o de un pedido de OK es el mismo pedido. */
function porPersonaHtml(periodo) {
	const hoy = new Date();
	hoy.setHours(0, 0, 0, 0);
	const desde = periodo === "semana" ? hoy.getTime() - 6 * 86_400_000 : periodo === "ayer" ? hoy.getTime() - 86_400_000 : hoy.getTime();
	const hasta = periodo === "ayer" ? hoy.getTime() : Number.POSITIVE_INFINITY;
	const en = at => at && Date.parse(at) >= desde && Date.parse(at) < hasta;
	const ESTADO = { pendiente: "Espera tu OK", aprobado: "Aprobado", cambios: "Pediste cambios", rechazado: "Rechazado", descartado: "Descartado", reemplazado: "Hay una versión nueva", respondido: "Respondido" };
	// El título corto que el agente le puso al pedido en #ceo; si no hay, la primera frase del pedido.
	const cortos = new Map(state.ceo.filter(p => p.story?.pedido && p.story.title).map(p => [p.story.pedido, p.story.title]));
	const corto = (r, t) => cortos.get(r.id) ?? (t.replace(/^¿?\s*(Aprobás|Te parece bien|Puedo|Querés) que (le |te )?/i, "").split(/(?<=[?.!])\s/)[0].replace(/[¿?]/g, "").replace(/^./, x => x.toUpperCase()));
	const cosas = [
		...state.requests.filter(r => en(r.at) && r.state !== "reemplazado").map(r => ({ at: r.at, id: r.agentId, que: r.kind === "entrega" ? "Entrega" : "Pide tu OK", largo: actionOf(r)?.title ?? r.title, texto: corto(r, (actionOf(r)?.title ?? r.title).replace(/^Crear tablero en Miro: /, "")), pide: r.state === "pendiente" ? r : null, file: r.file, estado: ESTADO[r.state] ?? "", clase: r.state === "aprobado" || r.state === "respondido" ? "ok" : r.state === "rechazado" || r.state === "descartado" ? "" : "rojo" })),
		...state.ceo.filter(p => en(p.at) && !["Entrega", "Te necesito"].includes(p.story?.tag ?? "")).map(p => ({ at: p.at, id: p.agentId, que: "Reporte en #ceo", texto: p.story?.title || String(p.text ?? "").split("\n")[0], estado: "", clase: "" })),
		...state.kpis.filter(k => en(k.at)).map(k => ({ at: k.at, id: k.agentId, que: "Propone un KPI", texto: k.name, estado: k.state === "propuesta" ? "Espera tu OK" : "", clase: "rojo" })),
	].filter(c => c.id);
	if (!cosas.length) return `<p class="tbvacio">${periodo === "hoy" ? "Hoy nadie hizo nada todavía." : "Nadie hizo nada en esos días."}</p>`;
	// Lo mismo varias veces (un pedido repetido, dos reportes iguales) va en una sola fila.
	const unidas = [];
	for (const c of cosas.sort((a, b) => b.at.localeCompare(a.at))) {
		const igual = unidas.find(u => u.id === c.id && u.texto === c.texto && u.que === c.que && Boolean(u.pide) === Boolean(c.pide));
		if (igual) igual.veces += 1;
		else unidas.push({ ...c, veces: 1 });
	}
	cosas.length = 0;
	cosas.push(...unidas);
	const gente = Map.groupBy ? Map.groupBy(cosas, c => c.id) : new Map(cosas.reduce((m, c) => m.set(c.id, [...(m.get(c.id) ?? []), c]), new Map()));
	const tarjetas = [...gente].map(([id, l]) => ({ id, l: l.sort((a, b) => Number(Boolean(b.pide)) - Number(Boolean(a.pide)) || b.at.localeCompare(a.at)), piden: l.filter(c => c.pide).length })).sort((a, b) => b.piden - a.piden || b.l.length - a.l.length);
	const cuando = at => (periodo === "semana" && diaDe(at) !== "Hoy" ? `${diaDe(at).replace(/,.*/, "")} ${hora(at)}` : hora(at));
	const fila = c => `<li><span class="pptx"><b title="${esc(c.largo ?? c.texto)}"><span>${esc(c.texto)}</span>${c.veces > 1 ? `<span class="ppx">${c.veces} veces</span>` : ""}</b><small>${c.que} · ${cuando(c.at)}</small></span><span class="ppder">${c.pide ? `<button class="b p" data-approve="${c.pide.id}">Aprobar</button><button class="b" data-ver-pedido="${c.pide.id}">Ver</button>` : `${c.file ? `<button class="pparch" data-file="${esc(c.file)}">Abrir</button>` : ""}${c.estado ? `<span class="btag ${c.clase}">${esc(c.estado)}</span>` : ""}`}</span></li>`;
	return `<div class="ppl">${tarjetas.map(({ id, l, piden }) => {
		const abierta = histAbiertos.has(id);
		const ver = abierta ? l : l.slice(0, 5);
		return `<article class="ppcard"><header>${avatar({ id })}<span><b>${esc(who(id))}</b><small>${l.length} ${l.length === 1 ? "cosa" : "cosas"}</small></span>${piden ? `<span class="btag rojo">${piden} ${piden === 1 ? "espera" : "esperan"} tu OK</span>` : `<span class="btag aldia">Nada pendiente</span>`}</header><ul>${ver.map(fila).join("")}</ul>${l.length > 5 ? `<button class="tbmas" data-hist-mas="${esc(id)}">${abierta ? "Ver menos" : `Ver las otras ${l.length - 5}`}</button>` : ""}</article>`;
	}).join("")}</div>`;
}

let histFiltro = "todo";
function actividadHtml(filtro = "todo") {
	const orden = [
		...state.ceo.map(p => ({ at: p.at, id: p.agentId, who: p.author, verbo: "reportó en #ceo", sobre: p.story?.title ?? "", tipo: "reportes", estado: p.story?.tag ?? "" })),
		...state.requests.map(eventoDe),
		...state.kpis.map(k => ({ at: k.at, id: k.agentId, who: k.proposedBy, verbo: "propuso un KPI", sobre: k.name, tipo: "aprobaciones", estado: k.state === "propuesta" ? "Espera tu OK" : "" })),
	]
		.filter(e => filtro === "todo" || e.tipo === filtro)
		.filter(e => e.at)
		.sort((a, b) => b.at.localeCompare(a.at))
		.slice(0, 120);
	if (!orden.length) return `<div class="empty"><b>Sin actividad todavía</b>Lo que hagan tus agentes va a quedar acá.</div>`;
	// Lo repetido seguido es una sola cosa: ocho intentos del mismo tablero no son ocho novedades.
	const juntos = [];
	for (const e of orden) {
		const ultimo = juntos.at(-1);
		if (ultimo && ultimo.who === e.who && ultimo.verbo === e.verbo && ultimo.sobre === e.sobre && diaDe(ultimo.at) === diaDe(e.at)) ultimo.veces += 1;
		else juntos.push({ ...e, veces: 1 });
	}
	const dias = Map.groupBy ? Map.groupBy(juntos, e => diaDe(e.at)) : new Map(juntos.reduce((m, e) => m.set(diaDe(e.at), [...(m.get(diaDe(e.at)) ?? []), e]), new Map()));
	const fila = e => {
		const texto = `<span class="evt"><b>${esc(e.who)}</b> ${esc(e.verbo)}${e.sobre ? `<small>${esc(e.sobre)}</small>` : ""}</span>${e.veces > 1 ? `<span class="evx">${e.veces} veces</span>` : ""}${e.estado ? `<span class="btag ${e.rojo ? "rojo" : ""}">${esc(e.estado)}</span>` : ""}<time>${hora(e.at)}</time>`;
		const cara = avatar({ id: e.id });
		return e.file ? `<button class="evento" data-file="${esc(e.file)}">${cara}${texto}</button>` : `<div class="evento">${cara}${texto}</div>`;
	};
	return `<div class="eventos">${[...dias].map(([dia, lista]) => `<section><h3>${esc(dia)}</h3>${lista.map(fila).join("")}</section>`).join("")}</div>`;
}

const changingKeys = new Set();
let mcpOpen = false;
let ownOpen = false;
let keyError = "";
let cpError = "";
let ownError = "";
let mcpError = "";
let connError = "";
let menuOpen = false;
let extra = {};
let pixelError = "";
let libTab = "mine";
let swipeFilter = { texto: "", formato: "" };
let skillBase = "";
const provError = {};
let libForm = false;
let libError = "";

const TITLES = {
	tablero: ["Tablero", "tu equipo, hoy", "layout-grid"],
	historial: ["Programado e historial", "lo que hace solo y lo que ya hizo", "clock"],
	juan: ["Juan", "tu IA de ATV", "activity"],
	contenido: ["Contenido", "qué es cada pieza y lo que trajo", "activity"],
	ajustes: ["Configuración", "de esta Mac", "settings"],
	biblioteca: ["Biblioteca", "el material de tu negocio", "book-open"],
	carpeta: ["Negocio", "embudos y leads", "folder-open"],
	tickets: ["Tickets", "el trabajo en curso de tu equipo", "ticket"],
	rutinas: ["Rutinas", "lo que tus agentes hacen solos", "clock"],
	uso: ["Uso", "los límites de cada cuenta que usan tus agentes", "gauge"],
	decisiones: ["Decisiones", "lo que ya resolviste", "scale"],
	actividad: ["Actividad", "lo que hizo tu equipo", "activity"],
	ceo: ["#ceo", "lo que te reportan tus captains", "hash"],
	bandeja: ["Bandeja", "lo que espera tu OK", "inbox"],
	roadmap: ["Roadmap", "un paso por vez", "route"],
	equipo: ["Equipo", "cómo está armada tu empresa", "users"],
	classroom: ["Classroom", "el piloto que contesta a tus clientes", "graduation-cap"],
	dms: ["DMs de Instagram", "", "instagram"],
	auto: ["Automatizaciones", "", "route"],
};
const TICKET_STATES = ["abierto", "en curso", "esperando", "hecho"];

function ticketsHtml() {
	const all = [...(state.tickets ?? [])].reverse();
	const form = `<div class="tnew"><input id="ticket-title" placeholder="Nuevo ticket" autocomplete="off" aria-label="Título del ticket"><select id="ticket-owner" aria-label="Responsable">${state.agents.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join("")}</select><button class="b go" data-ticket-add>Crear</button></div>`;
	const row = t => {
		const notes = t.notes.map(n => `<li><b>${esc(n.author)}</b> ${esc(n.text)}</li>`).join("");
		const body = `${t.detail ? `<div class="note">${esc(t.detail)}</div>` : ""}${notes ? `<ul>${notes}</ul>` : ""}<div class="seg tseg">${TICKET_STATES.map(s => `<button class="${s === t.state ? "on" : ""}" data-ticket="${t.id}" data-ticket-state="${s}">${nombre(s)}</button>`).join("")}</div>`;
		return `<div class="trow">${fold(`ticket:${t.id}`, `<span class="tid">${t.id}</span><span class="tt">${esc(t.title)}</span><span class="tw">${esc(who(t.owner))}</span><span class="pill ${t.state === "hecho" ? "idle" : ""}">${nombre(t.state)}</span>`, body)}</div>`;
	};
	return `<div class="tickets">${form}${all.length ? `<div class="clist">${all.map(row).join("")}</div>` : `<div class="empty"><b>Todavía no hay tickets</b>Aparecen cuando tu equipo o vos arman un trabajo con responsable.</div>`}</div>`;
}

const IN_APP = navigator.userAgent.includes("Electron");

