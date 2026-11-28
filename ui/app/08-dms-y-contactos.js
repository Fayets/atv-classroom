// ---------- DMs de Instagram, como la bandeja de Instagram ----------
// De la cuenta conectada en esta carpeta. Los agentes solo leen; responder es de la persona, desde acá.
// Meta no da las carpetas de Instagram. Solicitudes se arma como la arma Instagram: quien no sigue a la cuenta
// ni es seguido. Principal y General las elige cada uno a mano en la app y no salen de ningún lado.
const dms = { calif: {}, calificando: null, modo: "bandeja", reporte: null, periodo: "mes", rango: null, lista: [], siguiente: null, error: "", cargando: false, abierto: null, chats: {}, pestana: "todos", busca: "", resultados: null, buscando: false, sinLeer: 0, reloj: null, bajar: false, pegado: true, llamadas: {}, repPaso: null, revisando: false, aviso: "", enviando: false, borrador: {}, perfil: {}, pendientes: {} };
// Abrir un chat lo da por leído en esta compu: Instagram sigue contándolo sin leer, así que se anota hasta qué mensaje se vio.
// Si después llega uno nuevo (la fecha del chat pasa la anotada), el punto vuelve.
const dmVisto = stored("dmVisto", {});
const msDm = t => (t ? Date.parse(t) || 0 : 0);
const sinLeerDm = c => Boolean(c?.sin_leer) && !(c.id === dms.abierto && view.type === "dms") && !(c.id in dmVisto && msDm(c.actualizado) <= dmVisto[c.id]);
function marcarVistoDm(id) {
	const c = dms.lista.find(x => x.id === id) ?? dms.resultados?.find(x => x.id === id);
	const hasta = Math.max(msDm(c?.actualizado), Date.now());
	if (dmVisto[id] >= hasta) return;
	dmVisto[id] = hasta;
	const ids = Object.keys(dmVisto);
	if (ids.length > 2000) for (const viejo of ids.sort((a, b) => dmVisto[a] - dmVisto[b]).slice(0, ids.length - 2000)) delete dmVisto[viejo];
	store("dmVisto", dmVisto);
	dms.sinLeer = dms.lista.filter(sinLeerDm).length;
}
const PESTANAS_DM = [["todos", "Todos"], ["calificados", "Calificados"], ["sin-leer", "Sin leer"], ["solicitudes", "Solicitudes"], ["anuncios", "De anuncios"]];
const VENTANA_DM = 24 * 3600_000;
const VENTANA_DM_HUMANA = 7 * 24 * 3600_000;

async function cargarBandejaDms(mas = false) {
	if (dms.cargando) return;
	dms.cargando = true;
	const q = new URLSearchParams({ cantidad: "50", ...(mas && dms.siguiente ? { cursor: dms.siguiente } : {}) });
	const r = await api(`/ig/bandeja?${q}`).catch(() => null);
	const d = r ? await r.json().catch(() => ({})) : { error: "No respondió" };
	dms.cargando = false;
	// La base puede responder bien y sin la lista (se está actualizando): se avisa, no se rompe la pantalla.
	if (!r?.ok || !Array.isArray(d.conversaciones)) {
		dms.error = d.error ?? "No se pudo traer la bandeja";
		return pintarDms();
	}
	dms.error = "";
	if (mas) {
		const ya = new Set(dms.lista.map(c => c.id));
		dms.lista = [...dms.lista, ...d.conversaciones.filter(c => !ya.has(c.id))];
		dms.siguiente = d.siguiente;
	} else {
		// Lo nuevo arriba, y lo que ya se había cargado de más abajo no se pierde.
		const nuevos = new Set(d.conversaciones.map(c => c.id));
		dms.lista = [...d.conversaciones, ...dms.lista.filter(c => !nuevos.has(c.id))];
		if (!dms.siguiente) dms.siguiente = d.siguiente;
	}
	if (dms.abierto && view.type === "dms") marcarVistoDm(dms.abierto);
	dms.sinLeer = dms.lista.filter(sinLeerDm).length;
	pintarDms();
	renderSide();
}

// Mientras se escribe en el buscador no se repinta la vista: se repinta solo la lista, y el campo queda como está.
function pintarDms() {
	const filas = document.querySelector(".dmfilas");
	if (view.type === "dms" && filas && document.activeElement?.id === "dm-busca") {
		filas.innerHTML = filasDmsHtml();
		return;
	}
	renderBody();
}

let buscaDm = 0;
function buscarDms(texto) {
	dms.busca = texto;
	clearTimeout(buscaDm);
	if (texto.trim().length < 2) {
		dms.resultados = null;
		dms.buscando = false;
		return pintarDms();
	}
	dms.buscando = true;
	pintarDms();
	buscaDm = setTimeout(async () => {
		const pedido = texto;
		const r = await api(`/ig/buscar?q=${encodeURIComponent(pedido)}`).catch(() => null);
		const d = r ? await r.json().catch(() => ({})) : {};
		if (dms.busca !== pedido) return;
		dms.buscando = false;
		dms.resultados = r?.ok ? d.conversaciones : [];
		pintarDms();
	}, 300);
}

async function abrirChatDm(id) {
	const nuevo = dms.abierto !== id;
	dms.abierto = id;
	marcarVistoDm(id);
	if (nuevo) dms.aviso = "";
	dms.bajar = nuevo;
	if (nuevo) dms.pegado = true;
	const previo = dms.chats[id];
	dms.chats[id] = { ...(previo ?? {}), cargando: !previo };
	if (nuevo) {
		renderBody();
		void traerSeguimiento(id);
		const c = dms.lista.find(x => x.id === id) ?? dms.resultados?.find(x => x.id === id);
		if (c?.usuario) void traerCalificacion(c.usuario);
	}
	const r = await api(`/ig/chat/${encodeURIComponent(id)}`).catch(() => null);
	const d = r ? await r.json().catch(() => ({})) : {};
	const antes = JSON.stringify(previo?.mensajes ?? null);
	dms.chats[id] = r?.ok && Array.isArray(d.mensajes) ? { mensajes: d.mensajes, cargando: false } : { ...(previo ?? {}), cargando: false, error: d.error ?? "No se pudo abrir el chat" };
	if (dms.abierto !== id) return;
	if (JSON.stringify(dms.chats[id].mensajes ?? null) !== antes && dms.pegado) dms.bajar = true;
	renderBody();
}

// Si se siguen se pregunta en el momento, como lo muestra Instagram arriba del chat: lo de la lista puede estar viejo.
async function traerSeguimiento(id) {
	const c = dms.lista.find(x => x.id === id) ?? dms.resultados?.find(x => x.id === id);
	if (!c?.participante) return;
	const r = await api(`/ig/seguimiento/${encodeURIComponent(c.participante)}`).catch(() => null);
	if (!r?.ok) return;
	const d = await r.json().catch(() => null);
	if (!d) return;
	dms.perfil[id] = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null));
	if (dms.abierto === id) renderBody();
}

async function traerLlamadasDm() {
	const r = await api("/ig/llamadas").catch(() => null);
	if (!r?.ok) return;
	dms.llamadas = await r.json().catch(() => ({}));
	if (view.type === "dms") renderBody();
}

function abrirDms() {
	void traerLlamadasDm();
	void cargarContactos();
	// Al abrir trae 100 (dos tandas de 50, lo más que da la conexión por vez); el resto, bajando en la lista.
	void cargarBandejaDms().then(() => (dms.lista.length < 100 && dms.siguiente ? cargarBandejaDms(true) : undefined));
	if (dms.abierto) void abrirChatDm(dms.abierto);
	clearInterval(dms.reloj);
	// Mientras la vista está abierta: la lista cada 90 segundos y el chat abierto cada 20.
	let vuelta = 0;
	dms.reloj = setInterval(() => {
		if (view.type !== "dms") return clearInterval(dms.reloj);
		vuelta++;
		if (dms.modo === "reporte" && (vuelta % 3 === 0 || dms.reporte?.registro?.leyendo)) void cargarReporte();
		if (dms.modo === "contactos" && vuelta % 6 === 0 && !document.activeElement?.closest?.(".cto-ficha")) void cargarContactos();
		if (vuelta % 9 === 0 && document.activeElement?.id !== "dm-busca") void cargarBandejaDms();
		if (dms.abierto && document.activeElement?.id !== "dm-escribir") void abrirChatDm(dms.abierto);
	}, 10_000);
}

const inicialDm = c => esc((c.nombre || c.usuario || "?").trim().charAt(0).toUpperCase());
const caraDm = (c, tam = "") => (c.foto ? `<img class="dmcara ${tam}" src="${esc(c.foto)}" alt="" referrerpolicy="no-referrer" data-inicial="${inicialDm(c)}">` : `<span class="dmcara letra ${tam}">${inicialDm(c)}</span>`);
// Una foto de perfil que ya no carga deja la inicial, como cuando no hay foto.
document.addEventListener("error", e => {
	const img = e.target;
	if (!(img instanceof HTMLImageElement) || !img.classList.contains("dmcara")) return;
	const letra = Object.assign(document.createElement("span"), { className: img.className + " letra", textContent: img.dataset.inicial });
	img.replaceWith(letra);
}, true);

