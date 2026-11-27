function onboardingHtml() {
	const o = onb ?? state.settings?.onboarding;
	if (!o) return "";
	const body = [onbStep1, onbStep2, onbStep3, onbStep4, onbStep5, onbStep6][o.step - 1](o);
	const last = o.step === 5;
	const assistant = state.agents.find(a => a.role === "asistente");
	const cliente = onbCliente();
	const paso = (cliente ? { 1: 1, 6: 2, 3: 3, 4: 4, 5: 5 } : { 1: 1, 6: 2, 2: 3, 3: 4, 4: 5, 5: 6 })[o.step];
	const total = cliente ? 5 : 6;
	return `<div class="onb"><div class="ohead"><span>${cliente ? "NUEVO CLIENTE · " : ""}PASO ${paso} DE ${total}</span><div class="bar"><i style="width:${(paso / total) * 100}%"></i></div></div>${body}
	<div class="ohint">${assistant && !cliente ? avatar(assistant) : ""}<span>${(cliente ? ONB_HINTS_CLIENTE : ONB_HINTS)[o.step]}</span></div>
	<div class="ofoot">${cliente && o.step === 1 ? `<button class="b ghost" data-onb-cancel>Cancelar</button>` : `<button class="b ghost ${o.step === 1 ? "hide" : ""}" data-onb-back>Atrás</button>`}<span class="sp"></span>${o.step === 3 || o.step === 4 || o.step === 6 || last ? `<button class="b ghost" data-onb-skip>${last ? "Empezar sin equipo" : "Después"}</button>` : ""}<button class="b go" data-onb-next ${onbBusy ? "disabled" : ""}>${onbBusy ? "Armando…" : last ? "Armar mi equipo" : "Continuar"}</button></div></div>`;
}

let onb = null;
let onbCat = null;
let onbTeam = "marketing";
let onbTeams = new Set(["marketing"]);
let onbNuevo = false;
let onbVolver = "";
let onbDraft = { name: "", company: "" };
let onbError = "";
let onbBusy = false;
let booted = false;

async function saveOnb(patch) {
	const res = await api("/onboarding", { method: "POST", body: JSON.stringify(patch) });
	if (res.ok) onb = await res.json();
	await loadState();
	lastBody = "";
	renderBody();
	void loadOnbData();
}

/** Lo del paso 1 se guarda antes de salir, también si el dueño se va a autorizar algo. */
function stepOneFields() {
	const value = id => document.getElementById(id)?.value;
	if (onb?.step === 6) return { objetivo: objetivoCampos() };
	return onb?.step === 1 ? { name: value("onb-name"), company: value("onb-company"), pitch: value("onb-pitch"), web: value("onb-web"), face: onb.face } : {};
}

async function loadOnbData() {
	// Antes de crear la carpeta no hay nada que traer: lo que se ve es lo de tu empresa.
	if (onbNuevo) {
		const d = await api("/departments");
		if (d.ok) extra.departments = await d.json();
		return;
	}
	const [lib, conn, deps] = await Promise.all([api("/library"), api("/connections"), api("/departments")]);
	if (lib.ok) extra.library = await lib.json();
	if (conn.ok) extra.connections = await conn.json();
	if (deps.ok) extra.departments = await deps.json();
	renderBody();
}

