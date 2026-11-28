// ---------- La Bandeja como chats: uno por agente, con lo que te escribió, lo que le escribiste y lo que te pidió ----------
let bandejaChat = stored("bandejaChat", "");
let bwFiltro = "todos";
let bwBusca = "";
let bwAbierto = false;
let bwFoco = null;
/** Lo que se ve de cada chat: sus mensajes vienen del chat de trabajo del agente, sin los pasos. */
let bwHilo = { id: "", mensajes: [] };
/** Hasta cuándo la charla baja sola al final: un rato después de mandar, así se ve lo tuyo y lo que contesta. */
let bwBajarHasta = 0;
const bwEnviando = [];

async function cargarHiloBandeja() {
	const id = bandejaChat;
	if (!id || id === "ceo" || !state.agents.some(a => a.id === id)) return;
	const res = await api(`/agents/${id}/messages`);
	if (!res.ok || bandejaChat !== id) return;
	bwHilo = { id, mensajes: await res.json() };
	for (let i = bwEnviando.length - 1; i >= 0; i--) if (bwHilo.mensajes.some(m => m.role === "user" && m.text.startsWith(bwEnviando[i].text))) bwEnviando.splice(i, 1);
	if (view.type === "bandeja") renderBody();
}

/** Todo lo de un agente en orden: mensajes, pedidos, entregas, KPIs y reportes. */
function eventosDe(id) {
	const ev = [];
	if (bwHilo.id === id) {
		const corridas = runsOf(bwHilo.mensajes);
		const ultima = corridas.findLast(x => x.items);
		const trabajando = Boolean(state.agents.find(a => a.id === id)?.busy);
		for (const x of corridas) {
			if (x.role === "user") ev.push({ at: x.at, tipo: "yo", texto: x.text });
			else if (x.juan !== undefined || x.jeremy !== undefined) {
				// Lo que respondió Juan IA (o Jeremy) viaja pegado a tu mensaje: va justo después, con su nombre.
				const previo = ev.at(-1)?.at;
				if (previo) ev.push({ at: previo, tipo: "el", quien: x.juan !== undefined ? "Juan IA" : "Jeremy", texto: x.juan ?? x.jeremy });
			} else if (x.items) {
				const enCurso = trabajando && x === ultima;
				const cierre = enCurso ? null : x.items.filter(m => m.role === "assistant" && m.text?.trim()).at(-1);
				// Lo que hizo para llegar a la respuesta: en vivo mientras trabaja, plegado cuando termina.
				const pasos = groupSteps(x.items.flatMap(m => [...(m.text && m !== cierre ? [{ kind: "nota", text: sinMencion(m.text) }] : []), ...(m.steps ?? [])]));
				// Lo que está haciendo ahora va siempre al final del chat, aunque le hayas escrito algo nuevo mientras tanto.
				if (pasos.length) ev.push({ at: enCurso ? new Date().toISOString() : x.since, tipo: "pasos", run: x, pasos, enCurso, hasta: (cierre ?? x.items.at(-1))?.at });
				if (cierre) ev.push({ at: cierre.at ?? x.since, tipo: "el", texto: cierre.text });
			}
		}
	}
	for (const s of bwEnviando.filter(s => s.chat === id)) ev.push({ at: s.at, tipo: "yo", texto: s.text, enviando: true });
	for (const r of state.requests.filter(r => r.agentId === id)) ev.push({ at: r.at, tipo: "pedido", r });
	for (const k of state.kpis.filter(k => k.agentId === id)) ev.push({ at: k.at, tipo: "kpi", k });
	for (const p of state.ceo.filter(p => p.agentId === id)) ev.push({ at: p.at, tipo: "reporte", p });
	return ev.filter(e => e.at).sort((a, b) => a.at.localeCompare(b.at));
}

/** Cada chat de la lista: quién, lo último, cuándo y cuánto espera de vos. */
function chatsBandeja() {
	const unread = p => p.at > ceoReadAt;
	// El chat que estás mirando está leído; los demás, desde la última vez que lo abriste.
	const abierto = id => (view.type === "bandeja" && bandejaChat === id) || (view.type === "agent" && view.id === id) || (view.type === "ceo" && id === "ceo");
	const nuevo = (id, at) => !abierto(id) && (at ?? "") > leidoDe(id);
	const nombreDe = id => (id === "dueno" ? "Vos" : (state.agents.find(x => x.id === id)?.name ?? "otro agente"));
	const chats = state.agents
		.filter(a => a.role !== "juan")
		.map(a => {
			const suyos = [...pending().filter(r => r.agentId === a.id), ...proposed().filter(k => k.agentId === a.id)];
			const piden = suyos.length;
			const pidenNuevos = suyos.filter(x => nuevo(a.id, x.at)).length;
			const reportes = state.ceo.filter(p => p.agentId === a.id);
			const sinLeer = reportes.filter(p => unread(p) && nuevo(a.id, p.at)).length;
			// Lo último que le escribiste o que le pasó a otro agente: así la vista previa muestra la charla de hoy.
			const charla = (state.comms ?? []).filter(c => (c.from === "dueno" && c.to === a.id) || c.from === a.id).at(-1);
			const pedidos = state.requests.filter(r => r.agentId === a.id);
			const ultimo = [...pedidos.map(r => ({ at: r.at, txt: r.state === "pendiente" ? `Te necesito · ${actionOf(r)?.title ?? r.title}` : `${r.kind === "entrega" ? "Entrega" : "Pedido"} · ${actionOf(r)?.title ?? r.title}`, rojo: r.state === "pendiente" })), ...reportes.map(p => ({ at: p.at, txt: `${tagDe(p)} · ${p.story?.title ?? plain(p.text).slice(0, 80)}`, rojo: tagDe(p) === "Te necesito" && unread(p) })), ...(charla ? [{ at: charla.at, txt: charla.from === "dueno" ? `Vos: ${charla.text}` : `A ${nombreDe(charla.to)}: ${charla.text}` }] : [])]
				.filter(x => x.at)
				.sort((x, y) => y.at.localeCompare(x.at))[0];
			return { id: a.id, a, nombre: a.name, piden, pidenNuevos, sinLeer, ultimo, tieneEntregas: pedidos.some(r => r.kind === "entrega"), tieneReportes: reportes.length > 0 };
		})
		.filter(c => c.ultimo || c.id === bandejaChat || c.a.role === "asistente");
	const ceoUlt = state.ceo.at(-1);
	// Lo que llega al chat que tenés abierto queda leído.
	if (view.type === "bandeja" && bandejaChat && Date.now() - Date.parse(leidoDe(bandejaChat) || 0) > 5000) marcarChatLeido(bandejaChat);
	const ceo = { id: "ceo", nombre: "ceo", piden: 0, sinLeer: abierto("ceo") ? 0 : unreadCeo().length, ultimo: ceoUlt ? { at: ceoUlt.at, txt: `${ceoUlt.author}: ${ceoUlt.story?.title ?? plain(ceoUlt.text).slice(0, 80)}` } : null, tieneReportes: true };
	// Arriba de todo #ceo, después el Asistente, y el resto: los que te necesitan primero y después por lo último que mandaron.
	const asistente = chats.filter(c => c.a.role === "asistente");
	const resto = chats.filter(c => c.a.role !== "asistente").sort((x, y) => (y.piden > 0) - (x.piden > 0) || (y.ultimo?.at ?? "").localeCompare(x.ultimo?.at ?? ""));
	return [ceo, ...asistente, ...resto];
}