function haceDm(iso) {
	if (!iso) return "";
	const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
	if (min < 1) return "ahora";
	if (min < 60) return `${min} min`;
	if (min < 1440) return `${Math.round(min / 60)} h`;
	if (min < 10080) return `${Math.round(min / 1440)} d`;
	return `${Math.round(min / 10080)} sem`;
}

function adjuntoDm(a) {
	const url = esc(a.url);
	if (a.tipo === "imagen") return `<button class="dmadj img" data-dm-media="imagen" data-src="${url}"><img src="${url}" alt="" referrerpolicy="no-referrer"></button>`;
	if (a.tipo === "video") return `<button class="dmadj vid" data-dm-media="video" data-src="${url}"><video src="${url}" muted playsinline preload="metadata"></video><span class="dmplay"></span></button>`;
	if (a.tipo === "audio") return `<audio class="dmadj aud" src="${url}" controls preload="metadata"></audio>`;
	return `<button class="dmadj link" data-dm-web="${url}">${ic("instagram")}<span><b>${esc(a.titulo || "Publicación")}</b><small>Abrir en Instagram</small></span></button>`;
}

// Como en Instagram: "Respondió a tu historia" con la historia chiquita arriba del mensaje.
function historiaDm(m, lado) {
	const h = m.historia;
	if (!h) return "";
	const quien = lado === "mio" ? "Respondiste a su historia" : "Respondió a tu historia";
	const local = h.guardada ? scoped(`/media/historias/${h.guardada}`) : null;
	const src = local ?? h.url;
	const media = !src
		? `<span class="dmhist-ida">La historia ya no está</span>`
		: h.guardada?.endsWith(".mp4")
			? `<video src="${esc(src)}" muted playsinline preload="metadata"></video>`
			: `<img src="${esc(src)}" alt="Historia" referrerpolicy="no-referrer" data-historia-ida>`;
	const tipo = h.guardada?.endsWith(".mp4") ? "video" : "imagen";
	return `<div class="dmhist ${lado}"><small>${quien}</small>${src ? `<button data-dm-media="${tipo}" data-src="${esc(src)}" aria-label="Ver la historia">${media}</button>` : media}</div>`;
}
// Pasadas las 24 h, si no quedó copia, Meta ya no la sirve.
document.addEventListener("error", e => {
	const img = e.target;
	if (!(img instanceof HTMLImageElement) || !("historiaIda" in img.dataset)) return;
	img.closest("button")?.replaceWith(Object.assign(document.createElement("span"), { className: "dmhist-ida", textContent: "La historia ya no está" }));
}, true);

function burbujasDm(mensajes) {
	let dia = "";
	let previo = null;
	return (mensajes ?? []).map((m, i) => {
		const fecha = m.fecha ? new Date(m.fecha) : null;
		const d = fecha ? fecha.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" }) : "";
		const lejos = fecha && previo && fecha - previo > 45 * 60000;
		const sep = (d && d !== dia) || lejos ? `<div class="dmsep">${d !== dia ? esc(d) + " · " : ""}${fecha ? hora(m.fecha) : ""}</div>` : "";
		if (d) dia = d;
		if (fecha) previo = fecha;
		const lado = m.quien === "nosotros" ? "mio" : "suyo";
		const sigue = mensajes[i + 1]?.quien === m.quien;
		const titulo = `${fecha ? esc(fecha.toLocaleString("es-AR")) : ""}${m.nombre ? ` · ${esc(m.nombre)}` : ""}${m.via ? ` · ${esc(m.via)}` : ""}`;
		if (m.anulado) return `${sep}<div class="dmanulado ${lado}" title="${titulo}">${m.quien === "nosotros" ? "Anulaste un mensaje" : "Anuló un mensaje"}</div>`;
		const adjuntos = (m.adjuntos ?? []).map(a => `<div class="dmfila-adj ${lado}">${adjuntoDm(a)}</div>`).join("");
		// Instagram no le pasa a ninguna herramienta los stickers, GIF ni reacciones con que se responde una historia: llega vacío. Los audios sí llegan.
		const sinVer = !m.texto && !(m.adjuntos ?? []).length && m.historia ? `<div class="dmnover ${lado}" title="${titulo}">${lado === "mio" ? "Respondiste" : "Respondió"} con algo que Instagram no deja ver acá, como un sticker, un GIF o una reacción. Miralo en Instagram.</div>` : "";
		const texto = m.texto ? `<div class="dmmsg ${lado} ${sigue && !m.editado ? "sigue" : ""}" title="${titulo}">${esc(m.texto)}</div>${m.editado ? `<div class="dmeditado ${lado}">Editado</div>` : ""}` : sinVer;
		return `${sep}${historiaDm(m, lado)}${adjuntos}${texto}`;
	}).join("");
}

// Cuánto queda para poder responder: Instagram deja 24 h desde su último mensaje, y hasta 7 días como respuesta escrita a mano.
function ventanaDm(mensajes) {
	const ultimo = (mensajes ?? []).filter(m => m.quien === "lead" && m.fecha).map(m => Date.parse(m.fecha)).sort((a, b) => b - a)[0];
	if (ultimo === undefined) return { puede: false, nota: "Todavía no te escribió: Instagram no deja abrir la conversación desde afuera." };
	const pasado = Date.now() - ultimo;
	if (pasado <= VENTANA_DM) return { puede: true, nota: "" };
	if (pasado <= VENTANA_DM_HUMANA) return { puede: true, nota: `Pasaron más de 24 h: sale como respuesta escrita a mano (vale hasta ${new Date(ultimo + VENTANA_DM_HUMANA).toLocaleDateString("es-AR", { weekday: "long", day: "numeric" })}).` };
	return { puede: false, nota: "Pasaron más de 7 días desde su último mensaje: Instagram no deja responder desde acá." };
}

// Lo de la búsqueda no trae el perfil: se completa con la fila de la bandeja si está.
const fila = c => ({ ...c, ...(dms.lista.find(x => x.id === c.id) ?? {}), ...(dms.perfil[c.id] ?? {}) });
const tildeDm = c => (c.verificado ? `<svg class="dmtilde" viewBox="0 0 40 40" aria-label="Verificado"><path fill="#0095F6" d="M19.998 3.094 14.638 0l-2.972 5.15H5.432v6.354L0 14.64 3.094 20 0 25.359l5.432 3.137v5.905h5.975L14.638 40l5.36-3.094L25.358 40l3.232-5.6h6.162v-6.01L40 25.359 36.905 20 40 14.641l-5.248-3.03v-6.46h-6.419L25.358 0l-5.36 3.094Z"/><path fill="#fff" d="m17.087 26.47-7.2-7.2 2.546-2.546 4.654 4.654 10.48-10.48 2.546 2.546-13.026 13.026Z"/></svg>` : "");
const seguidoresDm = c => (typeof c.seguidores === "number" ? `${c.seguidores >= 1e6 ? `${(c.seguidores / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 })} M` : c.seguidores >= 1e4 ? `${(c.seguidores / 1e3).toLocaleString("es-AR", { maximumFractionDigits: 1 })} k` : c.seguidores.toLocaleString("es-AR")} seguidores` : "");
function relacionDm(c) {
	if (c.te_sigue === null && c.lo_seguis === null) return "";
	if (c.te_sigue && c.lo_seguis) return "se siguen";
	if (c.te_sigue) return "te sigue";
	if (c.lo_seguis) return "lo seguís, no te sigue";
	return "no te sigue";
}

// La calificación del lead, con el criterio de marketing: el puntaje en verde si califica.
const puntajeTexto = p => (p == null ? "" : String(p).replace(".", ","));
const notaDm = c => (!c || c.veredicto === "pendiente" ? "" : c.veredicto === "calificado" ? `<span class="dmnota-cal si" title="${esc(c.razon ?? "")}">${puntajeTexto(c.puntaje)}</span>` : `<span class="dmnota-cal" title="${esc(c.razon ?? "")}">No</span>`);

async function traerCalificacion(usuario) {
	if (!usuario) return;
	const r = await api(`/ig/calificacion?usuario=${encodeURIComponent(usuario)}`).catch(() => null);
	const d = r?.ok ? await r.json().catch(() => null) : null;
	if (!d) return;
	dms.calif[usuario.toLowerCase()] = d;
	if (view.type === "dms") renderBody();
}

function calificacionHtml(c) {
	const u = (c.usuario ?? "").toLowerCase();
	if (!u) return "";
	const d = dms.calif[u];
	const pidiendo = dms.calificando === u;
	const boton = `<button class="lnk" data-dm-calificar="${esc(u)}" ${pidiendo ? "disabled" : ""}>${pidiendo ? "Pedido al Setter" : d && d.veredicto !== "pendiente" ? "Recalificar" : "Calificar ahora"}</button>`;
	if (!d || d.veredicto === "pendiente") return `<div class="dmcal pend"><span>Sin calificar todavía</span>${boton}</div>`;
	const dims = d.dimensiones ? `<span class="dmcal-dims">negocio ${d.dimensiones.negocio} · financiero ${d.dimensiones.financiero} · avatar ${d.dimensiones.avatar}</span>` : "";
	const perfil = d.perfil ? `<span class="dmcal-dims">${[d.perfil.categoria, d.perfil.seguidores != null ? `${num(d.perfil.seguidores)} seguidores` : "", d.perfil.privada ? "cuenta privada" : ""].filter(Boolean).map(esc).join(" · ")}</span>` : "";
	return `<div class="dmcal ${d.veredicto === "calificado" ? "si" : "no"}"><b>${d.veredicto === "calificado" ? `Calificado · ${puntajeTexto(d.puntaje)}` : `No califica · ${puntajeTexto(d.puntaje)}`}</b><span class="dmcal-razon">${esc(d.razon ?? "")}</span>${dims}${perfil}${boton}</div>`;
}