/** Se pueden pegar varios links o rutas juntos; un texto suelto entra entero. */
async function addMaterialFrom() {
	const input = document.getElementById("onb-material");
	const text = input?.value.trim();
	if (!text) return;
	const links = text.match(/(?:https?:\/\/|www\.)\S+|\/\S+|[\w-]+(?:\.[\w-]+)+(?:\/\S*)?/gi) ?? [];
	const joined = links.join("").length >= text.replace(/[\s,]/g, "").length - 2;
	const items = links.length && joined ? links : [text];
	// Una frase en lugar del link deja a todo el equipo sin poder leer la cuenta: se frena acá.
	const esLink = t => /^(https?:\/\/|www\.)\S+$|^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t);
	if (["instagram", "canal", "red"].includes(onbCat) && !items.every(esLink)) {
		onbError = "Pegá el link del perfil, por ejemplo instagram.com/cuenta.";
		lastBody = "";
		renderBody();
		return;
	}
	onbError = "";
	for (const raw of items) {
		const item = raw.replace(/,$/, "");
		await api("/library/items", { method: "POST", body: JSON.stringify({ kind: onbCat, title: item.replace(/^https?:\/\//, ""), url: item }) });
	}
	input.value = "";
	await loadOnbData();
	document.getElementById("onb-material")?.focus();
}

async function uploadMaterial(files) {
	for (const file of files) await fetch(scoped(`/library/upload?kind=${onbCat}&name=${encodeURIComponent(file.name)}`), { method: "POST", headers: { authorization: `Bearer ${TOKEN}` }, body: file });
	await loadOnbData();
}

async function finishOnb(team) {
	onbBusy = true;
	onbError = "";
	renderBody();
	if (team) {
		const d = extra.departments?.find(x => x.slug === team);
		const res = await api("/departments", { method: "POST", body: JSON.stringify({ slug: team, name: d?.name ?? team }) });
		if (!res.ok) {
			onbBusy = false;
			onbError = "No se pudo armar el equipo. Probá de nuevo.";
			renderBody();
			return;
		}
	}
	await api("/onboarding", { method: "POST", body: JSON.stringify({ done: true }) });
	onbBusy = false;
	document.querySelector(".app").classList.remove("onboarding");
	await loadState();
	const assistant = state.agents.find(a => a.role === "asistente");
	go(assistant ? { type: "agent", id: assistant.id } : { type: "equipo" });
}

let agentEdit = null;
let agentError = "";
let removing = false;
/** El jefe de cada agente, con la misma regla que el servidor. */
function bossId(a) {
	if (a.role === "asistente") return null;
	if (a.managerId && state.agents.some(x => x.id === a.managerId)) return a.managerId;
	const captain = a.role === "captain" || !a.department ? null : state.agents.find(x => x.role === "captain" && x.department === a.department);
	return captain?.id ?? state.agents.find(x => x.role === "asistente")?.id ?? null;
}

function carpetaSelector() {
	const clientes = state.clientes ?? [];
	const actual = state.carpeta?.nombre ?? "Principal";
	const opcion = (id, nombre, n) => `<button class="carpo ${carpeta === id ? "on" : ""}" data-carp="${esc(id)}"><span class="cini">${esc(initials(nombre))}</span><b>${esc(nombre)}</b>${n ? `<span class="badge">${n}</span>` : ""}</button>`;
	const otros = clientes.filter(c => c.id !== carpeta).reduce((t, c) => t + c.pendientes, 0) + (carpeta ? (state.pendientesPrincipal ?? 0) : 0);
	return `<div class="carps"><button class="carp" data-carp-open aria-expanded="${carpetasOpen}"><span class="cini">${esc(initials(actual))}</span><span class="ct"><b>${esc(actual)}</b><small>${carpeta ? "Cliente" : "Tu empresa"}</small></span>${otros ? `<span class="badge">${otros}</span>` : ""}${ic(carpetasOpen ? "chevron-up" : "chevron-down")}</button>
	${carpetasOpen ? `<div class="carpm">${opcion("", state.settings?.owner?.company || "Tu empresa", state.pendientesPrincipal)}${clientes.map(c => opcion(c.id, c.nombre, c.pendientes)).join("")}<button class="carpo" data-cli-new><span class="cini">${ic("plus")}</span><b>Nuevo cliente</b></button></div>` : ""}</div>`;
}

async function abrirCarpeta(id) {
	carpeta = id;
	store("carpeta", id);
	carpetasOpen = false;
	// Nada de lo que estaba abierto sigue en pantalla: cada carpeta arranca limpia.
	extra = {};
	Object.assign(ctn, { datos: null, error: "", abierto: null, editando: false, aviso: "", pidio: "", dolor: "" });
	Object.assign(ctos, { datos: null, error: "", abierto: null, pieza: null, paso: "todos" });
	tabs = [];
	store("tabs", tabs);
	messages = [];
	painted.body = null;
	await loadState();
	if (id && state.carpeta?.onboarding && !state.carpeta.onboarding.done) return entrarOnbCliente(state.carpeta.onboarding);
	go(state.agents.some(a => a.role === "juan") ? { type: "juan" } : state.agents.some(a => a.role === "asistente") ? { type: "agent", id: state.agents.find(a => a.role === "asistente").id } : { type: "carpeta" });
}

/** El mismo onboarding, para un cliente: el paso de Claude no va porque la cuenta es la tuya. */
const onbCliente = () => Boolean(carpeta) || onbNuevo;
// El objetivo es el paso 6 por orden de llegada, pero va después del negocio. El cliente no pasa por Claude.
const pasoSiguiente = paso => (paso === 1 ? 6 : paso === 6 ? (onbCliente() ? 3 : 2) : paso + 1);
const pasoAnterior = paso => (paso === 6 ? 1 : paso === (onbCliente() ? 3 : 2) ? 6 : paso - 1);

function entrarOnbCliente(datos) {
	onb = datos;
	onbError = "";
	onbCat = null;
	document.querySelector(".app").classList.add("onboarding");
	view = { type: "onboarding" };
	lastBody = "";
	renderShell();
	void loadOnbData();
}

function nuevoCliente() {
	onbVolver = carpeta;
	onbNuevo = true;
	onbDraft = { name: "", company: "" };
	carpetasOpen = false;
	entrarOnbCliente({ done: false, step: 1, face: true, pitch: "", web: "" });
}

/** Lo escrito en el paso 1 antes de que exista la carpeta. */
function guardarBorrador() {
	const f = stepOneFields();
	onbDraft = { name: f.name ?? "", company: f.company ?? "", ig: document.getElementById("onb-ig")?.value.trim() ?? "" };
	onb = { ...onb, pitch: f.pitch ?? "", web: f.web ?? "" };
}

async function crearDesdeOnb() {
	guardarBorrador();
	if (onbDraft.ig && !/instagram\.com\/\S+/.test(onbDraft.ig)) {
		onbError = "Pegá el link de su Instagram, por ejemplo instagram.com/su_cuenta.";
		lastBody = "";
		renderBody();
		return;
	}
	const res = await api("/clientes", { method: "POST", body: JSON.stringify({ nombre: onbDraft.name, empresa: onbDraft.company, vende: onb.pitch, web: onb.web, hablaLaMarca: onb.face }) });
	const body = await res.json().catch(() => ({}));
	if (!res.ok) {
		onbError = body.error ?? "No se pudo crear";
		lastBody = "";
		renderBody();
		return;
	}
	onbNuevo = false;
	carpeta = body.id;
	store("carpeta", body.id);
	if (onbDraft.ig) await api(`/clientes/${body.id}/redes`, { method: "POST", body: JSON.stringify({ redes: onbDraft.ig }) });
	tabs = [];
	store("tabs", tabs);
	await loadState();
	entrarOnbCliente(state.carpeta.onboarding);
}

function cancelarOnbCliente() {
	onbNuevo = false;
	document.querySelector(".app").classList.remove("onboarding");
	lastBody = "";
	renderShell();
	void abrirCarpeta(onbVolver);
}

async function terminarOnbCliente(areas) {
	onbBusy = true;
	onbError = "";
	renderBody();
	for (const area of areas) {
		const res = await api(`/clientes/${carpeta}/equipo`, { method: "POST", body: JSON.stringify({ area }) });
		if (!res.ok) {
			onbBusy = false;
			onbError = "No se pudo armar el equipo. Probá de nuevo.";
			lastBody = "";
			renderBody();
			return;
		}
	}
	await api(`/clientes/${carpeta}/listo`, { method: "POST", body: "{}" });
	onbBusy = false;
	document.querySelector(".app").classList.remove("onboarding");
	await loadState();
	lastBody = "";
	renderShell();
	go({ type: "carpeta" });
}

function carpetaHtml() {
	const e = extra.embudos;
	if (!e) return `<div class="muted">Cargando…</div>`;
	const n = e.negocio;
	const nombreDe = id => state.agents.find(a => a.id === id)?.name ?? "—";
	const areas = [...new Set(state.agents.map(a => a.department).filter(Boolean))];
	const faltan = (extra.areas ?? []).filter(d => !areas.includes(d.slug));
	const tabla = (cab, filas) => `<div class="kt" style="margin:0;max-width:none"><table><thead><tr>${cab.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>${filas.join("")}</tbody></table></div>`;
	const TIPOS = { formulario: "Formulario", pagina: "Página", gancho: "Avisos" };
	const publicados = e.publicados.map(p => `<tr><td>${TIPOS[p.tipo]}</td><td>${esc(p.nombre)}</td><td>${p.tipo === "gancho" ? `<span class="muted">Privada</span>` : `<a href="${esc(p.link)}" target="_blank" rel="noreferrer">Abrir</a>`}</td></tr>`);
	const flujos = e.workflows.map(w => `<tr><td>${esc(w.nombre)}</td><td>${esc(nombreDe(w.agente))}</td><td>${w.corridas}</td><td><button class="lnk" data-wf-toggle="${esc(w.id)}" data-on="${w.activo ? 1 : ""}">${w.activo ? "Pausar" : "Activar"}</button> <button class="lnk" data-wf-del="${esc(w.id)}">Sacar</button></td></tr>`);
	if (crmAbierto && e.crm) return crmHtml(e.crm);
	// El link que pega el navegador trae cosas de más (?hl=es-la): se muestra limpio.
	const web = /instagram\.com/i.test(n.web ?? "") ? String(n.web).replace(/\?.*$/, "") : n.web;
	const filas = Math.min(8, Math.max(3, String(n.pitch ?? "").split("\n").length + 1));
	const negocio = carpeta
		? `<div class="sform card negf"><label>Qué vende y a quién<textarea id="neg-vende" rows="${filas}">${esc(n.pitch)}</textarea></label><label>Web<input id="neg-web" value="${esc(web)}" autocomplete="off" placeholder="https://supagina.com"></label><div class="fa"><button class="b p" data-neg-save>Guardar</button><button class="b ghost" data-view="biblioteca">Biblioteca</button><button class="b ghost" data-section="conexiones">Conexiones</button></div></div>`
		: `<div class="muted">${esc(n.pitch || "Se edita en Configuración.")}</div>`;
	return `<div class="lib carpv">${carpeta ? perfilLeidoHtml() : ""}<section><h3>Negocio</h3>${negocio}</section>
	${carpeta ? `<section><h3>Su voz${e.voz ? ` <small>${e.voz} reglas</small>` : ""}</h3><div class="sform card negf"><p class="vozde">Sale sola de lo que dice en sus reels y de cómo escribe en sus historias${e.redes.length ? `: ${e.redes.map(r => `<a href="${esc(r)}" target="_blank" rel="noreferrer">${esc(r.replace(/^https?:\/\/(www\.)?/, "").replace(/\/?\?.*$/, "").replace(/\/$/, ""))}</a>`).join(", ")}` : ""}.</p><div class="fa"><button class="b p" data-redes-save>${e.voz ? "Releer su voz" : "Leer su voz"}</button><button class="b ghost" data-redes-mas>${redesMas ? "Cerrar" : "Sumar otra red"}</button></div>${redesMas ? `<label>Otras redes, opcional<textarea id="neg-redes" rows="2" placeholder="youtube.com/@canal, un link por línea"></textarea></label>` : ""}<div class="who" id="neg-redes-error"></div></div></section>` : ""}
	<section><h3>Equipo <small>${state.agents.length} agentes</small></h3><div class="chips">${areas.map(a => `<span class="pill idle">${esc(nombre(a))}</span>`).join("")}${carpeta ? faltan.map(d => `<button class="chipb" data-cli-team="${esc(d.slug)}">Sumar ${esc(d.name)}</button>`).join("") : ""}</div></section>
	<section><h3>Embudos</h3>${e.hosting ? "" : `<div class="soft-note">Falta activar el hosting para publicar.${carpeta ? "" : ` <button data-section="claves">Ir a Tus claves</button>`}</div>`}${publicados.length ? tabla(["Tipo", "Nombre", ""], publicados) : `<div class="muted">Todavía no hay nada publicado.</div>`}</section>
	<section><h3>Workflows</h3>${flujos.length ? tabla(["Nombre", "Lo atiende", "Corridas", ""], flujos) : `<div class="muted">Todavía no hay workflows.</div>`}</section>
	${crmCarpetaHtml(e.crm)}</div>`;
}

/** Lo que el equipo sacó de su perfil, una parte por guía. El dueño confirma o corrige: lo suyo manda. */
const PARTES_PERFIL = [["video", "Cómo edita"], ["reels", "Sus formatos"], ["marca", "Cómo se ve"], ["voz", "Cómo habla"], ["landings", "Sus páginas y links"], ["casos", "Casos"], ["historias", "Sus historias"]];
let perfEditando = "";
let perfError = "";
function perfilLeidoHtml() {
	const lib = extra.library;
	if (!lib) return "";
	const guias = new Map((lib.guides ?? []).map(g => [g.topic, g]));
	// "Leyendo" solo si hay equipo y alguien trabaja: sin equipo todavía nadie lo lee.
	const conEquipo = state.agents.some(a => a.department);
	const leyendo = conEquipo && state.agents.some(a => a.busy || a.queued);
	const hay = PARTES_PERFIL.filter(([t]) => guias.has(t));
	if (!hay.length && !(lib.material ?? []).some(m => ["instagram", "canal", "red"].includes(m.kind))) return "";
	const parte = ([topic, titulo]) => {
		const g = guias.get(topic);
		if (!g) return "";
		const accion = perfEditando === topic ? "" : g.confirmada ? `<span class="state ok">${g.source === "Corregido por el dueño" ? "Corregido por vos" : "Confirmado"}</span><button class="b ghost" data-perf-corregir="${topic}">Corregir</button>` : `<button class="b" data-perf-ok="${topic}">Está bien</button><button class="b ghost" data-perf-corregir="${topic}">Corregir</button>`;
		const cuerpo = perfEditando === topic
			? `<div class="perfed"><textarea id="perf-texto" rows="${Math.min(14, g.rules.length + 2)}" aria-label="${esc(titulo)}">${esc(g.rules.join("\n"))}</textarea><small>Una regla por línea. Lo que escribas reemplaza lo que sacó el equipo.</small>${perfError ? `<div class="who">${esc(perfError)}</div>` : ""}<div class="fa"><button class="b p" data-perf-guardar="${topic}">Guardar</button><button class="b ghost" data-perf-cancelar>Cancelar</button></div></div>`
			: `<ul>${g.rules.slice(0, 6).map(r => `<li>${esc(r)}</li>`).join("")}</ul>${g.rules.length > 6 ? `<small class="muted">y ${g.rules.length - 6} más en la Biblioteca</small>` : ""}`;
		return `<article class="perfp ${g.confirmada ? "ok" : ""}"><header><b>${esc(titulo)}</b><span class="perfacc">${accion}</span></header>${cuerpo}</article>`;
	};
	const faltan = PARTES_PERFIL.filter(([t]) => !guias.has(t)).map(([, n]) => n.toLowerCase());
	const sinConfirmar = hay.filter(([t]) => !guias.get(t).confirmada).length;
	const pie = hay.length && faltan.length ? `<p class="perfpie">${leyendo ? `Todavía falta: ${esc(faltan.join(", "))}.` : `No se pudo sacar del perfil: ${esc(faltan.join(", "))}. Si lo tenés, sumalo en la Biblioteca.`}</p>` : "";
	const vacio = !conEquipo ? "Cuando armes su equipo, lee su perfil y te muestra acá cómo edita, cómo habla y cómo se ve, para que lo confirmes." : leyendo ? "El equipo está leyendo su perfil. Cuando termine, aparece acá para que lo confirmes." : "Todavía no se leyó su perfil.";
	return `<section class="perf"><h3>Lo que sacamos de su perfil ${sinConfirmar ? `<small class="rojo">${sinConfirmar} para confirmar</small>` : hay.length ? `<small>todo confirmado</small>` : ""}</h3>${rapidoCarpetaHtml()}${hay.length ? `<div class="perfl">${hay.map(parte).join("")}</div>` : `<p class="perfpie">${vacio}</p>`}${pie}</section>`;
}

/** Lo que se leyó de su Instagram al darlo de alta: arriba de lo que sacó el equipo. */
function rapidoCarpetaHtml() {
	const l = extra.perfilRapido;
	if (!l) return "";
	if (l.estado === "leyendo") return `<div class="perfp prap"><div class="oplee"><div><i class="tbgira" aria-hidden="true"></i>Leyendo su Instagram…</div></div></div>`;
	if (l.estado !== "listo") return `<div class="perfp prap"><p class="perfpie">No se pudo leer su Instagram. <button class="linkb" data-perf-releer>Probar de nuevo</button></p></div>`;
	const d = l.datos;
	const reels = d.mejores.slice(0, 3).map(m => `<li><b>${m.vistas !== null ? `${num(m.vistas)} vistas` : `${num(m.likes)} likes`}</b><span>${esc(((t => (t.length > 90 ? `${t.slice(0, 88).trimEnd()}…` : t))((m.titulo || "Sin texto").split("\n")[0])))}</span></li>`).join("");
	return `<div class="perfp prap"><header><b>@${esc(d.cuenta)}</b><small>${num(d.seguidores)} seguidores · ${d.piezas} piezas leídas</small><span class="perfacc"><button class="b ghost" data-perf-releer>Leer de nuevo</button></span></header>${d.bio ? `<p class="prbio">${esc(d.bio)}</p>` : ""}${reels ? `<ol class="oplr">${reels}</ol>` : ""}${d.destacadas.length ? `<div class="oplch">${d.destacadas.map(x => `<span class="oplchip"><small>Destacada</small>${esc(x)}</span>`).join("")}</div>` : ""}</div>`;
}

let crmAbierto = false;
let redesMas = false;
const NOMBRE_ETAPA = { nuevo: "Nuevo", contactado: "Contactado", agendado: "Agendado", cliente: "Cliente", perdido: "Perdido" };

function crmCarpetaHtml(crm) {
	const clientes = crm.contactos.filter(c => c.etapa === "cliente").length;
	const detalle = crm.contactos.length ? `${crm.contactos.length} contactos · ${clientes} ${clientes === 1 ? "cliente" : "clientes"}` : "Todavía no hay contactos";
	return `<button class="libfolder" data-crm-abrir="1"><span class="doc">${ic("users")}</span><span class="ltext"><b>CRM</b><small>${detalle}</small></span>${ic("chevron-right")}</button>`;
}

function crmHtml(crm) {
	const tarjeta = c => `<div class="crmc"><b>${esc(c.nombre)}</b>${c.fuente ? `<small>${esc(c.fuente)}</small>` : ""}${c.valor ? `<small>$${num(c.valor)}</small>` : ""}<select aria-label="Etapa de ${esc(c.nombre)}" data-crm-etapa="${esc(c.id)}">${crm.etapas.map(e => `<option value="${e}" ${e === c.etapa ? "selected" : ""}>${NOMBRE_ETAPA[e]}</option>`).join("")}</select><button class="linkb crmdel" data-crm-borrar="${esc(c.id)}">Borrar</button></div>`;
	const columnas = crm.etapas.map(e => {
		const lista = crm.contactos.filter(c => c.etapa === e);
		return `<div class="crmcol"><h4>${NOMBRE_ETAPA[e]} <small>${lista.length}</small></h4>${lista.map(tarjeta).join("")}</div>`;
	}).join("");
	const cobros = crm.enlaces.cobros.map(c => `<a href="${esc(c.url)}" target="_blank" rel="noreferrer">${esc(c.nombre)} · ${num(c.precio)} ${esc(c.moneda)}</a>`).join("");
	const links = crm.enlaces.agenda || cobros ? `<section><h3>Agenda y cobros</h3><div class="redes">${crm.enlaces.agenda ? `<a href="${esc(crm.enlaces.agenda)}" target="_blank" rel="noreferrer">Agenda</a>` : ""}${cobros}</div></section>` : "";
	return `<div class="lib carpv"><button class="fold-h" data-crm-abrir="">${ic("chevron-left")} Negocio</button><section><h3>CRM <small>${crm.contactos.length} contactos</small></h3><div class="crmgrid">${columnas}</div></section>${links}</div>`;
}

const WEEK_MS = 7 * 86_400_000;
const ROLE_NAMES = { asistente: "Tu mano derecha", captain: "Comanda el área", "director-creativo": "Referencias y entregables", "head-content": "Tiempos y editores", editor: "Edita tus videos", bugs: "Arregla lo que se rompe", funciones: "Desarrolla lo nuevo", closer: "Prepara las llamadas", setter: "Califica y agenda", analista: "Lee los números", estratega: "Arma el plan", guionista: "Escribe las piezas" };

/** Todo lo que pasó entre personas y agentes, de lo más nuevo a lo más viejo. */
function talks() {
	const fromRequests = state.requests.map(r => ({ at: r.at, from: r.agentId, to: "dueno", text: r.title }));
	const fromCeo = state.ceo.map(p => ({ at: p.at, from: p.agentId, to: "dueno", text: "Reporte en #ceo" }));
	return [...(state.comms ?? []), ...fromRequests, ...fromCeo].filter(t => t.at).sort((a, b) => b.at.localeCompare(a.at));
}

/** Lo que está haciendo sale de su última orden. Las órdenes que nombran una skill dicen más por la skill que por su primera frase. */
const TAREAS = [[/plan-desde-la-meta/, "Armando el plan"], [/miro-90-dias/, "Armando el Miro"], [/relevar-perfil|relevamiento|tenés las redes/i, "Relevando el perfil"], [/extraer-voz/, "Leyendo su voz"], [/calendario/i, "Armando el calendario"], [/guion|script/i, "Escribiendo guiones"]];

/** La última orden que recibió de quien lo manda (o de cualquiera, si no hay). */
function ordenDe(a) {
	const mandan = new Set(["dueno", bossId(a), state.agents.find(x => x.role === "asistente")?.id]);
	const recibidas = (state.comms ?? []).filter(c => c.to === a.id);
	return recibidas.filter(c => mandan.has(c.from)).at(-1) ?? recibidas.at(-1) ?? null;
}

function tareaDe(a) {
	// Solo cuenta lo que le ordenaron: lo que le avisa un compañero no es su tarea.
	const mandan = new Set(["dueno", bossId(a), state.agents.find(x => x.role === "asistente")?.id]);
	const recibidas = (state.comms ?? []).filter(c => c.to === a.id);
	const orden = recibidas.filter(c => mandan.has(c.from)).at(-1) ?? recibidas.at(-1);
	if (!orden) return `<small>Trabajando</small>`;
	const texto = TAREAS.find(([busca]) => busca.test(orden.text))?.[1] ?? (orden.text.split(/[.:\n]/)[0].trim().slice(0, 28) || "Trabajando");
	return `<small>${esc(texto)}</small><small>Hace ${lasted(orden.at, new Date())}</small>`;
}

function orgNode(a) {
	const status = a.busy ? "" : a.connected ? "on" : "";
	return `<button class="onode ${a.busy ? "trabaja" : ""}" data-node="${a.id}" data-edit-agent="${a.id}"><span class="oav">${a.busy ? `<i class="oring"></i>` : ""}${avatar(a)}${a.busy ? "" : `<i class="odot ${status}"></i>`}</span><span class="ct"><b>${esc(a.name)}</b>${a.busy ? tareaDe(a) : `<small>${ (a.title && a.title !== a.name ? esc(a.title) : "") || ROLE_NAMES[a.role] || (a.department ? esc(nombre(a.department)) : "Disponible")}</small>`}</span></button>`;
}

const ownerName = () => state.settings?.owner?.name || "Vos";
const initials = name => name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();

function ownerNode() {
	const { name, company } = state.settings?.owner ?? {};
	const mark = name ? `<span class="oinit">${esc(initials(name))}</span>` : document.getElementById("logo").innerHTML;
	return `<div class="onode owner" data-node="dueno"><span class="clogo">${mark}</span><span class="ct"><b>${esc(ownerName())}</b><small>${esc(company || "Dueño")}</small></span></div>`;
}

function who(id) {
	if (id === "dueno") return ownerName();
	return state.agents.find(a => a.id === id)?.name ?? "Un agente";
}

/** Sin cuenta de Claude no arranca ningún agente: en vez de una pantalla vacía, el paso que falta. */
const faltaClaudeHtml = () => {
	const l = state.claudeLogin ?? { state: "idle" };
	const accion = l.state === "waiting" ? `<p class="fc-nota">Autorizá en el navegador que se abrió.${l.url ? ` <a href="${esc(l.url)}" target="_blank" rel="noreferrer">Abrirlo de nuevo</a>` : ""}</p><button class="b" data-claude-cancel>Cancelar</button>` : `${l.state === "failed" ? `<p class="fc-nota err">${esc(l.error)}</p>` : ""}<button class="b go" data-claude-add>Conectar mi cuenta de Claude</button>`;
	return `<div class="falta-claude"><span class="clogo">${CLAUDE_MARK}</span><h2>Falta tu cuenta de Claude</h2><p>Tus agentes piensan con tu cuenta. Apenas la conectes, arranca tu Asistente y desde ahí armás todo.</p>${accion}</div>`;
};

/** Con qué modelo trabaja cada agente: lo elige el dueño desde la ficha. */
const MODELOS = [
	["anthropic/claude-sonnet-5-5", "Sonnet 5.5", "Rápido. Para lo de todos los días"],
	["anthropic/claude-opus-5-5", "Opus 5.5", "Criterio y trabajo creativo"],
	["anthropic/claude-fable-5-2", "Fable 5.2", "Diseño y lo más difícil. Gasta más cupo"],
];
// Lo que tocó en la ficha y todavía no guardó: un repintado del equipo no se lo tiene que borrar.
let modeloEnFicha = null;
document.addEventListener("change", e => {
	if (e.target.name === "agent-model") modeloEnFicha = e.target.value;
});
function modeloHtml(a) {
	const actual = modeloEnFicha ?? a.modelo ?? (typeof a.model === "string" ? a.model : a.model?.id ? `${a.model.provider}/${a.model.id}` : null);
	const opciones = MODELOS.map(([id, nombre, nota]) => {
		const fableViejo = id.includes("fable") && state.settings?.motorNuevo === false;
		return `<label class="omod ${actual === id ? "on" : ""}"><input type="radio" name="agent-model" value="${id}" ${actual === id ? "checked" : ""}><b>${nombre}</b><small>${fableViejo ? "Va con Fable 5.1 hasta que reinstales la app" : nota}</small></label>`;
	}).join("");
	return `<div class="omods" role="radiogroup" aria-label="Modelo"><span class="olabel">Modelo</span>${opciones}</div>`;
}

/** El Equipo como una constelación en vivo (estilos .eq en atv.css). En el centro, vos; en la primera órbita, el
 * Asistente; cada área es un sector con su capitán y su gente más afuera. Las órdenes de la última semana se ven
 * como hilos que van de quien pidió a quien recibió, y las de la última hora llevan una luz que viaja por el hilo.
 * Al tocar un agente, a la derecha aparece su credencial (como la de Mi cuenta del Classroom): qué está haciendo,
 * quién se lo pidió, lo que espera tu OK y los botones para chatear o editar su ficha. Abajo, lo último que se dijeron.
 * Las animaciones quedan atadas al reloj de la página (drawOrg): repintar no las hace arrancar de nuevo. */
let eqSel = null;
const EQ_HORA = 3600_000;

/** Dónde va cada uno, en un lienzo de 1000 × 1000 con vos en el centro. */
function eqPosiciones() {
	const pos = { dueno: { x: 500, y: 500, ang: -90 } };
	const assistant = state.agents.find(a => a.role === "asistente");
	if (assistant) pos[assistant.id] = { x: 500, y: 500 - 150, ang: -90 };
	const areas = [...new Set(state.agents.filter(a => a.department && a.role !== "asistente").map(a => a.department))];
	const sueltos = state.agents.filter(a => !a.department && a.role !== "asistente");
	const n = Math.max(1, areas.length);
	const span = 360 / n;
	const polar = (r, grados) => ({ x: 500 + r * Math.cos((grados * Math.PI) / 180), y: 500 + r * Math.sin((grados * Math.PI) / 180), ang: grados });
	const sectores = areas.map((d, i) => {
		const centro = -90 + span / 2 + i * span;
		const gente = state.agents.filter(a => a.department === d);
		const capitan = gente.find(a => a.role === "captain" || a.role === "head-content") ?? gente[0];
		pos[capitan.id] = polar(300, centro);
		const resto = gente.filter(a => a !== capitan);
		const paso = Math.min(span * 0.62 / Math.max(1, resto.length - 1), 28);
		resto.forEach((a, j) => (pos[a.id] = polar(resto.length > 4 && j % 2 ? 385 : 425, centro + (j - (resto.length - 1) / 2) * paso)));
		return { d, centro, desde: centro - span / 2, hasta: centro + span / 2, etiqueta: polar(478, centro) };
	});
	sueltos.forEach((a, j) => (pos[a.id] = polar(230, -90 + (j + 1) * 40)));
	return { pos, sectores };
}

function equipoHtml() {
	const { pos, sectores } = eqPosiciones();
	const assistant = state.agents.find(a => a.role === "asistente");
	if (!eqSel || !state.agents.some(a => a.id === eqSel)) eqSel = state.agents.find(a => a.busy)?.id ?? assistant?.id ?? state.agents[0]?.id ?? null;
	const ahora = Date.now();
	const piden = id => pending().filter(r => r.agentId === id).length + proposed().filter(k => k.agentId === id).length;
	const estado = a => (a.busy ? "trabaja" : piden(a.id) ? "pide" : a.queued ? "fila" : a.asleep ? "duerme" : "libre");
	const ESTADO = { trabaja: "Trabajando", pide: "Te necesita", fila: "En fila", duerme: "Dormido", libre: "Disponible" };

	// Los hilos: cada par que se habló en la semana, curvado hacia el centro. Las charlas de la última hora, encendidas.
	const pares = new Map();
	for (const t of talks().filter(t => ahora - new Date(t.at).getTime() < WEEK_MS)) {
		if (!pos[t.from] || !pos[t.to] || t.from === t.to) continue;
		const clave = `${t.from}>${t.to}`;
		const p = pares.get(clave) ?? { from: t.from, to: t.to, n: 0, ultima: 0 };
		p.n += 1;
		p.ultima = Math.max(p.ultima, new Date(t.at).getTime());
		pares.set(clave, p);
	}
	const curva = (a, b, tiron = 0.35) => {
		const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
		const cx = mx + (500 - mx) * tiron, cy = my + (500 - my) * tiron;
		return `M${a.x.toFixed(1)} ${a.y.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
	};
	const jerarquia = state.agents.map(a => [bossId(a) ?? "dueno", a.id]).filter(([p, c]) => pos[p] && pos[c]).map(([p, c]) => `<path class="eq-rama" data-a="${p}" data-b="${c}" d="${curva(pos[p], pos[c], 0)}"/>`).join("");
	const hilos = [...pares.values()].map((p, i) => {
		const vivo = ahora - p.ultima < EQ_HORA;
		const d = curva(pos[p.from], pos[p.to], 0.28 + (i % 3) * 0.06);
		return `<g class="eq-hilo ${vivo ? "vivo" : ""}" data-a="${p.from}" data-b="${p.to}"><path d="${d}"/>${vivo ? `<circle r="5"><animateMotion dur="${2.4 + (i % 4) * 0.5}s" repeatCount="indefinite" path="${d}"/></circle>` : ""}</g>`;
	}).join("");
	const sectoresSvg = sectores.map((s, i) => {
		const arco = (r, a0, a1) => {
			const p0 = [500 + r * Math.cos((a0 * Math.PI) / 180), 500 + r * Math.sin((a0 * Math.PI) / 180)];
			const p1 = [500 + r * Math.cos((a1 * Math.PI) / 180), 500 + r * Math.sin((a1 * Math.PI) / 180)];
			return [p0, p1];
		};
		const [o0, o1] = arco(470, s.desde + 1.5, s.hasta - 1.5);
		const [i0, i1] = arco(210, s.desde + 1.5, s.hasta - 1.5);
		const grande = s.hasta - s.desde > 180 ? 1 : 0;
		return `<path class="eq-sector ${i % 2 ? "par" : ""}" data-area="${esc(s.d)}" d="M${i0[0]} ${i0[1]}L${o0[0]} ${o0[1]}A470 470 0 ${grande} 1 ${o1[0]} ${o1[1]}L${i1[0]} ${i1[1]}A210 210 0 ${grande} 0 ${i0[0]} ${i0[1]}Z"/>`;
	}).join("");

	const nodo = a => {
		const p = pos[a.id];
		if (!p) return "";
		const e = estado(a);
		const n = piden(a.id);
		const tam = a.role === "asistente" ? "xl" : a.role === "captain" || a.role === "head-content" ? "lg" : "md";
		return `<button class="eq-nodo is-${e} ${tam} ${eqSel === a.id ? "on" : ""}" style="left:${p.x / 10}%;top:${p.y / 10}%" data-eq-sel="${a.id}" data-eq-nodo="${a.id}" aria-label="${esc(a.name)}: ${ESTADO[e]}" aria-pressed="${eqSel === a.id}"><span class="eq-cara">${avatar(a)}<i class="eq-aro" aria-hidden="true"></i>${n ? `<span class="eq-pide">${n}</span>` : ""}</span><span class="eq-nom">${esc(a.name)}</span></button>`;
	};
	const { name, company } = state.settings?.owner ?? {};
	const centro = `<div class="eq-centro" style="left:50%;top:50%" data-eq-nodo="dueno"><span class="eq-yo">${esc(initials(name || "Vos"))}</span><span class="eq-nom">Vos</span></div>`;
	const etiquetas = sectores.map(s => `<span class="eq-area" style="left:${s.etiqueta.x / 10}%;top:${s.etiqueta.y / 10}%" data-area="${esc(s.d)}">${esc(nombre(s.d))}</span>`).join("");

	const trabajando = state.agents.filter(a => a.busy).length;
	const totalPiden = state.agents.reduce((t, a) => t + piden(a.id), 0);
	const enFila = state.agents.filter(a => a.queued && !a.busy).length;
	const leyenda = [["trabaja", "Trabajando", trabajando], ["pide", "Te necesitan", state.agents.filter(a => piden(a.id)).length], ["fila", "En fila", enFila], ["libre", "Disponibles", state.agents.filter(a => estado(a) === "libre").length]].map(([k, t, n]) => `<span class="eq-ley is-${k}"><i></i>${t}<b>${n}</b></span>`).join("");
	const quienEq = id => (id === "dueno" ? "Vos" : who(id));
	const textoEq = txt => {
		const linea = String(txt ?? "").split(/\n/)[0];
		return (/^[A-Z0-9_]+$/.test(linea) ? actionOf({ kind: "accion", title: linea }).title : linea).slice(0, 90);
	};
	const ultimas = talks().filter(t => t.from !== t.to).slice(0, 6).map(t => `<li><button data-eq-sel="${esc(t.from === "dueno" ? t.to : t.from)}">${t.from === "dueno" ? `<span class="eq-yo sm">${esc(initials(name || "Vos"))}</span>` : avatar({ id: t.from }, "xs")}<span class="eq-dijo"><b>${esc(quienEq(t.from))}</b> → <b>${esc(quienEq(t.to))}</b><small>${esc(textoEq(t.text))}</small></span><time>${ago(t.at)}</time></button></li>`).join("");

	const rows = state.kpis.filter(k => k.state === "aprobada").map(k => {
		const r = state.readings.filter(x => x.kpi === k.id).at(-1);
		return `<tr><td>${esc(k.name)}</td><td>${r?.value ?? (r ? "falló" : "—")}</td><td>${esc(k.target)}</td></tr>`;
	});
	const kpis = rows.length ? `<h3 class="clabel">KPIs</h3><div class="kt" style="margin:0;max-width:none"><table><thead><tr><th>KPI</th><th>Hoy</th><th>Meta</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>` : "";
	const editing = state.agents.find(a => a.id === agentEdit);
	const modal = editing
		? `<div class="omodal" data-modal-close><div class="ocard" role="dialog" aria-label="Ficha de ${esc(editing.name)}" data-modal-stay><div class="ohead"><span class="oface">${avatar(editing)}</span><span class="ct"><b>${esc(editing.name)}</b><small>${editing.department ? esc(nombre(editing.department)) : "Tu mano derecha"}</small></span><button class="b" data-agent="${editing.id}">Abrir chat</button></div><label>Nombre<input id="agent-name" value="${esc(editing.name)}" maxlength="40" autocomplete="off"></label><label>Cargo<input id="agent-title" value="${esc(editing.title ?? "")}" placeholder="${esc(ROLE_NAMES[editing.role] ?? "Agente")}" autocomplete="off"></label>${modeloHtml(editing)}${editing.role === "asistente" ? "" : `<label>Reporta a<select id="agent-boss">${state.agents.filter(a => a.id !== editing.id).map(a => `<option value="${a.id}" ${a.id === bossId(editing) ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label>`}${agentError ? `<div class="soft-note">${esc(agentError)}</div>` : ""}<div class="fa">${editing.role === "asistente" ? "" : `<button class="b ghost danger" data-agent-remove="${editing.id}">${removing ? "¿Seguro?" : "Sacar"}</button>`}<span class="sp"></span><button class="b ghost" data-modal-close>Cancelar</button><button class="b go" data-agent-save="${editing.id}">Guardar</button></div></div></div>`
		: "";
	if (!state.agents.length) return `<div class="eqm"><div class="orghint">Tu equipo crece cuando le pedís al Asistente que arme un departamento.</div></div>${modal}`;

	const titulo = trabajando ? `${state.agents.length} agentes, <em>${trabajando} trabajando ahora.</em>` : `${state.agents.length} agentes, <em>todos tranquilos.</em>`;
	return `<div class="eqm">
	<header class="eq-cab">
		<div><p class="tb2-ojo">Tu equipo · en vivo${carpeta ? ` · ${esc(state.carpeta?.nombre ?? "")}` : company ? ` · ${esc(company)}` : ""}</p><h1>${titulo}</h1></div>
		<div class="eq-leyenda">${leyenda}</div>
	</header>
	<div class="eq-cuerpo">
		<section class="eq-cielo" aria-label="Mapa del equipo">
			<div class="eq-lienzo" id="eq-lienzo">
				<svg class="eq-svg" viewBox="0 0 1000 1000" aria-hidden="true">
					<circle class="eq-orbita" cx="500" cy="500" r="150"/><circle class="eq-orbita" cx="500" cy="500" r="300"/><circle class="eq-orbita fina" cx="500" cy="500" r="425"/>
					${sectoresSvg}${jerarquia}${hilos}
				</svg>
				${etiquetas}${centro}${state.agents.map(nodo).join("")}
			</div>
			<p class="eq-pista">Tocá a alguien para ver su credencial. Las líneas rojas son órdenes de la última hora.</p>
		</section>
		<aside class="eq-lado">${eqCredencial(state.agents.find(a => a.id === eqSel), estado, ESTADO, piden)}
			${ultimas ? `<section class="eq-feed"><h2>Lo último que se dijeron</h2><ol>${ultimas}</ol></section>` : ""}
		</aside>
	</div>
	${kpis}
</div>${modal}`;
}

/** La credencial del agente elegido: la lámina oscura con sus iniciales de fondo, como la de Mi cuenta del Classroom. */
function eqCredencial(a, estado, ESTADO, piden) {
	if (!a) return "";
	const e = estado(a);
	const orden = ordenDe(a);
	const paso = a.busy ? (a.ahora ? pasoLegible(a.ahora) : "Trabajando") : a.queued ? "En fila, arranca en un rato" : a.asleep ? "Dormido hasta que lo llamen" : "Disponible para lo que le pidas";
	const cargo = (a.title && a.title !== a.name ? a.title : "") || ROLE_NAMES[a.role] || "Agente";
	const pedidos = pending().filter(r => r.agentId === a.id);
	const entregas = state.requests.filter(r => r.agentId === a.id && r.kind === "entrega").length;
	const charlas = talks().filter(t => (t.from === a.id || t.to === a.id) && Date.now() - new Date(t.at).getTime() < WEEK_MS).length;
	const modelo = MODELOS.find(([id]) => id === (a.modelo ?? (typeof a.model === "string" ? a.model : "")))?.[1];
	const jefe = bossId(a);
	return `<article class="eq-cred is-${e}" aria-label="Credencial de ${esc(a.name)}">
		<div class="eq-cred__lamina">
			<span class="eq-cred__mono" aria-hidden="true">${esc(initials(a.name))}</span>
			<div class="eq-cred__tapa"><span>ATV · Agente</span><span class="eq-cred__estado"><i></i>${ESTADO[e]}</span></div>
			<div class="eq-cred__quien">${avatar(a, "hd")}<div><b>${esc(a.name)}</b><small>${esc(cargo)}</small></div></div>
			<div class="eq-cred__chips">${a.department ? `<span>${esc(nombre(a.department))}</span>` : `<span>Mano derecha</span>`}${modelo ? `<span>${esc(modelo)}</span>` : ""}${jefe ? `<span>Reporta a ${esc(who(jefe))}</span>` : ""}</div>
		</div>
		<div class="eq-cred__talon">
			<div class="eq-cred__ahora"><small>Ahora</small><p><i class="${a.busy ? "tbgira" : "tbespera"}" aria-hidden="true"></i>${esc(paso)}</p>${orden ? `<blockquote>“${esc(orden.text.split(/\n/)[0].trim().slice(0, 140))}”<cite>${esc(orden.from === "dueno" ? "Se lo pediste vos" : `Se lo pidió ${who(orden.from)}`)} · hace ${lasted(orden.at, new Date())}</cite></blockquote>` : ""}</div>
			<dl class="eq-cred__cifras"><div><dt>Esperan tu OK</dt><dd class="${piden(a.id) ? "rojo" : ""}">${piden(a.id)}</dd></div><div><dt>Entregas</dt><dd>${entregas}</dd></div><div><dt>Charlas · 7 días</dt><dd>${charlas}</dd></div></dl>
			${pedidos.length ? `<button class="eq-cred__pide" data-ver-pedido="${pedidos[0].id}">${ic("inbox")}<span><b>${esc(actionOf(pedidos[0])?.title ?? pedidos[0].title)}</b><small>Espera tu OK</small></span>${ic("chevron-right")}</button>` : ""}
			<div class="eq-cred__bots"><button class="b go" data-agent="${a.id}">Abrir chat</button><button class="b" data-edit-agent="${a.id}">Editar ficha</button></div>
		</div>
	</article>`;
}

/** Después de pintar: las animaciones siguen el reloj de la página (no arrancan de nuevo con cada repintado). */
function drawOrg() {
	const raiz = document.querySelector(".eqm");
	if (!raiz) return;
	for (const anim of raiz.getAnimations({ subtree: true })) anim.startTime = 0;
	const svg = raiz.querySelector(".eq-svg");
	if (svg?.setCurrentTime) svg.setCurrentTime((performance.now() / 1000) % 60);
}

document.addEventListener("click", e => {
	const t = e.target.closest?.("[data-eq-sel]");
	if (!t) return;
	eqSel = t.dataset.eqSel;
	lastBody = "";
	renderBody();
	// En pantallas angostas la credencial queda abajo del mapa: se baja hasta ella.
	if (matchMedia("(max-width:1100px)").matches) document.querySelector(".eq-cred")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
});
/** Al pasar por alguien se encienden sus hilos y su rama; lo demás se apaga un poco. */
document.addEventListener("mouseover", e => {
	const lienzo = document.getElementById("eq-lienzo");
	if (!lienzo) return;
	const id = e.target.closest?.("[data-eq-nodo]")?.dataset.eqNodo ?? null;
	if (lienzo.dataset.foco === (id ?? "")) return;
	lienzo.dataset.foco = id ?? "";
	lienzo.classList.toggle("con-foco", Boolean(id));
	for (const el of lienzo.querySelectorAll("[data-a]")) el.classList.toggle("foco", Boolean(id) && (el.dataset.a === id || el.dataset.b === id));
	for (const el of lienzo.querySelectorAll("[data-eq-nodo]")) el.classList.toggle("foco", el.dataset.eqNodo === id);
});

const SECTIONS = [
	["general", "sliders-horizontal", "General"],
	["objetivo", "activity", "Objetivo"],
	["conexiones", "plug", "Conexiones"],
	["pixel", "route", "Píxel y conversiones"],
	["clientes", "folder", "Clientes"],
	["horario", "moon", "Horario libre"],
	["claves", "key-round", "Tus claves"],
	["gasto", "gauge", "Gasto"],
	["aprendido", "scale", "Lo aprendido"],
	["cuentas", "user-round", "Cuentas"],
	["no-contactar", "ban", "No contactar"],
	["importar", "download", "Importar"],
	["navegador", "globe", "Chrome de los agentes"],
	["computer", "monitor", "Computer use"],
	["telefono", "smartphone", "Teléfono"],
	["soporte", "life-buoy", "Soporte"],
];

const ZOOMS = [90, 100, 110, 125];

function loadZoom() {
	try {
		return Number(localStorage.getItem("zoom")) || 100;
	} catch {
		return 100;
	}
}

function applyZoom(z) {
	document.documentElement.style.zoom = `${z}%`;
	try {
		localStorage.setItem("zoom", String(z));
	} catch {
		// El navegador puede no dejar guardar: el tamaño vale hasta recargar.
	}
}

const row = (title, sub, control) => `<div class="srow"><div><b>${title}</b>${sub ? `<small>${sub}</small>` : ""}</div><div class="sctl">${control}</div></div>`;

const PILOTO = [
	["apagado", "Apagado", "Todo espera tu OK en la Bandeja."],
	["interno", "Lo interno", "Se aprueba solo lo que queda adentro: entregas, preguntas, tableros y skills. Lo que gasta plata, publica o le escribe a alguien sigue esperando."],
	["todo", "Todo", "Se aprueba todo, también lo que gasta plata, publica o le escribe a alguien."],
];

/** El piloto se ve de un vistazo arriba de la barra: el avión en verde con un punto que late cuando aprueba solo. */
function pilotoBoton() {
	const modo = state.settings?.autopiloto?.modo ?? "apagado";
	const tip = { apagado: "Piloto automático apagado", interno: "Piloto automático: aprueba lo interno", todo: "Piloto automático: aprueba todo" }[modo];
	return `<button class="ic piloto ${modo === "apagado" ? "" : "on"}" data-section="general" data-tip="${tip}" aria-label="${tip}">${ic("plane")}${modo === "apagado" ? "" : `<i class="piloto-punto ${modo}"></i>`}</button>`;
}

function pilotoHtml() {
	const modo = state.settings?.autopiloto?.modo ?? "apagado";
	return `<div class="piloto-caja"><h3 class="clabel">Piloto automático</h3><p>Para cuando no estás: el equipo sigue trabajando sin esperar tus OK. Solo se aprueba lo que llega después de prenderlo; lo que ya está en la Bandeja sigue esperando.</p><div class="piloto-ops">${PILOTO.map(([id, nombre, texto]) => `<label class="${id === modo ? "on" : ""}"><input type="radio" name="piloto" value="${id}" data-piloto ${id === modo ? "checked" : ""}><b>${nombre}</b><small>${texto}</small></label>`).join("")}</div></div>`;
}

document.addEventListener("change", async e => {
	if (!e.target.matches?.("[data-piloto]")) return;
	await api("/settings/autopiloto", { method: "POST", body: JSON.stringify({ modo: e.target.value }) });
	await loadState();
	lastBody = "";
	renderBody();
	renderSide();
});