function horaChat(iso) {
	if (!iso) return "";
	const d = diaDe(iso);
	return d === "Hoy" ? hora(iso) : d === "Ayer" ? "Ayer" : new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

function bandejaChatsHtml() {
	const todos = chatsBandeja();
	if (!todos.length) return `<div class="empty"><b>Todo al día</b>Lo que tu equipo te entregue, te reporte o te pregunte va a aparecer acá, un chat por agente.</div>`;
	if (!todos.some(c => c.id === bandejaChat)) bandejaChat = todos[0].id;
	const piden = todos.filter(c => c.piden > 0).length;
	const filtrados = todos.filter(c => (bwFiltro === "todos" || (bwFiltro === "piden" && c.piden > 0) || (bwFiltro === "reportes" && c.tieneReportes) || (bwFiltro === "entregas" && c.tieneEntregas)) && (!bwBusca || `${c.nombre} ${c.ultimo?.txt ?? ""}`.toLowerCase().includes(bwBusca.toLowerCase())));
	const chip = (id, txt, rojo) => `<button class="bwchip ${bwFiltro === id ? "on" : ""} ${rojo ? "rojo" : ""}" data-bw-filtro="${id}">${txt}</button>`;
	const fila = c => {
		const cara = c.id === "ceo" ? `<span class="bwcara">${ic("hash")}</span>` : avatar(c.a, "bw");
		const n = (c.pidenNuevos ?? c.piden) + c.sinLeer;
		return `<button class="bwfila ${c.id === bandejaChat ? "on" : ""} ${c.piden ? "pide" : ""}" data-bw-chat="${esc(c.id)}">${cara}<span class="bwft"><span class="bwfl"><b>${esc(c.nombre)}</b><small class="${n ? "nuevo" : ""}">${horaChat(c.ultimo?.at)}</small></span><span class="bwfl"><span class="bwprev">${c.ultimo ? (c.ultimo.rojo ? `<b>${esc(c.ultimo.txt.split(" · ")[0])}</b> · ${esc(c.ultimo.txt.split(" · ").slice(1).join(" · "))}` : esc(c.ultimo.txt)) : "Sin novedades"}</span>${n ? `<i class="bwn">${n}</i>` : ""}</span></span></button>`;
	};
	const lista = `<aside class="bwlista" aria-label="Chats"><div class="bwcab"><div class="bwtit"><h1>Bandeja</h1><button class="b ghost" data-read-all>Marcar todo leído</button></div><label class="bwbusca">${ic("search")}<span class="tbvh">Buscar</span><input id="bw-busca" value="${esc(bwBusca)}" placeholder="Buscar un chat o un reporte" autocomplete="off"></label><div class="bwchips">${chip("todos", "Todos")}${chip("piden", `Te necesitan${piden ? ` · ${piden}` : ""}`, piden > 0)}${chip("reportes", "Reportes")}${chip("entregas", "Entregas")}</div></div><div class="bwfilas">${filtrados.map(fila).join("") || `<p class="bwvacio">Ningún chat con eso.</p>`}</div></aside>`;
	return `<div class="bw ${bwAbierto ? "abierto" : ""}">${lista}${hiloBandejaHtml(todos.find(c => c.id === bandejaChat))}</div>`;
}

function etiquetaPedido(r) {
	if (r.state === "pendiente") return r.kind === "entrega" ? ["Entrega", "Espera tu OK", true] : ["Te necesito", r.kind === "accion" ? "Quiere hacer esto" : "Pide tu OK", true];
	const estado = { aprobado: r.note === "Aprobado solo por el piloto automático" ? "Aprobado por el piloto automático" : "Aprobado", cambios: "Pediste cambios", rechazado: "Rechazado", respondido: "Respondido", reemplazado: "Reemplazado", descartado: "Descartado" }[r.state] ?? "";
	return [r.kind === "entrega" ? "Entrega" : "Pedido", estado, false];
}

/** Nombres de herramientas que a veces llegan crudos como paso. */
const PASO_CRUDO = { write: "Escribiendo un archivo", edit: "Editando un archivo", read: "Leyendo un archivo", bash: "Corriendo un comando", grep: "Buscando en los archivos", find: "Buscando archivos", ls: "Mirando una carpeta" };

/** Los pasos de un agente en la Bandeja: la lista en vivo mientras trabaja; plegados arriba de la respuesta después. */
function pasosBandejaHtml(e) {
	const fila = (s, i, n) => {
		const estado = e.enCurso && i === n - 1 ? "ya" : "ok";
		// plain() ya devuelve el texto escapado. Si el motor dejó el nombre crudo de la herramienta, se dice en castellano.
		const texto = s.kind === "nota" ? plain(s.text) : esc(PASO_CRUDO[String(s.text).trim().toLowerCase()] ?? s.text);
		return `<li class="${estado === "ya" ? "ahora" : ""} ${s.kind === "nota" ? "nota" : ""}"><span class="pic ${estado}"></span><span class="pt">${texto}</span>${s.count > 1 ? `<small>${s.count} veces</small>` : ""}</li>`;
	};
	const lista = `<ol class="bwtrace">${e.pasos.map((s, i) => fila(s, i, e.pasos.length)).join("")}</ol>`;
	// Mientras trabaja: solo lo que está haciendo ahora; lo anterior, plegado detrás de una flechita.
	if (e.enCurso) {
		const n = e.pasos.length;
		const antes = e.pasos.slice(0, -1);
		const previos = antes.length ? fold(`bwvivo:${e.run.id}`, `Ver ${antes.length === 1 ? "el paso anterior" : `los ${antes.length} pasos anteriores`}`, `<ol class="bwtrace">${antes.map((s, i) => fila(s, i, n)).join("")}</ol>`) : "";
		return `<div class="bwm el bwpasos"><div class="bwpcab"><b data-since="${esc(e.run.since)}">Trabajando</b></div><ol class="bwtrace">${fila(e.pasos.at(-1), n - 1, n)}</ol>${previos}</div>`;
	}
	const n = e.pasos.filter(s => s.kind !== "nota").reduce((t, s) => t + s.count, 0);
	return `<div class="bwpasos-hecho">${fold(`bwrun:${e.run.id}`, `Hizo ${n} ${n === 1 ? "paso" : "pasos"}${e.hasta ? ` en ${lasted(e.run.since, e.hasta)}` : ""}`, lista)}</div>`;
}

function hiloBandejaHtml(c) {
	if (!c) return `<main class="bwhilo-caja"></main>`;
	const esCeo = c.id === "ceo";
	const cab = `<header class="bwhcab"><button class="ic bwvolver" data-bw-volver aria-label="Volver a los chats">${ic("chevron-left")}</button>${esCeo ? `<span class="bwcara">${ic("hash")}</span>` : avatar(c.a, "bw")}<span class="bwhq"><b>${esc(esCeo ? "ceo" : c.nombre)}</b><small>${esCeo ? "Lo que te reportan los directores" : esc([nombre(c.a.department ?? ""), c.a.busy ? "trabajando…" : c.a.queued ? "en fila" : "disponible"].filter(Boolean).join(" · "))}</small></span>${esCeo ? "" : `<span class="bwhacc">${agInfoBotones()}<button class="b" data-agent="${esc(c.id)}">Ver su trabajo</button></span>`}</header>`;
	// En #ceo, lo que escribiste vos va como mensaje tuyo (a la derecha), no como un reporte.
	const eventos = esCeo ? [...state.ceo.map(p => (p.agentId === "dueno" ? { at: p.at, tipo: "yo", texto: p.text } : { at: p.at, tipo: "reporte", p, deQuien: true })), ...bwEnviando.filter(s => s.chat === "ceo").map(s => ({ at: s.at, tipo: "yo", texto: s.text, enviando: true }))] : eventosDe(c.id);
	let dia = "";
	const partes = [];
	for (const e of eventos) {
		const d = diaDe(e.at);
		if (d !== dia) partes.push(`<span class="bwdia">${esc(d[0].toUpperCase() + d.slice(1))}</span>`);
		dia = d;
		const h = `<time>${hora(e.at)}${e.tipo === "yo" ? (e.enviando ? " · enviando" : " ✓✓") : ""}</time>`;
		if (e.tipo === "yo") partes.push(`<div class="bwm yo">${md(e.texto)}${h}</div>`);
		// Como en el chat del agente: la ruta de un archivo no se muestra, se ve la tarjeta del archivo.
		else if (e.tipo === "el") partes.push(`<div class="bwm el">${e.quien ? `<b class="bwquien">${esc(e.quien)}</b>` : ""}${md(sinRutasSueltas(e.texto), { enlaces: true })}${archivosVisibles(e.texto).map(r => (RUTA_ANUNCIOS.test(r) ? galeriaHtml(r) : fileCard(r, state.requests?.findLast(q => q.file === r)?.title))).join("")}${h}</div>`);
		else if (e.tipo === "pasos") partes.push(pasosBandejaHtml(e));
		else if (e.tipo === "pedido") {
			const [tag, estado, rojo] = etiquetaPedido(e.r);
			partes.push(`<div class="bwm tarjeta ${rojo ? "pide" : ""} ${bwFoco === e.r.id ? "foco" : ""}" id="bw-${esc(e.r.id)}"><span class="bwtag"><i class="btag ${rojo ? "rojo" : ""}">${tag}</i><small>${esc(estado)}</small></span>${reqCard(e.r)}${h}</div>`);
		} else if (e.tipo === "kpi") partes.push(`<div class="bwm tarjeta ${e.k.state === "propuesta" ? "pide" : ""}"><span class="bwtag"><i class="btag ${e.k.state === "propuesta" ? "rojo" : ""}">KPI</i><small>${e.k.state === "propuesta" ? "Espera tu OK" : ""}</small></span>${kpiCard(e.k)}${h}</div>`);
		else {
			const p = e.p;
			const tag = tagDe(p);
			const rojo = ETIQUETAS_ROJAS.has(tag);
			partes.push(`<div class="bwm tarjeta reporte ${rojo && p.at > ceoReadAt ? "pide" : ""}"><span class="bwtag"><i class="btag ${rojo ? "rojo" : "azul"}">${esc(tag)}</i>${e.deQuien ? `<small>${esc(p.author)}</small>` : ""}</span>${p.story?.title ? `<b class="bwrt">${esc(p.story.title)}</b>` : ""}${p.story?.tag === "Te necesito" ? okCard(p) : `<div class="tx">${md(p.text)}</div>`}${h}</div>`);
		}
	}
	const hayPasosEnVivo = !esCeo && eventos.some(e => e.tipo === "pasos" && e.enCurso);
	const typing = !esCeo && c.a.busy && !hayPasosEnVivo ? `<div class="bwm el tecleo" aria-label="${esc(c.nombre)} está trabajando"><span class="typing"><i></i><i></i><i></i></span>${c.a.ahora ? `<span class="typing-paso">${esc(pasoLegible(c.a.ahora))}</span>` : ""}</div>` : "";
	const cargando = !esCeo && bwHilo.id !== c.id ? `<span class="bwdia">Cargando la charla…</span>` : "";
	const caja = `<form class="bwcaja" id="bw-form">${attached.length ? `<div class="bwadj" id="thumbs">${adjuntosHtml()}</div>` : ""}<button type="button" class="bwclip" data-bw-adjuntar aria-label="Adjuntar archivo">${ic("plus")}</button><input type="file" id="bw-archivo" multiple hidden><label class="bwcampo"><span class="tbvh">Mensaje</span><textarea id="bw-input" rows="1" autocomplete="off" placeholder="${esCeo ? "Escribí en #ceo…" : `Escribile a ${esc(c.nombre)}…`}"></textarea></label>${botonVoz("bw-input")}<button class="send" aria-label="Enviar">${ic("arrow-up")}</button></form>`;
	return `<main class="bwhilo-caja" aria-label="Chat con ${esc(c.nombre)}">${cab}<div class="bwhilo" data-chat="${esc(c.id)}">${cargando}${partes.join("") || `<span class="bwdia">Todavía no hay nada en este chat.</span>`}${typing}</div>${caja}</main>`;
}

/** En pantalla ancha la Bandeja va en dos paneles: la lista y, al lado, lo que abriste. */
let bandejaDos = false;
const cuerposBandeja = new Map();
let bandejaElegido = null;
function inboxRow(id, lead, title, when, preview, badge, body, elegible = false) {
	if (bandejaDos) {
		if (body) cuerposBandeja.set(id, body);
		const marca = elegible ? `<label class="icheck"><input type="checkbox" data-elegir="${id}" ${elegidos.has(id) ? "checked" : ""} aria-label="Elegir"></label>` : "";
		return `<div class="irow ${bandejaElegido === id ? "open" : ""}" data-fila="${id}">${marca}<button class="ibtn" data-item="${id}">${lead}<span class="it"><span class="il"><b>${title}</b><small>${when}</small>${badge ? `<i class="ibadge">${badge}</i>` : ""}</span><span class="ip">${preview}</span></span></button></div>`;
	}
	const open = isOpen(id);
	const marca = elegible ? `<label class="icheck"><input type="checkbox" data-elegir="${id}" ${elegidos.has(id) ? "checked" : ""} aria-label="Elegir"></label>` : "";
	return `<div class="irow ${open ? "open" : ""}">${marca}<button class="ibtn" data-item="${id}">${lead}<span class="it"><span class="il"><b>${title}</b><small>${when}</small>${badge ? `<i class="ibadge">${badge}</i>` : ""}</span><span class="ip">${preview}</span></span></button>${open && body ? `<div class="ibody">${body}</div>` : ""}</div>`;
}

const plain = s => esc(String(conNombreDelDueno(sinMarcas(s)) ?? "").replace(/[*`#|]/g, "").replace(/\s+/g, " ").trim().slice(0, 160));
function reqRow(r) {
	const action = actionOf(r);
	const lead = action?.app ? logo(action.app) : avatar({ id: r.agentId }, "in");
	return inboxRow(r.id, lead, esc(action?.title ?? r.title), ago(r.at), `${esc(r.author)}: ${plain(r.detail) || { ok: "pide tu OK", accion: "quiere hacer esto" }[r.kind] || "entrega"}`, r.state === "pendiente" && (r.at ?? "") > inboxReadAt ? 1 : 0, reqCard(r), r.state === "pendiente");
}
const kpiRow = k => inboxRow(k.id, `<span class="ihash">${ic("gauge")}</span>`, `Nuevo KPI: ${esc(k.name)}`, ago(k.at), `${esc(k.proposedBy)} · meta ${esc(k.target)}`, 1, kpiCard(k));

const ETIQUETAS_ROJAS = new Set(["Te necesito", "Problema", "Alerta"]);
/** "Te necesito" deja de pedir cuando el pedido ya se decidió: muestra lo que decidiste. */
function tagDe(p) {
	const tag = p.story?.tag ?? "Reporte";
	if (tag !== "Te necesito" || !p.story?.pedido) return tag;
	const r = state.requests.find(x => x.id === p.story.pedido);
	return !r || r.state === "pendiente" ? tag : ({ aprobado: "Aprobado", rechazado: "Rechazado", descartado: "Descartado", cambios: "Pediste cambios", reemplazado: "Reemplazado", respondido: "Respondido" })[r.state] ?? "Decidido";
}
/** Un reporte de un director: en la lista, su título; al abrirlo, el reporte entero y qué hacer con él. */
function reporteRow(p) {
	const tag = tagDe(p);
	const titulo = p.story?.title ?? plain(p.text).slice(0, 80);
	const etiqueta = `<span class="btag ${ETIQUETAS_ROJAS.has(tag) ? "rojo" : ""}">${esc(tag)}</span>`;
	const cuerpo = `<div class="card bteach"><div class="bthead">${avatar({ id: p.agentId })}<span><b>${esc(p.author)}</b><small>${diaDe(p.at).toLowerCase()} ${hora(p.at)} · reporte en #ceo</small></span></div>${etiqueta}<h2>${esc(titulo)}</h2>${p.story?.tag === "Te necesito" ? okCard(p) : `<div class="tx">${md(p.text)}</div>`}<div class="ca"><button class="b p" data-view="ceo">Responderle</button>${p.at > ceoReadAt ? `<button class="b ghost" data-ceo-leido>Marcar como leído</button>` : ""}</div></div>`;
	return inboxRow(`ceo-${p.id}`, avatar({ id: p.agentId }, "in"), esc(titulo), ago(p.at), `${etiqueta} ${esc(p.author)}`, p.at > ceoReadAt ? 1 : 0, cuerpo);
}

function ceoRow() {
	const unread = unreadCeo();
	if (!unread.length) return "";
	const last = unread.at(-1);
	return `<div class="irow"><button class="ibtn" data-view="ceo"><span class="ihash">${ic("hash")}</span><span class="it"><span class="il"><b>#ceo</b><small>${ago(last.at)}</small><i class="ibadge">${unread.length}</i></span><span class="ip">${esc(last.author)}: ${plain(last.text)}</span></span></button></div>`;
}

function bandejaHtml() {
	bandejaDos = matchMedia("(min-width:1000px)").matches;
	cuerposBandeja.clear();
	if (bandejaDos) {
		const enEspera = [...proposed(), ...pending()];
		const decididos = state.requests.filter(r => r.state !== "pendiente").slice(-10).reverse();
		const elegible = id => [...enEspera, ...decididos].some(x => x.id === id) || (id?.startsWith("ceo-") && state.ceo.some(p => `ceo-${p.id}` === id));
		bandejaElegido = openItem && elegible(openItem) ? openItem : !closedItems.has(autoOpen) && autoOpen ? autoOpen : enEspera.at(-1)?.id ?? decididos[0]?.id ?? null;
	}
	let lista = bandejaLista();
	if (bandejaDos && cuerposBandeja.size && !cuerposBandeja.has(bandejaElegido)) {
		bandejaElegido = openItem && cuerposBandeja.has(openItem) ? openItem : [...cuerposBandeja.keys()][0];
		cuerposBandeja.clear();
		lista = bandejaLista();
	}
	if (!bandejaDos || !lista.startsWith('<div class="inbox')) return lista;
	const detalle = bandejaElegido && cuerposBandeja.get(bandejaElegido);
	return `<div class="bdos">${lista}<div class="bdet">${detalle || `<div class="empty"><b>Elegí algo de la lista</b>Lo vas a ver acá, con todo lo que trae.</div>`}</div></div>`;
}

function bandejaLista() {
	const f = inboxFilter;
	const waiting = [...proposed(), ...pending()];
	autoOpen = waiting.length === 1 ? waiting[0].id : null;
	const fresh = x => (x.at ?? "") > inboxReadAt;
	const toDecide = f === "canales" ? [] : [...proposed().filter(fresh).map(kpiRow), ...pending().filter(fresh).map(reqRow)];
	const stillOpen = f === "canales" ? [] : [...proposed().filter(x => !fresh(x)).map(kpiRow), ...pending().filter(x => !fresh(x)).map(reqRow)];
	const posts = f === "aprobar" ? [] : state.ceo.filter(p => p.agentId !== "dueno" && p.agentId !== "sistema").slice(-12).reverse();
	const reportesNuevos = posts.filter(p => p.at > ceoReadAt).map(reporteRow);
	const reportesLeidos = posts.filter(p => p.at <= ceoReadAt).slice(0, f === "canales" ? 12 : 4).map(reporteRow);
	const channels = reportesNuevos.join("");
	const decided = f === "todo" ? state.requests.filter(r => r.state !== "pendiente").slice(-10).reverse().map(reqRow) : [];
	const unreadN = toDecide.length + reportesNuevos.length;
	if (!unreadN && !decided.length && !stillOpen.length && !reportesLeidos.length) return `<div class="empty"><b>Todo al día</b>Lo que tu equipo te entregue o te pregunte va a aparecer acá.</div>`;
	const group = (name, n, list) => (n ? `<h2 class="grouph">${name}<span>${n}</span></h2>${list}` : "");
	const abiertos = f === "canales" ? [] : pending();
	for (const id of elegidos) if (!abiertos.some(r => r.id === id)) elegidos.delete(id);
	const todos = abiertos.length > 0 && elegidos.size === abiertos.length;
	const barra = abiertos.length > 1 ? `<div class="ibar"><label><input type="checkbox" data-elegir-todo ${todos ? "checked" : ""}>Seleccionar todo</label><span class="sp"></span>${elegidos.size || aprobando ? `${aprobando ? "" : `<button class="b ghost" data-descartar-elegidos>Descartar ${elegidos.size}</button>`}<button class="b go" data-aprobar-elegidos ${aprobando ? "disabled" : ""}>${aprobando || `Aprobar ${elegidos.size}`}</button>` : ""}</div>` : "";
	return `<div class="inbox ${abiertos.length ? "conmarca" : ""}">${barra}${group("Sin leer", unreadN, channels + toDecide.join(""))}${group("Por decidir", stillOpen.length, stillOpen.join(""))}${group("Reportes leídos", reportesLeidos.length, reportesLeidos.join(""))}${group("Ya decidido", decided.length, decided.join(""))}</div>`;
}

const ONB_APPS = ["metaads", "googlecalendar", "calendly", "stripe", "gmail", "googledrive", "slack", "notion", "zoom"];
const ONB_CATS = [
	["canal", "Canales de YouTube", "Tus canales. Así el editor aprende cómo editás.", "youtube.com/@tucanal", "youtube"],
	["instagram", "Otras cuentas de Instagram", "Tus otras cuentas o las que querés imitar.", "instagram.com/cuenta", "instagram"],
	["marca", "Brandbook", "Logo, colores y tipografías. Subí el archivo o pegá el link.", "Link o archivo", "bookmark"],
	["landing", "Landings", "Links a tus páginas de venta.", "https://tupagina.com", "globe"],
	["caso", "Casos de clientes", "Resultados reales: capturas, tableros o documentos.", "Link o nombre del caso", "file-text"],
	["vsl", "VSL y videos de venta", "Los videos con los que vendés.", "Link del video", "video"],
	["video", "Video crudo y editado", "Un crudo y su versión final, para comparar.", "Link o carpeta", "folder-open"],
	["otro", "Otro material", "Brandbook, guías o lo que creas que sirve.", "Link o carpeta", "folder"],
];
const ONB_CATS_CLIENTE = [
	["instagram", "Perfil de Instagram", "Sus cuentas. De acá sale cómo habla y escribe.", "instagram.com/cuenta", "instagram"],
	["canal", "YouTube", "Sus canales. De acá sale cómo habla y cómo edita.", "youtube.com/@canal", "youtube"],
	["red", "TikTok y otras redes", "Lo que use además.", "tiktok.com/@cuenta", "globe"],
	["secuencia", "Destacadas e historias", "Sin sesión Instagram muestra solo 3 pantallas. Subí la grabación de pantalla o las capturas.", "Link o archivo", "video"],
	["marca", "Brandbook", "Logo, colores y tipografías. Subí el archivo o pegá el link.", "Link o archivo", "bookmark"],
	["landing", "Landings", "Links a sus páginas de venta.", "https://supagina.com", "globe"],
	["caso", "Casos de clientes", "Resultados reales: capturas, tableros o documentos.", "Link o nombre del caso", "file-text"],
	["vsl", "VSL y videos de venta", "Los videos con los que vende.", "Link del video", "video"],
	["video", "Video crudo y editado", "Un crudo y su versión final, para comparar.", "Link o carpeta", "folder-open"],
	["otro", "Otro material", "Brandbook, guías o lo que sirva.", "Link o carpeta", "folder"],
];

function shortName(m) {
	const t = m.title.replace(/^www\./, "").replace(/\/$/, "");
	return t.startsWith("/") ? t.split("/").slice(-2).join("/") : t;
}

const ONB_HINTS = {
	1: "Lo podés corregir cuando quieras.",
	2: "Si un día te quedás sin cupo, sumás otra cuenta desde Ajustes.",
	3: "Con esto armo tus guías: cómo hablás, cómo se ven tus landings y cómo editás. Mejor links públicos que archivos.",
	4: "Si falta una app, me la pedís por el chat y te paso el link.",
	5: "Armo el equipo y te aviso cuando esté trabajando.",
	6: "Si no sabés una tasa, dejá la que está. Se corrige cuando haya datos reales.",
};
const ONB_HINTS_CLIENTE = {
	1: "Lo podés corregir desde su carpeta.",
	3: "Con sus redes el equipo saca su voz para los guiones, la edición y las historias. Mejor links públicos que archivos.",
	4: "Si falta una app, la conectás después desde su carpeta.",
	5: "Elegí solo lo que compró: el equipo nace dormido y arranca cuando tiene trabajo.",
	6: "Si no sabés una tasa, dejá la que está. Se corrige cuando haya datos reales.",
};

function onbStep1(o) {
	const cliente = onbCliente();
	const owner = onbNuevo ? onbDraft : carpeta ? (state.carpeta?.dueno ?? {}) : (state.settings?.owner ?? {});
	const pick = (face, title) => `<button class="ochoice mini ${o.face === face ? "on" : ""}" data-onb-face="${face}"><b>${title}</b></button>`;
	// El paquete del equipo es solo de ATV: en la edición para clientes (la que pide licencia) no aparece.
	const equipoAtv = cliente || carpeta || state.licencia ? "" : `<details class="onb-paq" ${paqueteEstado ? "open" : ""}><summary><b>¿Sos del equipo de ATV?</b><span>Importá el paquete del equipo y arrancás con todo cargado, sin completar esto.</span></summary>${paqueteHtml()}</details>`;
	return `${equipoAtv}<h1>${cliente ? "Contanos del cliente" : "Contanos de tu negocio"}</h1><p class="osub">${cliente ? "Con esto su equipo arranca sabiendo para quién trabaja." : "Con esto tu Asistente arranca sabiendo quién sos."}</p>
	<div class="ogrid"><label>${cliente ? "Nombre" : "Tu nombre"}<input id="onb-name" value="${esc(owner.name)}" autocomplete="off" ${carpeta ? "readonly" : ""}></label><label>${cliente ? "Su empresa" : "Tu empresa"}<input id="onb-company" value="${esc(owner.company)}" autocomplete="off"></label></div>
	<div class="ofield"><span>${cliente ? "¿La cara de la marca es esta persona?" : "¿La cara de la marca sos vos?"}</span><div class="ogrid">${pick(true, "Sí")}${pick(false, "No")}</div></div>
	${onbNuevo ? `<label class="ofield">Su Instagram<input id="onb-ig" value="${esc(onbDraft?.ig ?? "")}" placeholder="instagram.com/su_cuenta" autocomplete="off"></label>` : ""}
	<label class="ofield">${cliente ? "¿Qué vende y a quién? Si no lo sabés, sale de su Instagram" : "¿Qué vendés y a quién?"}<textarea id="onb-pitch" rows="4" placeholder="Ayudamos a clínicas dentales a llenar su agenda de consultas...">${esc(o.pitch)}</textarea></label>
	<label class="ofield">${cliente ? "Su web" : "Tu web"}<input id="onb-web" value="${esc(o.web)}" placeholder="tuempresa.com" autocomplete="off"></label>${onbError ? `<div class="soft-note">${esc(onbError)}</div>` : ""}`;
}

const TASAS_OBJETIVO = [["cierre", "Cierre %", 40], ["show", "Show-up %", 80], ["agendamiento", "Agendamiento %", 10], ["clickChat", "Click a chat %", 20], ["ctr", "CTR %", 2], ["cpm", "CPM", 15]];

function objetivoForm(obj = {}) {
	const campo = (id, titulo, valor) => `<label>${titulo}<input data-obj="${id}" inputmode="decimal" value="${esc(valor ?? "")}" autocomplete="off"></label>`;
	return `<div class="ogrid">${campo("ticket", "Ticket de la oferta", obj.ticket)}${campo("meta", "Meta de cash por mes", obj.meta)}${campo("moneda", "Moneda", obj.moneda ?? "USD")}</div>
	<div class="ogrid otasas">${TASAS_OBJETIVO.map(([id, titulo, base]) => campo(id, titulo, obj[id] ?? base)).join("")}</div><div id="obj-cadena" class="ocadena"></div>`;
}

function objetivoCampos() {
	const o = {};
	for (const i of document.querySelectorAll("[data-obj]")) o[i.dataset.obj] = i.dataset.obj === "moneda" ? i.value.trim() : Number(i.value.replace(",", ".")) || 0;
	return o;
}

/** La cuenta la hace el servidor: es la misma que después leen los agentes. */
async function pintarCadena() {
	const box = document.getElementById("obj-cadena");
	if (!box) return;
	const o = objetivoCampos();
	const { cadena: c } = await (await api("/objetivo/cuenta", { method: "POST", body: JSON.stringify(o) })).json();
	if (!c) {
		box.innerHTML = `<span class="muted">Con el ticket y la meta sale la cuenta.</span>`;
		return;
	}
	const paso = (n, t) => `<div><b>${num(n)}</b><small>${t}</small></div>`;
	box.innerHTML = `<div class="opasos">${paso(c.cierres, "Cierres")}${paso(c.llamadas, "Llamadas")}${paso(c.agendas, "Agendas")}${paso(c.chats, "Chats")}${paso(c.clicks, "Clicks")}${paso(c.impresiones, "Impresiones")}</div><p>Gasto estimado: <b>${esc(o.moneda)} ${num(c.gasto)}</b> · Cash ROAS <b>${c.cashRoas} a 1</b></p>${c.grieta ? `<p class="ogrieta">Primera grieta: ${esc(c.grieta)}</p>` : ""}`;
}

function onbStep6(o) {
	const cliente = onbCliente();
	return `<h1>${cliente ? "¿A cuánto quiere llegar?" : "¿A cuánto querés llegar?"}</h1><p class="osub">De la meta sale todo el plan: cuántos cierres hacen falta y cuánto hay que gastar.</p>${objetivoForm(o.objetivo)}`;
}

function onbStep2() {
	const l = state.claudeLogin ?? { state: "idle" };
	const ok = state.login;
	const action = ok ? `<span class="state ok">Conectada</span>` : l.state === "waiting" ? `<button class="pillb" data-claude-cancel>Cancelar</button>` : `<button class="pillb" data-claude-add>Conectar</button>`;
	const note = l.state === "waiting" ? `Autorizá en el navegador que se abrió.${l.url ? ` <a href="${esc(l.url)}" target="_blank" rel="noreferrer">Abrirlo de nuevo</a>` : ""}` : l.state === "failed" ? esc(l.error) : ok ? "Tus agentes ya pueden trabajar." : "Se abre tu navegador para autorizar.";
	return `<h1>Conectá tu Claude</h1><p class="osub">Tus agentes trabajan con tu propia cuenta. Entrás una vez y listo.</p><div class="clist"><div class="crow"><span class="clogo">${CLAUDE_MARK}</span><span class="ct"><b>Cuenta de Claude</b><small>${note}</small></span>${action}</div></div>`;
}

/** El paso 3 de un cliente: con su Instagram alcanza. Lo demás va plegado, por si hay algo mejor que lo que sale del perfil. */
let onbMas = false;
/** La lectura rápida: al tocar Continuar se lee su perfil y se muestra antes del paso 4. */
let onbPerfil = { vista: false, lectura: null, reloj: null };
async function leerPerfilOnb(nueva) {
	const r = await api("/perfil/rapido", nueva ? { method: "POST", body: "{}" } : {}).catch(() => null);
	const d = r ? await r.json().catch(() => ({})) : {};
	onbPerfil.lectura = r?.ok ? d.lectura : { estado: "error", error: d.error ?? "No se pudo leer el perfil." };
	clearTimeout(onbPerfil.reloj);
	if (onbPerfil.vista && onbPerfil.lectura?.estado === "leyendo") onbPerfil.reloj = setTimeout(() => void leerPerfilOnb(false), 2500);
	if (view.type === "onboarding") {
		lastBody = "";
		renderBody();
	}
}
const TIPO_ENLACE = { youtube: "YouTube", agenda: "Agenda", pago: "Cobro", red: "Otra red", pagina: "Página" };
function lecturaOnbHtml() {
	const l = onbPerfil.lectura;
	if (!l || l.estado === "leyendo") {
		const pasos = ["Perfil y bio", "Links de la bio", "Destacadas", "Reels y sus vistas"];
		return `<h1>Leyendo su perfil</h1><p class="osub">Tarda uno o dos minutos. Si no querés esperar, seguí con el paso siguiente: lo vas a ver en su carpeta.</p><div class="oplee">${pasos.map(p => `<div><i class="tbgira" aria-hidden="true"></i>${p}</div>`).join("")}</div>`;
	}
	if (l.estado === "error") return `<h1>No pudimos leer su perfil</h1><p class="osub">${esc(l.error ?? "")}</p><div class="fa"><button class="b" data-onb-releer>Probar de nuevo</button><button class="b ghost" data-onb-volver-ig>Cambiar el link</button></div>`;
	const d = l.datos;
	const n = x => (x === null || x === undefined ? "—" : num(x));
	const bloque = (t, cuerpo) => (cuerpo ? `<section class="oplb"><b>${t}</b>${cuerpo}</section>` : "");
	const enlaces = d.enlaces.length ? `<div class="oplch">${d.enlaces.map(e => `<a class="oplchip" href="${esc(e.url)}" target="_blank" rel="noreferrer"><small>${TIPO_ENLACE[e.tipo] ?? "Link"}</small>${esc(e.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").slice(0, 48))}</a>`).join("")}</div><small class="opln">Quedaron en su Biblioteca.</small>` : `<p class="opln">No tiene links en la bio.</p>`;
	const reels = d.mejores.length ? `<ol class="oplr">${d.mejores.map(m => `<li><b>${m.vistas !== null ? `${n(m.vistas)} vistas` : `${n(m.likes)} likes`}</b><span>${m.fijado ? "Fijado · " : ""}${esc((m.titulo || "Sin texto").split("\n")[0].slice(0, 110))}</span></li>`).join("")}</ol>` : "";
	return `<h1>Esto encontramos en su perfil</h1><p class="osub">@${esc(d.cuenta)} · ${n(d.seguidores)} seguidores · ${d.piezas} piezas leídas</p><div class="opl">
	${bloque("Bio", d.bio ? `<p>${esc(d.bio)}</p>` : "")}
	${bloque("Links de la bio", enlaces)}
	${bloque("Destacadas", d.destacadas.length ? `<div class="oplch">${d.destacadas.map(x => `<span class="oplchip">${esc(x)}</span>`).join("")}</div>` : "")}
	${bloque("Sus reels con más vistas", reels)}
	</div><p class="opln fin">Cómo edita, cómo habla y cómo se ve lo saca el equipo cuando lo armes. Lo confirmás en su carpeta.</p>`;
}
function onbStep3Cliente() {
	if (onbPerfil.vista) return lecturaOnbHtml();
	const ig = state.instagram ?? {};
	const saved = extra.library?.material ?? [];
	const perfiles = saved.filter(m => m.kind === "instagram");
	const extras = saved.filter(m => m.kind !== "instagram" && ONB_CATS_CLIENTE.some(c => c[0] === m.kind));
	const limpio = m => shortName(m).replace(/\/?\?.*$/, "");
	const perfil = perfiles.length
		? `<div class="opcampo ok">${logo("instagram")}<span class="ct"><b>${esc(perfiles.map(limpio).join(" · "))}</b><small>Al tocar Continuar lo leemos</small></span>${perfiles.map(m => `<button class="ix" data-lib-del="${m.id}" aria-label="Sacar ${esc(shortName(m))}">${ic("x")}</button>`).join("")}</div>`
		: `<div class="opcampo">${logo("instagram")}<input id="onb-material" placeholder="instagram.com/su_cuenta" autocomplete="off" aria-label="Su Instagram" data-onb-ig><button class="pillb" data-onb-add-ig>Sumar</button></div>${onbError ? `<div class="soft-note">${esc(onbError)}</div>` : ""}<p class="opayuda">Tiene que ser público. Si es privado, sumá capturas en "Agregar más material".</p>`;
	const metricas = `<div class="crow">${logo("instagram")}<span class="ct"><b>Conectar su Instagram</b><small>${ig.connected ? `@${esc(ig.username)}` : "Con su usuario y contraseña: así entran sus DMs, sus historias y sus vistas a Ventas y Contenido"}</small>${!ig.connected && ig.problem ? `<small class="igprob">${esc(igProblema(ig.problem))}</small>` : ""}</span>${ig.connected ? `<span class="state ok">Conectado</span>` : ig.hasKey ? `<button class="pillb" data-onb-save-go="/connect/instagram">Conectar</button>` : ""}</div>`;
	const cats = ONB_CATS_CLIENTE.filter(c => c[0] !== "instagram").map(([kind, title, what, hint, mark]) => {
		const mine = saved.filter(m => m.kind === kind);
		const open = onbCat === kind;
		const lead = ["youtube", "instagram"].includes(mark) ? logo(mark) : `<span class="clogo">${ic(mark)}</span>`;
		const items = mine.map(m => `<div class="oitem"><span>${esc(shortName(m))}</span><button class="ix" data-lib-del="${m.id}" aria-label="Sacar ${esc(shortName(m))}">${ic("x")}</button></div>`).join("");
		const body = open ? `<div class="obody" id="onb-drop">${items}${onbError ? `<div class="soft-note">${esc(onbError)}</div>` : ""}<div class="oadd"><input id="onb-material" placeholder="${hint}" autocomplete="off" aria-label="Sumar a ${esc(title)}"><button class="pillb" data-onb-add>Sumar</button><label class="pillb">Subir<input type="file" multiple hidden data-onb-file></label></div></div>` : "";
		return `<div class="ocat ${open ? "open" : ""}"><button class="ohd" data-onb-cat="${kind}" aria-expanded="${open}">${lead}<span class="ct"><b>${title}</b><small>${esc(mine.length ? mine.map(shortName).join(" · ") : what)}</small></span>${mine.length ? `<span class="state ok">${mine.length}</span>` : ""}<span class="oplus">${ic(open ? "chevron-up" : "plus")}</span></button>${body}</div>`;
	}).join("");
	const abierto = onbMas || Boolean(onbCat) || extras.length > 0;
	return `<h1>Mostranos cómo trabaja</h1><p class="osub">Con su Instagram alcanza. De ahí sacamos cómo habla, cómo edita y cómo se ve, y te lo mostramos para que lo confirmes.</p>${perfil}
	<div class="clist opmet">${metricas}</div>
	<div class="opmas ${abierto ? "open" : ""}"><button class="opmash" data-onb-mas aria-expanded="${abierto}"><span><b>Agregar más material</b> <small>· opcional${extras.length ? ` · ${extras.length} sumado${extras.length === 1 ? "" : "s"}` : ""}</small></span>${ic(abierto ? "chevron-up" : "chevron-down")}</button>${abierto ? `<div class="clist">${cats}</div>` : ""}</div>`;
}

function onbStep3() {
	if (onbCliente()) return onbStep3Cliente();
	const ig = state.instagram ?? {};
	const saved = extra.library?.material ?? [];
	const igRow = `<div class="crow">${logo("instagram")}<span class="ct"><b>${onbCliente() ? "Métricas de Instagram" : "Instagram"}</b><small>${ig.connected ? `@${esc(ig.username)}` : ig.hasKey ? "Historias, reels y métricas" : "Se conecta con tu cuenta de Zernio, en Ajustes, Conexiones"}</small>${!ig.connected && ig.problem ? `<small class="igprob">${esc(igProblema(ig.problem))}</small>` : ""}</span>${ig.connected ? `<span class="state ok">Conectado</span>` : ig.hasKey ? `<button class="pillb" data-onb-save-go="/connect/instagram">Conectar</button>` : `<span class="state">Después, en Ajustes</span>`}</div>`;
	const cats = (onbCliente() ? ONB_CATS_CLIENTE : ONB_CATS).map(([kind, title, what, hint, mark]) => {
		const mine = saved.filter(m => m.kind === kind);
		const open = onbCat === kind;
		const lead = ["youtube", "instagram"].includes(mark) ? logo(mark) : `<span class="clogo">${ic(mark)}</span>`;
		const summary = mine.length ? mine.map(shortName).join(" · ") : what;
		const items = mine.map(m => `<div class="oitem"><span>${esc(shortName(m))}</span><button class="ix" data-lib-del="${m.id}" aria-label="Sacar ${esc(shortName(m))}">${ic("x")}</button></div>`).join("");
		const body = open ? `<div class="obody" id="onb-drop">${items}${onbError ? `<div class="soft-note">${esc(onbError)}</div>` : ""}<div class="oadd"><input id="onb-material" placeholder="${hint}" autocomplete="off" aria-label="Sumar a ${esc(title)}"><button class="pillb" data-onb-add>Sumar</button><label class="pillb">Subir<input type="file" multiple hidden data-onb-file></label></div></div>` : "";
		return `<div class="ocat ${open ? "open" : ""}"><button class="ohd" data-onb-cat="${kind}" aria-expanded="${open}">${lead}<span class="ct"><b>${title}</b><small>${esc(summary)}</small></span>${mine.length ? `<span class="state ok">${mine.length}</span>` : ""}<span class="oplus">${ic(open ? "chevron-up" : "plus")}</span></button>${body}</div>`;
	}).join("");
	return `<h1>Mostranos cómo trabajás</h1><p class="osub">Esto es lo que hace que tus piezas no salgan genéricas. Sumá lo que tengas.</p><div class="clist">${igRow}${cats}</div>`;
}

/** Los links reales: sin esto, un agente no tiene a dónde mandar a nadie. */
function enlacesOnb() {
	return `<div class="sform card onbl"><b>Links para agendar y cobrar</b><label>Link de agenda<input id="onb-agenda" placeholder="https://calendly.com/..." autocomplete="off"></label><label>Qué se cobra<input id="onb-cobro-nombre" placeholder="Mentoría" autocomplete="off"></label><label>Precio en USD<input id="onb-cobro-precio" inputmode="decimal" autocomplete="off"></label><label>Link de cobro<input id="onb-cobro-url" placeholder="https://..." autocomplete="off"></label><div class="fa"><button class="b" data-onb-enlaces>Guardar links</button></div></div>`;
}

function onbStep4() {
	const c = extra.connections;
	const have = new Set(c?.composio.accounts.map(a => a.app));
	const ready = Boolean(c?.composio.hasKey);
	const tiles = ONB_APPS.map(slug => {
		const [, name, note] = POPULAR.find(p => p[0] === slug) ?? [slug, nombre(slug), ""];
		const action = have.has(slug) ? `<span class="state ok">Conectada</span>` : ready ? `<button class="pillb" data-onb-save-go="/connect/app/${slug}">Conectar</button>` : `<span class="state">Pronto</span>`;
		return `<div class="ctile">${logo(slug)}<span class="ct"><b>${esc(name)}</b><small>${esc(note)}</small></span>${action}</div>`;
	}).join("");
	return `<h1>${onbCliente() ? "Conectá sus herramientas" : "Conectá tus herramientas"}</h1><p class="osub">${onbCliente() ? "Son sus cuentas, separadas de las tuyas. Para mandar o cobrar, siempre te piden el OK." : "Tus agentes leen solos. Para mandar o cobrar, siempre te piden el OK."}</p>${c && !ready ? `<div class="soft-note">Estas apps se activan cuando se cargue la clave de Composio. Podés seguir y hacerlo después.</div>` : ""}<div class="cgrid">${tiles}</div>${enlacesOnb()}<div class="onbl">${softwareHtml()}</div>`;
}

function onbStep5() {
	const list = extra.departments ?? [];
	const cliente = onbCliente();
	const elegida = slug => (cliente ? onbTeams.has(slug) : onbTeam === slug);
	const rows = list.map(d => `<button class="ochoice ${elegida(d.slug) ? "on" : ""}" data-onb-team="${esc(d.slug)}"><b>${esc(d.name)}</b><small>${esc(d.description)}</small></button>`).join("");
	return `<h1>${cliente ? "Elegí su equipo" : "Elegí tu primer equipo"}</h1><p class="osub">${cliente ? "Podés elegir más de uno. Lo demás se suma desde su carpeta." : "Después sumás los demás hablando con tu Asistente."}</p><div class="ofield">${rows}</div>${onbError ? `<div class="soft-note">${esc(onbError)}</div>` : ""}`;
}