/** Los calificados vienen aparte: la bandeja trae los últimos chats y ahí casi nunca hay uno. */
async function cargarCalificadosDms() {
	dms.califCargando = true;
	pintarDms();
	const r = await api("/ig/calificados").catch(() => null);
	const d = r ? await r.json().catch(() => ({})) : {};
	dms.califCargando = false;
	dms.calificados = r?.ok && Array.isArray(d.conversaciones) ? d.conversaciones : null;
	dms.califError = r?.ok ? "" : (d.error ?? "No se pudieron traer los calificados");
	pintarDms();
}

function filasDmsHtml() {
	if (dms.error) return `<div class="dmvacio">${esc(dms.error)}</div>`;
	const buscando = dms.busca.trim().length >= 2;
	const enCalif = !buscando && dms.pestana === "calificados";
	if (enCalif && dms.califError) return `<div class="dmvacio">${esc(dms.califError)}</div>`;
	// Si el chat también está en la bandeja, va con lo de la bandeja (foto, último mensaje, sin leer).
	const base = buscando ? dms.resultados ?? [] : enCalif ? (dms.calificados ?? []).map(c => ({ ...c, ...(dms.lista.find(x => x.id === c.id) ?? {}), calificacion: c.calificacion })) : dms.lista;
	const lista = base.filter(c => {
		const fila = dms.lista.find(x => x.id === c.id) ?? c;
		return dms.pestana === "calificados" ? fila.calificacion?.veredicto === "calificado" : dms.pestana === "sin-leer" ? sinLeerDm(fila) : dms.pestana === "solicitudes" ? fila.solicitud === true : dms.pestana === "anuncios" ? fila.vino_de_un_anuncio : true;
	});
	const filas = lista.map(c => {
		const deLista = dms.lista.find(x => x.id === c.id);
		const sinLeer = sinLeerDm(deLista ?? c);
		return `<button class="dmfila ${c.id === dms.abierto ? "on" : ""} ${sinLeer ? "nuevo" : ""}" data-dm="${esc(c.id)}">${caraDm(c)}<span class="dmtx"><b>${esc(c.nombre || c.usuario || "Usuario de Instagram")}${tildeDm(fila(c))}${notaDm(fila(c).calificacion)}</b><small><span class="dmult">${esc(c.ultimo_mensaje || (enCalif ? (fila(c).calificacion?.razon ?? "") : ""))}</span><span class="dmhace">${haceDm(c.actualizado)}</span></small></span>${sinLeer ? `<i class="dmpunto"></i>` : ""}</button>`;
	}).join("");
	const vacio = buscando ? (dms.buscando ? "Buscando…" : "No hay chats con eso.") : enCalif ? (dms.califCargando && !dms.calificados ? "Cargando…" : "Todavía no hay nadie calificado.") : dms.cargando ? "Cargando…" : "No hay chats acá.";
	const mas = !buscando && !enCalif && dms.siguiente ? `<button class="dmmas" data-dm-mas ${dms.cargando ? "disabled" : ""}>${dms.cargando ? "Cargando…" : "Ver más chats"}</button>` : "";
	return `${filas || `<div class="dmvacio">${vacio}</div>`}${mas}`;
}

// ---- Reporte del setter: cuántas conversaciones hubo, desde el 2 de noviembre ----
const TZ_LOCAL = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Argentina/Buenos_Aires";
const diaRep = d => new Intl.DateTimeFormat("en-CA", { timeZone: TZ_LOCAL, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
function rangoDe(periodo) {
	const hoy = new Date();
	const menos = n => new Date(hoy.getTime() - n * 86_400_000);
	const lunes = menos((hoy.getDay() + 6) % 7);
	if (periodo === "hoy") return [diaRep(hoy), diaRep(hoy)];
	if (periodo === "semana") return [diaRep(lunes), diaRep(hoy)];
	if (periodo === "mes") return [`${diaRep(hoy).slice(0, 8)}01`, diaRep(hoy)];
	if (periodo === "todo") return ["2026-11-01", diaRep(hoy)];
	return dms.rango ?? [diaRep(hoy), diaRep(hoy)];
}
const PERIODOS = [["mes", "Este mes"], ["semana", "Esta semana"], ["hoy", "Hoy"], ["todo", "Desde el 2/11"]];

async function cargarReporte() {
	const [desde, hasta] = rangoDe(dms.periodo);
	const r = await api(`/ig/embudo?${new URLSearchParams({ desde, hasta, tz: TZ_LOCAL })}`).catch(() => null);
	const d = r ? await r.json().catch(() => ({})) : {};
	dms.reporte = r?.ok ? d : { error: d.error ?? "No se pudo armar el reporte" };
	if (view.type === "dms" && dms.modo === "reporte") renderBody();
}

const fechaCorta = dia => new Date(`${dia}T12:00:00Z`).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" });
const minutosTexto = m => (m == null ? "—" : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 6) / 10} h`.replace(".", ",") : `${Math.round(m / 144) / 10} d`.replace(".", ","));

// La llamada de cada chat la marca la persona: pasa fuera de Instagram, y de ahí salen shows y cierres.
const LLAMADA_DM = [["", "Sin llamada"], ["agendo", "Agendó"], ["vino", "Vino"], ["no_vino", "No vino"], ["cerro", "Cerró"]];
function llamadaDmHtml(id) {
	const actual = dms.llamadas[id] ?? "";
	return `<label class="dmllamada ${actual ? `en ${actual}` : ""}"><select data-dm-llamada="${esc(id)}" aria-label="Qué pasó con la llamada">${LLAMADA_DM.map(([v, n]) => `<option value="${v}" ${v === actual ? "selected" : ""}>${n}</option>`).join("")}</select></label>`;
}

const pctRep = (a, b) => (b ? Math.round((a / b) * 100) : null);
const PASOS_EMBUDO = [
	["chats", "Chats"],
	["conversaciones", "Conversaciones"],
	["pitches", "Pitches"],
	["calendlys", "Calendlys enviados"],
	["shows", "Shows"],
	["cierres", "Cierres"],
];
// Los rangos sanos de Ops: fuera de rango es dónde mirar.
const zonaRep = (v, verde, amarillo) => (v == null ? "" : v >= verde ? "ok" : v >= amarillo ? "warn" : "alert");
function tasasEmbudo(r) {
	const show = pctRep(r.shows, r.shows + r.noShows);
	return [
		["Tasa de conversación", pctRep(r.conversaciones, r.chats), `${num(r.conversaciones)} de ${num(r.chats)} chats`, ""],
		["Pitch rate", pctRep(r.pitches, r.conversaciones), `${num(r.pitches)} de ${num(r.conversaciones)} conversaciones`, zonaRep(pctRep(r.pitches, r.conversaciones), 30, 20)],
		["Link enviado", pctRep(r.calendlys, r.pitches), `${num(r.calendlys)} de ${num(r.pitches)} pitches`, ""],
		["Show rate", show, `${num(r.shows)} de ${num(r.shows + r.noShows)} llamadas`, zonaRep(show, 80, 65)],
		["Close rate", pctRep(r.cierres, r.shows), `${num(r.cierres)} de ${num(r.shows)} shows`, zonaRep(pctRep(r.cierres, r.shows), 25, 15)],
	];
}

// Por dónde entraron los chats: un total solo esconde que el mes fue bueno por un lado y malo por el otro.
const ORIGEN_CHAT = { historias: "historia", reels: "reel", otros: "otro" };
const repartoChats = r => Object.keys(ORIGEN_CHAT).map(o => `${o} ${num(r.origenes?.[o] ?? 0)}`).join(" · ");

function textoReporte(r) {
	const titulo = PERIODOS.find(p => p[0] === dms.periodo)?.[1] ?? "Período";
	return [
		`Reporte de setting · ${titulo} (${fechaCorta(r.desde)}${r.hasta !== r.desde ? ` al ${fechaCorta(r.hasta)}` : ""})`,
		...PASOS_EMBUDO.map(([id, n]) => `${n}: ${num(r[id])}${id === "chats" && r.origenes ? ` (${repartoChats(r)})` : ""}`),
		...tasasEmbudo(r).map(([n, v, base]) => `${n}: ${v == null ? "—" : `${v} %`} (${base})`),
	].join("\n");
}

function reporteHtml() {
	const r = dms.reporte;
	const periodos = `<div class="rep-periodos" role="tablist">${PERIODOS.map(([id, n]) => `<button role="tab" aria-selected="${dms.periodo === id}" class="${dms.periodo === id ? "on" : ""}" data-rep-periodo="${id}">${n}</button>`).join("")}<span class="rep-rango"><label>Desde<input type="date" id="rep-desde" min="2026-11-02" value="${esc(rangoDe(dms.periodo)[0])}"></label><label>Hasta<input type="date" id="rep-hasta" min="2026-11-02" value="${esc(rangoDe(dms.periodo)[1])}"></label><button class="rep-actualizar" data-rep-actualizar ${dms.actualizando ? "disabled" : ""}>${ic("rotate-cw")}${dms.actualizando ? "Actualizando…" : "Actualizar"}</button></span></div>`;
	if (!r) return `<div class="rep">${periodos}<div class="dmvacio">Armando el reporte…</div></div>`;
	if (r.error) return `<div class="rep">${periodos}<div class="dmaviso">${esc(r.error)}</div></div>`;
	const reg = r.registro;
	const leyendo = reg.leyendo ? `<div class="rep-leyendo"><span class="apunto"></span>Leyendo el historial de los DMs: ${num(reg.leidas)} de ${num(reg.total)} conversaciones. Los números se completan solos.</div>` : !reg.conversaciones ? `<div class="rep-leyendo"><span class="apunto"></span>Empezando a leer el historial de los DMs…</div>` : "";
	const ANCHOS = [100, 84, 70, 58, 47, 38];
	const sub = { chats: r.origenes ? repartoChats(r) : "", calendlys: r.agendas ? `${num(r.agendas)} agendaron` : "", shows: r.noShows ? `${num(r.noShows)} no shows` : "" };
	const trapecios = PASOS_EMBUDO.map(([id, n], i) => {
		const w = ANCHOS[i];
		const recorte = i < ANCHOS.length - 1 ? ((w - ANCHOS[i + 1]) / 2) * (100 / w) : 0;
		const clip = i < ANCHOS.length - 1 ? `clip-path:polygon(0 0,100% 0,${100 - recorte}% 100%,${recorte}% 100%);` : "";
		return `<button class="emb-paso ${dms.repPaso === id ? "on" : ""}" style="width:${w}%;--tinta:var(--emb-${i});${clip}" data-rep-paso="${id}" aria-pressed="${dms.repPaso === id}"><small>${n}</small><b>${num(r[id])}</b>${sub[id] ? `<i>${esc(sub[id])}</i>` : ""}</button>`;
	}).join("");
	const tasas = tasasEmbudo(r).map(([n, v, base, zona]) => `<div class="emb-tasa"><span>${n}</span><b class="${zona}">${v == null ? "—" : `${v} %`}</b><small>${esc(base)}</small></div>`).join("");
	let lista = "";
	if (dms.repPaso) {
		const nombre = PASOS_EMBUDO.find(p => p[0] === dms.repPaso)?.[1] ?? "";
		const gente = [...(r.detalle?.[dms.repPaso] ?? []), ...(dms.repPaso === "shows" ? (r.detalle?.noShows ?? []).map(p => ({ ...p, noVino: true })) : [])];
		lista = `<div class="emb-lista"><div class="emb-lista-cab"><b>${esc(nombre)}</b><span>${num((r.detalle?.[dms.repPaso] ?? []).length)}${dms.repPaso === "shows" && r.noShows ? ` · ${num(r.noShows)} no vinieron` : ""}</span><span class="sp"></span><button class="lnk" data-rep-paso="">Cerrar</button></div><div class="emb-gente">${gente.length ? gente.map(p => `<button class="emb-persona" data-rep-chat="${esc(p.conversacion)}"><span>${esc(p.nombre || (p.usuario ? `@${p.usuario}` : "Usuario de Instagram"))}${p.usuario && p.nombre ? ` <small>@${esc(p.usuario)}</small>` : ""}${p.noVino ? ` <em>no vino</em>` : ""}${p.origen ? ` <i class="emb-origen">${ORIGEN_CHAT[p.origen] ?? ""}</i>` : ""}</span><small>${esc(fechaCorta(diaRep(new Date(p.fecha))))}</small></button>`).join("") : `<div class="dmvacio">Nadie en este paso.</div>`}</div></div>`;
	}
	const celda = v => `<td class="${v ? "" : "cero"}">${num(v)}</td>`;
	const filas = r.dias.slice().reverse().map(d => {
		const f = new Date(`${d.dia}T12:00:00Z`);
		const dia = f.toLocaleDateString("es-AR", { day: "numeric", month: "numeric", timeZone: "UTC" });
		const semana = f.toLocaleDateString("es-AR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
		return `<tr><th scope="row"><b>${esc(dia)}</b><small>${esc(semana)}</small></th>${PASOS_EMBUDO.map(([id]) => celda(d[id])).join("")}</tr>`;
	}).join("");
	const tablaDias = r.dias.length > 1 ? `<div class="rep-dias"><table><thead><tr><th>Día</th>${PASOS_EMBUDO.map(([id, n]) => `<th>${id === "calendlys" ? "Calendlys" : n}</th>`).join("")}</tr></thead><tbody>${filas}</tbody><tfoot><tr><th scope="row">Total</th>${PASOS_EMBUDO.map(([id]) => `<td>${num(r[id])}</td>`).join("")}</tr></tfoot></table></div>` : "";
	return `<div class="rep">${periodos}${leyendo}
		<div class="emb"><div class="emb-trap">${trapecios}</div><div class="emb-tasas">${tasas}</div></div>
		${lista}
		<div class="rep-acciones"><button class="b p" data-rep-copiar>${dms.copiado ? "Copiado" : "Copiar para el reporte"}</button></div>
		${tablaDias}
	</div>`;
}

// ---------- Contactos (Ventas): cada persona que escribió, con qué la trajo, su paso, su último contacto y sus notas ----------
const ctos = { datos: null, error: "", cargando: false, origen: "todos", busca: "", abierto: null, notas: {}, rol: "setter", borrador: "", guardando: false, aviso: "", mostrar: 100, pieza: null, paso: "todos" };
const PASOS_CTO = [["chat", "Chat"], ["conversacion", "Conversación"], ["pitch", "Pitch"], ["agenda", "Agenda"], ["show", "Show"], ["cierre", "Cierre"]];
const ORIGEN_CTO = { historia: "Historia", reel: "Reel", anuncio: "Anuncio", otros: "Otros" };

async function cargarContactos() {
	if (ctos.cargando) return;
	ctos.cargando = true;
	if (!ctos.datos) renderBody();
	const r = await api("/ig/contactos").catch(() => null);
	const d = r ? await r.json().catch(() => ({})) : {};
	ctos.cargando = false;
	if (r?.ok) {
		ctos.datos = d;
		ctos.error = "";
	} else ctos.error = r?.status === 404 ? "La base del equipo todavía no tiene Contactos: hay que actualizarla." : (d.error ?? "No se pudieron traer los contactos.");
	if (view.type === "dms" && dms.modo === "contactos") pintarContactos();
	else if (view.type === "dms" && dms.modo === "bandeja") renderBody();
}

async function traerNotasCto(usuario) {
	const r = await api(`/ig/notas?usuario=${encodeURIComponent(usuario)}`).catch(() => null);
	if (!r?.ok) return;
	ctos.notas[usuario] = (await r.json().catch(() => ({}))).notas ?? [];
	if (ctos.abierto === usuario && view.type === "dms" && dms.modo === "contactos") pintarContactos();
}

/** Repinta sin perder lo que se está escribiendo en el buscador o en la nota. */
function pintarContactos() {
	const activo = document.activeElement?.id;
	const pos = activo === "cto-busca" || activo === "cto-nota" ? document.activeElement.selectionStart : null;
	renderBody();
	if (activo === "cto-busca" || activo === "cto-nota") {
		const campo = document.getElementById(activo);
		if (campo) {
			campo.focus();
			if (pos != null) campo.setSelectionRange(pos, pos);
		}
	}
}

const origenCto = c => c.entradas?.[0]?.origen ?? "otros";
function relCto(iso) {
	if (!iso) return "—";
	const d = new Date(iso);
	const dias = Math.round((new Date(new Date().toDateString()) - new Date(d.toDateString())) / 864e5);
	const h = hora(iso);
	if (dias <= 0) return `hoy ${h}`;
	if (dias === 1) return `ayer ${h}`;
	if (dias < 7) return `hace ${dias} días`;
	return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}
const diaCto = iso => (iso ? new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) : "—");

/** El estado que se ve en la fila: el paso más alto, y aparte el que agendó y no vino. */
const estadoCto = c => (c.no_vino ? "no_vino" : c.paso);
const ESTADOS_CTO = [...PASOS_CTO.slice(0, 4), ["no_vino", "No vino"], ...PASOS_CTO.slice(4)];
const dePiezaCto = c => !ctos.pieza || c.entradas.some(en => ctos.pieza.ids.includes(en.historia) || ctos.pieza.ids.includes(en.reel) || (ctos.pieza.palabra && !en.reel && (en.palabra ?? "").toLowerCase() === ctos.pieza.palabra));
function filtradosCto({ origen = ctos.origen, paso = ctos.paso } = {}) {
	const q = ctos.busca.trim().toLowerCase().replace(/^@/, "");
	return (ctos.datos?.contactos ?? []).filter(c => (origen === "todos" || origenCto(c) === origen) && (paso === "todos" || estadoCto(c) === paso) && dePiezaCto(c) && (!q || c.usuario.includes(q) || (c.nombre ?? "").toLowerCase().includes(q)));
}

/** La pieza que trajo a la persona, en una línea: la miniatura, qué fue y el dato que falta si falta. */
function piezaCto(e, grande = false) {
	const p = (e.historia && ctos.datos?.piezas?.[e.historia]) || (e.reel && ctos.datos?.piezas?.[e.reel]) || null;
	let img = "";
	if (e.origen === "historia" && p?.miniatura) {
		const src = scoped(`/media/historias/${p.miniatura}`);
		img = grande ? `<button class="cto-th" data-dm-media="imagen" data-src="${esc(src)}" aria-label="Ver la historia"><img src="${esc(src)}" alt="" loading="lazy"></button>` : `<span class="cto-th"><img src="${esc(src)}" alt="" loading="lazy"></span>`;
	} else if (e.origen === "reel" && p?.miniatura) img = `<span class="cto-th"><img src="${esc(p.miniatura)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`;
	else img = `<span class="cto-th vacia">${ic(e.origen === "otros" ? "inbox" : e.origen === "anuncio" ? "activity" : "instagram")}</span>`;
	let titulo;
	let sub;
	if (e.origen === "historia") {
		titulo = e.historia && e.historia !== "1" ? `Historia del ${diaCto(p?.fecha ?? e.fecha)}` : "Una historia";
		sub = e.historia === "1" ? "Instagram no dijo cuál" : p?.miniatura ? "Respondió a la historia" : "Sin copia guardada";
	} else if (e.origen === "reel") {
		titulo = p?.texto ? `Reel «${p.texto.slice(0, 48)}${p.texto.length > 48 ? "…" : ""}»` : "Reel";
		sub = `${e.palabra ? `Escribió «${e.palabra}»` : ""}${e.reel ? "" : `${e.palabra ? " · " : ""}la palabra no es de un solo reel`}`;
	} else if (e.origen === "anuncio") {
		titulo = e.anuncio?.nombre || (e.anuncio?.id ? `Anuncio ${e.anuncio.id}` : "Anuncio");
		sub = e.anuncio ? (e.anuncio.campana ? `Campaña ${e.anuncio.campana}` : "Vino de un anuncio") : "Sin el dato de cuál anuncio";
	} else {
		titulo = "Otros";
		sub = "DM directo o desde la bio";
	}
	return `<span class="cto-pz">${img}<span><b>${esc(titulo)}</b><small>${esc(sub)}</small></span></span>`;
}

function pasosCto(c) {
	const i = PASOS_CTO.findIndex(([id]) => id === c.paso);
	const rayas = PASOS_CTO.map((_, k) => `<i class="${k < i ? "h" : k === i ? (c.no_vino ? "x" : c.paso === "cierre" ? "h" : "a") : ""}"></i>`).join("");
	return `<div class="cto-rayas">${rayas}</div><div class="cto-paso ${c.no_vino ? "x" : ""}">${c.no_vino ? "Agendó, no vino" : PASOS_CTO[i]?.[1] ?? ""}</div>`;
}

function filaCto(c) {
	const n = c.ultima_nota;
	return `<tr data-cto-abrir="${esc(c.usuario)}" class="${ctos.abierto === c.usuario ? "on" : ""}">
		<td><div class="cto-who">${caraDm({ nombre: c.nombre, usuario: c.usuario, foto: dms.lista.find(x => x.id === c.conversacion)?.foto }, "chica")}<span><b>${esc(c.nombre || `@${c.usuario}`)}</b><small>@${esc(c.usuario)}</small></span></div></td>
		<td>${piezaCto(c.entradas[0])}</td>
		<td>${pasosCto(c)}</td>
		<td class="cto-fecha">${esc(relCto(c.ultimo.fecha))}<small>${c.ultimo.de === "lead" ? "escribió la persona" : "escribió la cuenta"}</small></td>
		<td>${n ? `<div class="cto-nota1"><em>${esc(n.autor)}:</em> ${esc(n.texto)}</div>` : `<span class="cto-sin">Sin notas</span>`}</td>
		<td><button class="b" data-cto-chat="${esc(c.conversacion)}" data-usuario="${esc(c.usuario)}">Chat</button></td></tr>`;
}

function fichaCto(c) {
	const [primera, ...otras] = c.entradas;
	const i = PASOS_CTO.findIndex(([id]) => id === c.paso);
	const linea = PASOS_CTO.map(([id, n], k) => {
		const cls = k < i ? "h" : k === i ? (c.no_vino ? "x" : c.paso === "cierre" ? "h" : "a") : "";
		const fecha = id === "agenda" && c.no_vino ? c.fechas.agenda : c.fechas[id];
		return `<div class="cto-lp ${cls}" title="${n}"><i></i><b>${id === "agenda" && c.no_vino ? "No vino" : id === "conversacion" ? "Conv." : n}</b><small>${diaCto(fecha)}${id === "pitch" && c.fechas.link ? " · link" : ""}</small></div>`;
	}).join("");
	const notas = ctos.notas[c.usuario];
	const listaNotas = notas == null ? `<div class="cto-sin">Cargando…</div>` : notas.length ? notas.map(n => `<div class="cto-n"><small><span class="cto-rol">${n.rol === "closer" ? "Closer" : "Setter"}</span><b>${esc(n.autor)}</b>${esc(relCto(n.fecha))}<span class="sp"></span><button class="lnk" data-cto-borrar="${n.id}">Borrar</button></small><span>${esc(n.texto)}</span></div>`).join("") : `<div class="cto-sin">Todavía nadie anotó nada.</div>`;
	const cal = c.calificacion;
	const calHtml = cal && cal.veredicto !== "pendiente" ? `<div class="cto-cal"><b class="${cal.veredicto === "calificado" ? "si" : ""}">${cal.veredicto === "calificado" ? "Calificado" : "No califica"}${cal.puntaje != null ? ` · ${Number(cal.puntaje).toFixed(1)}` : ""}</b><span>${esc(cal.razon ?? "")}</span></div>` : `<div class="cto-sin">Sin calificar todavía</div>`;
	return `<div class="cto-ficha">
		<div class="cto-fcab">${caraDm({ nombre: c.nombre, usuario: c.usuario, foto: dms.lista.find(x => x.id === c.conversacion)?.foto })}<span><b>${esc(c.nombre || `@${c.usuario}`)}</b><small>@${esc(c.usuario)}${c.conversaciones.length > 1 ? ` · ${c.conversaciones.length} chats` : ""}</small></span><button class="ic" data-cto-cerrar aria-label="Cerrar">${ic("x")}</button></div>
		<div class="cto-acc"><button class="b p" data-cto-chat="${esc(c.conversacion)}" data-usuario="${esc(c.usuario)}">Abrir conversación</button><button class="b" data-dm-web="https://www.instagram.com/${esc(c.usuario)}/">Ver perfil</button></div>
		<section><h4>Qué lo trajo</h4><div class="cto-caja">${piezaCto(primera, true)}<div class="cto-cuando">Entró el ${diaCto(primera.fecha)} a las ${hora(primera.fecha)}${primera.reel || (primera.historia && primera.historia !== "1") ? ` <button class="lnk" data-ctn-ver="${esc(primera.reel ?? primera.historia)}">Ver la pieza en Contenido</button>` : ""}</div>${otras.length ? `<div class="cto-reent"><span>También entró por</span>${otras.map(e => `<span class="cto-chip">${ORIGEN_CTO[e.origen]} · ${diaCto(e.fecha)}</span>`).join("")}</div>` : ""}</div></section>
		<section><h4>Paso del embudo</h4><div class="cto-caja"><div class="cto-linea">${linea}</div><div class="cto-cuando">Chat a pitch salen de los mensajes. Agenda, show y cierre se marcan en el chat.</div></div></section>
		<section><h4>Último contacto</h4><div class="cto-ult"><b>${esc(relCto(c.ultimo.fecha))}</b><span>${c.ultimo.de === "lead" ? "· escribió la persona" : "· escribió la cuenta"}</span></div></section>
		<section><h4>Notas del setter y del closer</h4><div class="cto-notas">${listaNotas}
			<div class="cto-nueva"><select id="cto-rol" aria-label="Quién anota">${["setter", "closer"].map(r => `<option value="${r}" ${ctos.rol === r ? "selected" : ""}>${r === "setter" ? "Setter" : "Closer"}</option>`).join("")}</select><textarea id="cto-nota" rows="2" maxlength="2000" placeholder="Anotar algo de esta persona…">${esc(ctos.borrador)}</textarea><button class="b p" data-cto-anotar="${esc(c.usuario)}" ${ctos.guardando ? "disabled" : ""}>${ctos.guardando ? "Guardando…" : "Guardar"}</button></div>
			${ctos.aviso ? `<div class="cto-aviso">${esc(ctos.aviso)}</div>` : ""}</div></section>
		<section><h4>Calificación del Setter</h4>${calHtml}</section>
	</div>`;
}

function contactosVentasHtml() {
	if (!ctos.datos) return `<div class="dmvacio">${ctos.error ? esc(ctos.error) : "Cargando contactos…"}</div>`;
	const todos = ctos.datos.contactos ?? [];
	// Cada número cuenta con los otros filtros puestos: es lo que se va a ver al tocarlo.
	const chip = (attr, id, n, on, cuantos) => `<button class="cto-f ${on ? "on" : ""}" ${attr}="${id}" aria-pressed="${on}">${n} <b>${num(cuantos)}</b></button>`;
	const chips = [["todos", "Todos"], ["historia", "Historia"], ["reel", "Reel"], ["anuncio", "Anuncio"], ["otros", "Otros"]].map(([id, n]) => chip("data-cto-origen", id, n, ctos.origen === id, filtradosCto({ origen: id }).length)).join("");
	const pasos = [["todos", "Todos los pasos"], ...ESTADOS_CTO].map(([id, n]) => chip("data-cto-paso", id, n, ctos.paso === id, filtradosCto({ paso: id }).length)).join("");
	const lista = filtradosCto();
	const filas = lista.slice(0, ctos.mostrar).map(filaCto).join("");
	const abierto = todos.find(c => c.usuario === ctos.abierto);
	const leyendo = ctos.datos.registro?.leyendo ? `<span class="cto-leyendo">Leyendo DMs nuevos…</span>` : "";
	return `<div class="cto">
		<div class="cto-cab"><b>${num(todos.length)} contactos</b><small>desde el ${new Date(ctos.datos.inicio).toLocaleDateString("es-AR", { day: "numeric", month: "numeric", timeZone: "UTC" })}</small>${leyendo}<span class="sp"></span><div class="cto-fs">${chips}</div><label class="dmbusca cto-busca">${ic("search")}<input id="cto-busca" type="search" placeholder="Buscar por nombre o @" value="${esc(ctos.busca)}" autocomplete="off" spellcheck="false"></label></div>
		${ctos.error ? `<div class="cto-aviso">${esc(ctos.error)}</div>` : ""}
		<div class="cto-cab cto-pasos"><div class="cto-fs">${pasos}</div></div>
		${ctos.pieza ? `<div class="cto-aviso cto-pieza"><span>Los que escribieron por “${esc(ctos.pieza.titulo)}”: ${num(lista.length)} ${lista.length === 1 ? "contacto" : "contactos"}</span><button class="lnk" data-cto-pieza>Ver todos</button></div>` : ""}
		<div class="cto-tabla">${lista.length ? `<table><thead><tr><th>Contacto</th><th>Qué lo trajo</th><th>Paso</th><th>Último contacto</th><th>Última nota</th><th></th></tr></thead><tbody>${filas}</tbody></table>${lista.length > ctos.mostrar ? `<div class="cto-mas"><button class="b" data-cto-mas>Ver ${num(Math.min(100, lista.length - ctos.mostrar))} más</button></div>` : ""}` : `<div class="dmvacio">${todos.length ? "Nadie con ese filtro." : "Todavía no escribió nadie desde que se guarda el registro."}</div>`}</div>
		<aside class="cto-drawer ${abierto ? "on" : ""}">${abierto ? fichaCto(abierto) : ""}</aside>
	</div>`;
}

document.addEventListener("click", async e => {
	const t = e.target.closest("[data-cto-abrir],[data-cto-cerrar],[data-cto-chat],[data-cto-origen],[data-cto-mas],[data-cto-anotar],[data-cto-borrar],[data-cto-pieza],[data-cto-paso]");
	if (!t) return;
	if (t.dataset.ctoPaso) {
		Object.assign(ctos, { paso: t.dataset.ctoPaso, mostrar: 100 });
		return pintarContactos();
	}
	if ("ctoPieza" in t.dataset) {
		ctos.pieza = null;
		return pintarContactos();
	}
	if (t.dataset.ctoChat) {
		// El chat de la Bandeja, tal como es. Si no está entre los cargados, se lo busca por su @ para que aparezca.
		e.stopPropagation();
		const id = t.dataset.ctoChat;
		const usuario = t.dataset.usuario ?? "";
		dms.modo = "bandeja";
		if (!dms.lista.some(x => x.id === id)) {
			// Se muestra ya con lo que se sabe del contacto; la búsqueda trae después la fila completa (foto, link).
			const c = ctos.datos?.contactos?.find(x => x.conversaciones?.includes(id));
			dms.busca = usuario;
			dms.buscando = false;
			dms.resultados = [{ id, usuario, nombre: c?.nombre ?? null, sin_leer: 0, link: null, foto: null, vino_de_un_anuncio: c?.entradas?.[0]?.origen === "anuncio" }];
			void api(`/ig/buscar?q=${encodeURIComponent(usuario)}`)
				.then(r => (r.ok ? r.json() : null))
				.then(d => {
					const real = d?.conversaciones?.find(x => x.id === id);
					if (!real || dms.busca !== usuario) return;
					dms.resultados = [real, ...d.conversaciones.filter(x => x.id !== id)];
					if (view.type === "dms") renderBody();
				})
				.catch(() => {});
		}
		renderBody();
		return void abrirChatDm(id);
	}
	if (t.dataset.ctoOrigen) {
		ctos.origen = t.dataset.ctoOrigen;
		ctos.mostrar = 100;
		return pintarContactos();
	}
	if ("ctoMas" in t.dataset) {
		ctos.mostrar += 100;
		return pintarContactos();
	}
	if ("ctoCerrar" in t.dataset) {
		ctos.abierto = null;
		return pintarContactos();
	}
	if (t.dataset.ctoAbrir) {
		const u = t.dataset.ctoAbrir;
		ctos.abierto = ctos.abierto === u ? null : u;
		ctos.borrador = "";
		ctos.aviso = "";
		pintarContactos();
		if (ctos.abierto) void traerNotasCto(u);
		return;
	}
	if (t.dataset.ctoAnotar && !ctos.guardando) {
		const usuario = t.dataset.ctoAnotar;
		const texto = (document.getElementById("cto-nota")?.value ?? ctos.borrador).trim();
		if (!texto) return;
		ctos.guardando = true;
		ctos.aviso = "";
		pintarContactos();
		const r = await api("/ig/notas", { method: "POST", body: JSON.stringify({ usuario, rol: ctos.rol, texto }) }).catch(() => null);
		const d = r ? await r.json().catch(() => ({})) : {};
		ctos.guardando = false;
		if (r?.ok) {
			// El repintado devuelve lo que había en los campos: lo guardado se borra a mano.
			ctos.borrador = "";
			const caja = document.getElementById("cto-nota");
			if (caja) caja.value = "";
			ctos.notas[usuario] = [...(ctos.notas[usuario] ?? []), d];
			const c = ctos.datos?.contactos?.find(x => x.usuario === usuario);
			if (c) Object.assign(c, { notas: (c.notas ?? 0) + 1, ultima_nota: d });
		} else ctos.aviso = r?.status === 404 ? "La base del equipo todavía no guarda notas: hay que actualizarla." : (d.error ?? "No se pudo guardar la nota.");
		return pintarContactos();
	}
	if (t.dataset.ctoBorrar) {
		const usuario = ctos.abierto;
		const r = await api(`/ig/notas/${t.dataset.ctoBorrar}`, { method: "DELETE" }).catch(() => null);
		if (!r?.ok) {
			ctos.aviso = "No se pudo borrar la nota.";
			return pintarContactos();
		}
		ctos.notas[usuario] = (ctos.notas[usuario] ?? []).filter(n => String(n.id) !== t.dataset.ctoBorrar);
		const c = ctos.datos?.contactos?.find(x => x.usuario === usuario);
		if (c) Object.assign(c, { notas: ctos.notas[usuario].length, ultima_nota: ctos.notas[usuario].at(-1) ?? null });
		return pintarContactos();
	}
});
document.addEventListener("input", e => {
	if (e.target.id === "cto-nota") ctos.borrador = e.target.value;
	if (e.target.id === "cto-busca") {
		ctos.busca = e.target.value;
		ctos.mostrar = 100;
		pintarContactos();
	}
});
document.addEventListener("change", e => {
	if (e.target.id === "cto-rol") ctos.rol = e.target.value;
});
document.addEventListener("keydown", e => {
	if (e.key === "Escape" && ctos.abierto && view.type === "dms" && dms.modo === "contactos" && !document.querySelector(".dmvisor")) {
		ctos.abierto = null;
		pintarContactos();
	}
});

function dmsHtml() {
	if (!state.instagram?.connected) return `<div class="empty"><b>Instagram no está conectado</b>Conectalo en Ajustes, Conexiones.</div>`;
	const modos = ventasModos(dms.modo);
	if (dms.modo === "reporte") return `<div class="dmsrep">${modos}${reporteHtml()}</div>`;
	if (dms.modo === "contactos") return `<div class="dmsrep ctos">${modos}${contactosVentasHtml()}</div>`;
	// Oportunidades (08-y-oportunidades.js): el centro comercial. La bandeja de chats vieja (dmsBandejaHtml) quedó sin usar.
	return `<div class="dmsrep">${modos}${oportunidadesHtml()}</div>`;
}

/** Las pestañas de Ventas, iguales en los cuatro modos y arriba de todo (en la columna de chats no entran). */
function ventasModos(actual) {
	const pestanas = [["bandeja", "Oportunidades"], ["reporte", "Reporte"], ["contactos", "Contactos"], ["auto", "Automatizaciones"]];
	// Arriba, el nombre de la sección y la cuenta, y al lado las pestañas en la cápsula del Classroom (atv.css).
	return `<div class="vt-cab"><span class="vt-tit"><b>Ventas</b><small>@${esc(state.instagram?.username ?? "")} · Instagram</small></span><div class="dmmodos" role="tablist">${pestanas.map(([id, n]) => `<button role="tab" aria-selected="${actual === id}" class="${actual === id ? "on" : ""}" ${id === "auto" ? `data-view="auto"` : `data-dm-modo="${id}"`}>${n}</button>`).join("")}</div></div>`;
}

function dmsBandejaHtml() {
	const columna = `<aside class="dmlista">
		<div class="dmcab"><b>@${esc(state.instagram.username ?? "")}</b></div>
		<label class="dmbusca">${ic("search")}<input id="dm-busca" type="search" placeholder="Buscar por nombre, @ o palabra" value="${esc(dms.busca)}" autocomplete="off" spellcheck="false"></label>
		<div class="dmpest">${PESTANAS_DM.map(([id, n]) => `<button class="${dms.pestana === id ? "on" : ""}" data-dm-pestana="${id}">${n}</button>`).join("")}</div>
		<div class="dmfilas">${filasDmsHtml()}</div>
	</aside>`;
	const c = dms.lista.find(x => x.id === dms.abierto) ?? dms.resultados?.find(x => x.id === dms.abierto);
	const chat = c && dms.chats[c.id];
	if (!c) return `<div class="dms">${columna}<section class="dmchat vacio"><div class="dmvacio grande">${ic("instagram")}<b>Tus mensajes</b><span>Elegí un chat.</span></div></section></div>`;
	const v = ventanaDm(chat?.mensajes);
	const caja = chat?.mensajes && !chat.cargando
		? v.puede
			? `<div class="dmescribir"><textarea id="dm-escribir" rows="1" placeholder="Mensaje…" maxlength="1000">${esc(dms.borrador[c.id] ?? "")}</textarea><button class="dmmandar" data-dm-mandar="${esc(c.id)}">Enviar</button></div>${v.nota ? `<div class="dmnota">${esc(v.nota)}</div>` : ""}`
			: `<div class="dmnota cerrada">${esc(v.nota)}${c.link ? ` <button class="dmnota-link" data-dm-web="${esc(c.link)}">Abrir en Instagram</button>` : ""}</div>`
		: "";
	const panel = `<section class="dmchat">
		<div class="dmchatcab"><button class="dmvolver" data-dm-volver aria-label="Volver a los chats">${ic("chevron-left")}</button>${caraDm(c, "chica")}<span class="dmtx"><b>${esc(c.nombre || "Usuario de Instagram")}${tildeDm(fila(c))}</b><small>${[c.usuario ? `@${esc(c.usuario)}` : "", seguidoresDm(fila(c)), relacionDm(fila(c)), c.vino_de_un_anuncio ? "vino de un anuncio" : ""].filter(Boolean).join(" · ")}</small></span>
		${llamadaDmHtml(c.id)}${c.link ? `<button class="b ghost" data-dm-web="${esc(c.link)}">Abrir en Instagram</button>` : ""}<button class="b p" data-dm-revisar="${esc(c.id)}" ${dms.revisando ? "disabled" : ""}>${dms.revisando ? "Pidiendo…" : "Revisar este setteo"}</button></div>
		${calificacionHtml(fila(c))}
		${dms.aviso ? `<div class="dmaviso">${esc(dms.aviso)}</div>` : ""}
		<div class="dmmsgs" id="dm-msgs">${(dmUltimo = { id: c.id, html: chat?.cargando ? `<div class="dmvacio">Cargando el chat…</div>` : chat?.error ? `<div class="dmvacio">${esc(chat.error)}</div>` : burbujasDm(chat?.mensajes ?? []) + pendientesDm(c.id, chat?.mensajes ?? []) }).html}</div>
		${caja}
	</section>`;
	return `<div class="dms">${columna}${panel}</div>`;
}

// Lo que se mandó desde acá aparece al instante, como en Instagram, y se manda de fondo.
/** Los errores de Meta al mandar un DM, dichos para el dueño (vienen en inglés y con códigos). */
function errorDm(e) {
	const t = String(e ?? "");
	if (/2534037|conversation routing|another receiver/i.test(t))
		return "Instagram tiene esta charla asignada a otra herramienta (por ejemplo ManyChat), y por eso no deja responder desde acá. Para responder desde Leverage, en Facebook entrá como la página vinculada a este Instagram, andá a Configuración → Mensajes avanzados → Enrutamiento de conversaciones de Instagram y elegí Zernio como receptor predeterminado. Mientras tanto, se puede responder desde la app de Instagram.";
	if (/temporarily blocked|blocked from taking this action|action is blocked/i.test(t))
		return "Instagram restringió temporalmente el envío de mensajes desde esta cuenta. Vas a poder responder cuando levante la restricción. En la app de Instagram, en Configuración → Estado de la cuenta, figura hasta cuándo dura.";
	return t;
}
// Queda pintado hasta que la conexión lo devuelve en el chat.
function pendientesDm(id, mensajes) {
	const lista = (dms.pendientes[id] ?? []).filter(p => p.estado === "error" || (p.estado === "yendo" || Date.now() - p.desde < 90_000) && !mensajes.some(m => m.quien === "nosotros" && m.texto === p.texto && Date.parse(m.fecha ?? "") >= p.desde - 120_000));
	dms.pendientes[id] = lista;
	return lista.map(p => `<div class="dmmsg mio ${p.estado === "error" ? "fallo" : p.estado === "yendo" ? "yendo" : ""}" ${p.estado === "yendo" ? 'title="Enviando…"' : ""}>${esc(p.texto)}</div>${p.estado === "error" ? `<div class="dmfallo">No se mandó: ${esc(errorDm(p.error))} <button data-dm-reintentar="${esc(p.clave)}">Reintentar</button></div>` : ""}`).join("");
}

async function enviarPendiente(id, p) {
	p.estado = "yendo";
	const r = await api("/ig/enviar", { method: "POST", body: JSON.stringify({ id, texto: p.texto, clave: p.clave }) }).catch(() => null);
	const d = r ? await r.json().catch(() => ({})) : {};
	if (!r?.ok) {
		p.estado = "error";
		p.error = d.error ?? "no respondió";
	} else {
		p.estado = "ok";
		// Lo que guardó Instagram, con su hora, reemplaza al que se pintó a mano.
		setTimeout(() => dms.abierto === id && void abrirChatDm(id), 1500);
	}
	if (dms.abierto === id) renderBody();
}

// Fotos, videos e historias se ven encima del chat, sin salir de Leverage. Escape o un clic afuera lo cierra.
function verMediaDm(tipo, src) {
	cerrarMediaDm();
	const capa = document.createElement("div");
	capa.className = "dmvisor";
	capa.innerHTML = `${tipo === "video" ? `<video src="${esc(src)}" controls autoplay playsinline></video>` : `<img src="${esc(src)}" alt="" referrerpolicy="no-referrer">`}<button class="dmvisor-x" aria-label="Cerrar">${ic("x")}</button>`;
	capa.addEventListener("click", e => {
		if (e.target === capa || e.target.closest(".dmvisor-x")) cerrarMediaDm();
	});
	document.body.append(capa);
	// Leer el ancho fija el estado inicial: así el fundido arranca de 0 aunque la ventana no esté pintando cuadros.
	void capa.offsetWidth;
	capa.classList.add("on");
}
function cerrarMediaDm() {
	document.querySelector(".dmvisor")?.remove();
}
document.addEventListener("keydown", e => {
	if (e.key === "Escape" && document.querySelector(".dmvisor")) {
		e.stopImmediatePropagation();
		cerrarMediaDm();
	}
}, true);
// Los links de Instagram van al navegador de Leverage; fuera de la app, a una pestaña nueva.
document.addEventListener("click", e => {
	const t = e.target.closest("[data-dm-media],[data-dm-web]");
	if (!t) return;
	e.preventDefault();
	if (t.dataset.dmMedia) return verMediaDm(t.dataset.dmMedia, t.dataset.src);
	if (IN_APP) abrirEnNavegador(t.dataset.dmWeb);
	else window.open(t.dataset.dmWeb, "_blank", "noopener");
});

function mandarDm(id) {
	const campo = document.getElementById("dm-escribir");
	const texto = (campo?.value ?? dms.borrador[id] ?? "").trim();
	if (!texto) return;
	const p = { texto, clave: crypto.randomUUID(), desde: Date.now(), estado: "yendo" };
	(dms.pendientes[id] ??= []).push(p);
	dms.borrador[id] = "";
	const fila = dms.lista.find(x => x.id === id);
	if (fila) Object.assign(fila, { ultimo_mensaje: texto, actualizado: new Date().toISOString(), sin_leer: 0 });
	dms.sinLeer = dms.lista.filter(sinLeerDm).length;
	dms.aviso = "";
	dms.bajar = true;
	renderBody();
	renderSide();
	// Repintar devuelve lo que había escrito en los campos: lo mandado se borra a mano.
	const caja = document.getElementById("dm-escribir");
	if (caja) {
		caja.value = "";
		caja.style.height = "";
		caja.focus();
	}
	void enviarPendiente(id, p);
}

document.addEventListener("click", async e => {
	const r = e.target.closest("[data-dm-modo],[data-rep-periodo],[data-rep-actualizar],[data-rep-copiar],[data-rep-paso],[data-rep-chat],[data-dm-calificar]");
	if (!r) return;
	if (r.dataset.dmCalificar) {
		const usuario = r.dataset.dmCalificar;
		dms.calificando = usuario;
		renderBody();
		const res = await api("/ig/calificar", { method: "POST", body: JSON.stringify({ usuario }) }).catch(() => null);
		const d = res ? await res.json().catch(() => ({})) : {};
		if (!res?.ok) {
			dms.calificando = null;
			dms.aviso = d.error ?? "No se pudo pedir";
			return renderBody();
		}
		// El Setter tarda un rato: se vuelve a mirar cada 15 segundos durante 5 minutos.
		let vueltas = 0;
		const mirar = setInterval(async () => {
			await traerCalificacion(usuario);
			if (++vueltas > 20 || (dms.calif[usuario] && dms.calif[usuario].veredicto !== "pendiente")) {
				clearInterval(mirar);
				if (dms.calificando === usuario) dms.calificando = null;
				renderBody();
			}
		}, 15_000);
		return;
	}
	if (r.dataset.dmModo) {
		dms.modo = r.dataset.dmModo;
		// Desde Automatizaciones se vuelve a la vista de DMs en el modo elegido.
		if (view.type !== "dms") go({ type: "dms" });
		else renderBody();
		if (dms.modo === "reporte") void cargarReporte();
		if (dms.modo === "contactos") void cargarContactos();
		return;
	}
	if (r.dataset.repPeriodo) {
		dms.periodo = r.dataset.repPeriodo;
		dms.reporte = null;
		renderBody();
		return void cargarReporte();
	}
	if ("repActualizar" in r.dataset && !dms.actualizando) {
		// Que la base lea ya los DMs que se movieron, y traer el reporte cuando termine (o a los 2 minutos).
		dms.actualizando = true;
		renderBody();
		await api("/ig/registro/leer", { method: "POST" }).catch(() => null);
		for (let vuelta = 0; vuelta < 40; vuelta++) {
			await cargarReporte();
			if (!dms.reporte?.registro?.leyendo) break;
			await new Promise(x => setTimeout(x, 3000));
		}
		void traerLlamadasDm();
		dms.actualizando = false;
		return renderBody();
	}
	if ("repPaso" in r.dataset) {
		dms.repPaso = r.dataset.repPaso && dms.repPaso !== r.dataset.repPaso ? r.dataset.repPaso : null;
		return renderBody();
	}
	if (r.dataset.repChat) {
		// El chat de la Bandeja, tal como es. Si no está entre los cargados (casi todos los del mes), se muestra ya con lo
		// que el reporte sabe de esa persona y se lo busca por su @ para traer la fila completa (foto, link).
		const id = r.dataset.repChat;
		dms.modo = "bandeja";
		if (!dms.lista.some(x => x.id === id)) {
			const persona = Object.values(dms.reporte?.detalle ?? {}).flat().find(x => x?.conversacion === id);
			const usuario = persona?.usuario ?? "";
			dms.busca = usuario;
			dms.buscando = false;
			dms.resultados = [{ id, usuario: usuario || null, nombre: persona?.nombre ?? null, sin_leer: 0, link: null, foto: null, vino_de_un_anuncio: persona?.origen === "anuncio" }];
			if (usuario)
				void api(`/ig/buscar?q=${encodeURIComponent(usuario)}`)
					.then(x => (x.ok ? x.json() : null))
					.then(d => {
						const real = d?.conversaciones?.find(x => x.id === id);
						if (!real || dms.busca !== usuario) return;
						dms.resultados = [real, ...d.conversaciones.filter(x => x.id !== id)];
						if (view.type === "dms") renderBody();
					})
					.catch(() => {});
		}
		renderBody();
		return void abrirChatDm(id);
	}
	if ("repCopiar" in r.dataset && dms.reporte && !dms.reporte.error) {
		await navigator.clipboard.writeText(textoReporte(dms.reporte)).catch(() => {});
		dms.copiado = true;
		renderBody();
		setTimeout(() => {
			dms.copiado = false;
			renderBody();
		}, 1800);
	}
});
document.addEventListener("change", async e => {
	const llamada = e.target.dataset?.dmLlamada;
	if (llamada) {
		const antes = dms.llamadas[llamada] ?? "";
		const estado = e.target.value || null;
		dms.llamadas = { ...dms.llamadas, [llamada]: estado ?? undefined };
		renderBody();
		const r = await api(`/ig/llamada/${encodeURIComponent(llamada)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ estado }) }).catch(() => null);
		const d = r ? await r.json().catch(() => ({})) : {};
		dms.llamadas = { ...dms.llamadas, [llamada]: r?.ok ? (d.estado ?? undefined) : antes || undefined };
		if (!r?.ok) dms.aviso = d.error ?? "No se pudo guardar la llamada";
		return renderBody();
	}
	if (e.target.id !== "rep-desde" && e.target.id !== "rep-hasta") return;
	const desde = document.getElementById("rep-desde")?.value;
	const hasta = document.getElementById("rep-hasta")?.value;
	if (!desde || !hasta) return;
	dms.periodo = "rango";
	dms.rango = desde <= hasta ? [desde, hasta] : [hasta, desde];
	dms.reporte = null;
	renderBody();
	void cargarReporte();
});

document.addEventListener("click", async e => {
	const t = e.target.closest("[data-dm],[data-dm-pestana],[data-dm-mas],[data-dm-revisar],[data-dm-volver],[data-dm-mandar],[data-dm-reintentar]");
	if (!t) return;
	if (t.dataset.dmReintentar) {
		const p = (dms.pendientes[dms.abierto] ?? []).find(x => x.clave === t.dataset.dmReintentar);
		if (p) {
			renderBody();
			return void enviarPendiente(dms.abierto, p);
		}
		return;
	}
	if ("dmVolver" in t.dataset) {
		dms.abierto = null;
		return renderBody();
	}
	if (t.dataset.dmMandar) return void mandarDm(t.dataset.dmMandar);
	if (t.dataset.dm) return void abrirChatDm(t.dataset.dm);
	if (t.dataset.dmPestana) {
		dms.pestana = t.dataset.dmPestana;
		if (dms.pestana === "calificados") void cargarCalificadosDms();
		return renderBody();
	}
	if ("dmMas" in t.dataset) return void cargarBandejaDms(true);
	const c = dms.lista.find(x => x.id === t.dataset.dmRevisar) ?? dms.resultados?.find(x => x.id === t.dataset.dmRevisar);
	dms.revisando = true;
	renderBody();
	const r = await api("/ig/revisar", { method: "POST", body: JSON.stringify({ id: t.dataset.dmRevisar, nombre: c?.nombre || c?.usuario }) }).catch(() => null);
	const d = r ? await r.json().catch(() => ({})) : {};
	dms.revisando = false;
	if (r?.ok) return go({ type: "agent", id: d.agente });
	dms.aviso = d.error ?? "No se pudo pedir la revisión";
	renderBody();
});
// El chat de Instagram queda abajo mientras no subas a leer: una foto o un video que termina de cargar no lo mueve.
document.addEventListener("scroll", e => {
	if (e.target?.id === "dm-msgs") dms.pegado = e.target.scrollHeight - e.target.scrollTop - e.target.clientHeight < 80;
}, true);
for (const evento of ["load", "loadedmetadata"]) document.addEventListener(evento, e => {
	const caja = e.target?.closest?.("#dm-msgs");
	if (caja && dms.pegado) caja.scrollTop = caja.scrollHeight;
}, true);
// Cerca del final de la lista se traen más chats solos, como en Instagram.
document.addEventListener("scroll", e => {
	const lista = e.target;
	if (!(lista instanceof HTMLElement) || !lista.classList.contains("dmfilas")) return;
	if (dms.cargando || !dms.siguiente || dms.busca.trim().length >= 2) return;
	if (lista.scrollHeight - lista.scrollTop - lista.clientHeight < 400) void cargarBandejaDms(true);
}, true);
document.addEventListener("input", e => {
	if (e.target.id === "dm-busca") return buscarDms(e.target.value);
	if (e.target.id === "dm-escribir" && dms.abierto) {
		dms.borrador[dms.abierto] = e.target.value;
		e.target.style.height = "auto";
		e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
	}
});
document.addEventListener("keydown", e => {
	if (e.target.id === "dm-escribir" && e.key === "Enter" && !e.shiftKey && !e.isComposing) {
		e.preventDefault();
		if (dms.abierto) void mandarDm(dms.abierto);
	}
	if (e.target.id === "dm-busca" && e.key === "Escape") {
		e.target.value = "";
		buscarDms("");
	}
});

