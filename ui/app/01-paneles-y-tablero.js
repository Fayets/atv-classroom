// La barra lateral, con el diseño del Classroom de ATV (atv.css): arriba la credencial (Leverage y tu empresa) y
// "Tu espacio" (la carpeta abierta: tu empresa o un cliente); en el medio las secciones en bandejas con pestaña y
// la píldora de tinta que se desliza a la activa; abajo el piloto automático, el navegador y el modo claro/oscuro.
// En tablet se puede plegar a un riel de íconos; en el celular es un cajón que se abre desde la barra de arriba.
// Los botones conservan sus data-view / data-section / data-dock: los clics los maneja 13-acciones-y-avisos.js.
let sbRiel = stored("sbRiel", false);
let sbCajon = false;
let sbPildoraAntes = null;
// En el celular la barra es un cajón: el riel no aplica.
const sbCelular = matchMedia("(max-width:760px)");
sbCelular.addEventListener("change", () => renderSide());
const SB_SECCIONES = () => [
	["Tu equipo", [["tablero", "layout-grid", "Tablero", ["tablero", "historial"]], ["bandeja", "inbox", "Bandeja", ["bandeja", "ceo", "agent"]], ["equipo", "users", "Equipo"], ["roadmap", "route", "Roadmap"]]],
	...(state.instagram?.connected ? [["Ventas", [["dms", "instagram", "Ventas", ["dms", "auto"]], ["contenido", "video", "Contenido"]]]] : []),
	["Herramientas", [["juan", "user-round", "Juan IA"], ...(sinClassroom() ? [] : [["classroom", "graduation-cap", "Classroom"]]), ["biblioteca", "book-open", "Biblioteca"]]],
	["Gestión", [["tickets", "ticket", "Tickets"], ["rutinas", "clock", "Rutinas"], ["uso", "gauge", "Uso"], ["decisiones", "scale", "Decisiones"], ["actividad", "activity", "Actividad"], ["ajustes", "settings", "Configuración"]]],
];
const SOL = '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg>';
const temaOscuro = () => document.documentElement.dataset.theme === "dark";

function renderSide() {
	const count = newInbox().length + unreadCeo().length;
	const avisos = [
		state.login === false && state.settings?.onboarding?.done !== false ? `<button class="sb-aviso" data-section="cuentas">${ic("user-round")}<span>Falta iniciar sesión con Claude</span></button>` : "",
		state.outOfQuota ? `<button class="sb-aviso" data-section="cuentas">${ic("gauge")}<span>Sin cupo de Claude</span></button>` : "",
		state.memoria?.presion === "critica" ? `<button class="sb-aviso" data-section="general">${ic("gauge")}<span>Memoria de la compu al límite</span></button>` : "",
	].join("");
	const item = ([id, icono, texto, activas = [id]]) => {
		const on = activas.includes(view.type);
		const cuenta = id === "bandeja" && count ? `<span class="sb-cuenta">${count}</span>` : "";
		return `<button class="sb-item ${on ? "is-on" : ""}" data-view="${id}" ${on ? 'aria-current="page"' : ""} title="${texto}">${ic(icono)}<span class="sb-item__txt">${texto}</span>${cuenta}</button>`;
	};
	const modo = state.settings?.autopiloto?.modo ?? "apagado";
	const piloto = { apagado: "Apagado", interno: "Aprueba lo interno", todo: "Aprueba todo" }[modo];
	const empresa = state.settings?.owner?.company || "Tu empresa";
	setHtml("side", `
	<div class="sb-cab">
		<button class="sb-cred" data-view="tablero" aria-label="Ir al tablero"><span class="sb-cred__logo">${document.getElementById("logo").innerHTML}</span><span class="sb-cred__txt"><b>Leverage</b><small>${esc(empresa)}</small></span></button>
		<button class="sb-plegar" data-sb-riel aria-label="${sbRiel ? "Mostrar la barra" : "Plegar la barra"}" title="${sbRiel ? "Mostrar la barra" : "Plegar la barra"}">${ic("panel-left")}</button>
	</div>
	<div class="sb-espacio"><span class="sb-etq">Tu espacio</span>${carpetaSelector()}</div>
	${avisos ? `<div class="sb-avisos">${avisos}</div>` : ""}
	<nav class="sb-nav" aria-label="Principal"><span class="sb-pildora" aria-hidden="true"></span>${SB_SECCIONES().map(([titulo, items]) => `<div class="sb-grupo"><span class="sb-etq">${titulo}</span>${items.map(item).join("")}</div>`).join("")}</nav>
	<div class="sb-pie">
		<button class="sb-piloto ${modo === "apagado" ? "" : "is-on"}" data-section="general" title="Piloto automático: ${piloto}">${ic("plane")}<span class="sb-piloto__txt"><b>Piloto automático</b><small>${piloto}</small></span>${modo === "apagado" ? "" : `<i class="sb-piloto__punto ${modo}"></i>`}</button>
		<div class="sb-acciones">
			<button class="sb-accion" data-dock aria-label="Tu navegador" title="Tu navegador">${ic("globe")}</button>
			<button class="sb-accion" data-lev-tema aria-label="${temaOscuro() ? "Modo claro" : "Modo oscuro"}" title="${temaOscuro() ? "Modo claro" : "Modo oscuro"}">${temaOscuro() ? SOL : ic("moon")}</button>
			<button class="sb-accion" data-section="general" aria-label="Configuración" title="Configuración">${ic("sliders-horizontal")}</button>
		</div>
	</div>`);
	const side = document.getElementById("side");
	side.classList.add("sb");
	const riel = sbRiel && !sbCelular.matches;
	side.classList.toggle("is-riel", riel);
	side.classList.toggle("is-cajon", sbCajon);
	document.getElementById("sb-fondo")?.classList.toggle("is-abierto", sbCajon);
	document.body.classList.toggle("sb-riel", riel);
	moverPildora();
	renderBarraMovil(count);
	document.querySelector(".app")?.classList.toggle("chat", esVistaDeChat());
	renderConvs();
	renderPanel();
}

/** La píldora de tinta se desliza desde donde estaba hasta la sección activa (la barra se vuelve a pintar entera). */
function moverPildora() {
	const nav = document.querySelector(".sb-nav");
	const pildora = nav?.querySelector(".sb-pildora");
	if (!pildora) return;
	const activo = nav.querySelector(".sb-item.is-on");
	if (!activo) {
		pildora.style.opacity = "0";
		sbPildoraAntes = null;
		return;
	}
	const caja = nav.getBoundingClientRect();
	const r = activo.getBoundingClientRect();
	const destino = { y: r.top - caja.top, x: r.left - caja.left, w: r.width, h: r.height };
	const poner = d => {
		pildora.style.transform = `translate(${d.x}px, ${d.y}px)`;
		pildora.style.width = `${d.w}px`;
		pildora.style.height = `${d.h}px`;
	};
	if (sbPildoraAntes && (sbPildoraAntes.y !== destino.y || sbPildoraAntes.w !== destino.w)) {
		pildora.style.transition = "none";
		poner(sbPildoraAntes);
		pildora.style.opacity = "1";
		void pildora.offsetWidth;
		pildora.style.transition = "";
	} else if (!sbPildoraAntes) pildora.style.transition = "none";
	poner(destino);
	pildora.style.opacity = "1";
	if (!sbPildoraAntes) {
		void pildora.offsetWidth;
		pildora.style.transition = "";
	}
	sbPildoraAntes = destino;
}
addEventListener("resize", () => {
	sbPildoraAntes = null;
	moverPildora();
});

/** En el celular: la barra de arriba con el menú (abre el cajón), el logo y lo que espera tu OK. */
function renderBarraMovil(count) {
	setHtml("sb-movil", `<button class="sb-movil__menu" data-sb-cajon aria-label="Abrir el menú"><svg class="i" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10"/></svg></button><button class="sb-movil__logo" data-view="tablero" aria-label="Ir al tablero">${document.getElementById("logo").innerHTML}<span>Leverage</span></button><span class="sp"></span>${count ? `<button class="sb-movil__cuenta" data-view="bandeja" aria-label="Bandeja: ${count} sin ver">${ic("inbox")}<span>${count}</span></button>` : ""}`);
}

document.addEventListener("click", e => {
	if (e.target.closest("[data-sb-riel]")) {
		sbRiel = !sbRiel;
		store("sbRiel", sbRiel);
		sbPildoraAntes = null;
		renderSide();
		return;
	}
	if (e.target.closest("[data-sb-cajon]")) {
		sbCajon = true;
		renderSide();
		return;
	}
	if (e.target.closest("[data-lev-tema]")) {
		themePref = temaOscuro() ? "light" : "dark";
		store("tema", themePref);
		applyLook();
		renderSide();
		lastBody = "";
		renderBody();
		return;
	}
	// En el celular, elegir una sección (o tocar afuera) cierra el cajón. Abrir "Tu espacio" no lo cierra.
	if (sbCajon && (e.target.closest("#sb-fondo") || e.target.closest(".sb [data-view], .sb [data-section], .sb [data-dock], .sb [data-carp]"))) {
		sbCajon = false;
		setTimeout(renderSide);
	}
});
addEventListener("keydown", e => {
	if (e.key === "Escape" && sbCajon) {
		sbCajon = false;
		renderSide();
	}
});

/** Al costado del chat con un agente: en qué anda, lo que espera tu OK y lo que fue dejando. */
function renderPanel() {
	const a = view.type === "agent" ? activeAgent() : null;
	document.querySelector(".app")?.classList.toggle("conpanel", Boolean(a));
	if (!a) return setHtml("panel", "");
	const orden = ordenDe(a);
	const piden = pending().filter(r => r.agentId === a.id);
	const archivos = state.requests.filter(r => r.agentId === a.id && r.file).slice(-5).reverse();
	const estado = a.busy ? `<span class="pnpaso"><i class="tbgira" aria-hidden="true"></i><span class="tbrespira">${esc(a.ahora ? pasoLegible(a.ahora) : "Trabajando")}</span></span>` : `<span class="pnpaso"><i class="tbespera" aria-hidden="true"></i><span>${a.queued ? "En fila, arranca en un rato" : a.asleep ? "Dormido" : "Disponible"}</span></span>`;
	const tipo = r => ({ ok: "Pide tu OK", accion: "Quiere hacer esto", entrega: "Entrega" })[r.kind] ?? "Pide tu OK";
	setHtml("panel", `<section class="pnsec"><h2>${a.busy || a.queued ? "Trabajo en curso" : "Último pedido"}</h2>${orden ? `<p class="pnorden">${esc(orden.text.split(/\n/)[0].trim().slice(0, 160))}</p><small>Se lo pidió ${esc(orden.from === "dueno" ? "vos" : who(orden.from))} · hace ${lasted(orden.at, new Date())}</small>` : `<p class="pnorden muted">Todavía no recibió pedidos.</p>`}${estado}</section>
	${piden.length ? `<section class="pnsec"><h2>Espera tu OK <span>${piden.length}</span></h2>${piden.map(r => `<div class="pnpide"><b>${esc(actionOf(r)?.title ?? r.title)}</b><small class="${r.kind === "accion" ? "riesgo" : ""}">${tipo(r)}</small><div class="tbbots"><button class="b p" data-approve="${r.id}">Aprobar</button><button class="b" data-ver-pedido="${r.id}">Ver</button></div></div>`).join("")}</section>` : ""}
	<section class="pnsec"><h2>Archivos <span>${archivos.length || ""}</span></h2>${archivos.length ? archivos.map(r => `<button class="pnarch" data-file="${esc(r.file)}"><b>${esc(r.title)}</b><small>${ago(r.at)}</small></button>`).join("") : `<p class="muted">Lo que entregue va a aparecer acá.</p>`}<button class="tbmas" data-agent-files>Ver todos sus archivos</button></section>`);
}

/** Con quién hablás: el canal, el Asistente y cada área con sus agentes. Vive al costado del chat. */
function renderConvs() {
	if (!esVistaDeChat()) return setHtml("convs", "");
	const assistant = state.agents.find(a => a.role === "asistente");
	const groups = {};
	for (const a of state.agents) if (a.department) (groups[a.department] ??= []).push(a);
	const estado = a => (pending().some(r => r.agentId === a.id) ? `<small class="pide">Te necesita</small>` : `<small>${a.busy ? "Trabajando…" : a.queued ? "En fila" : a.asleep ? "Dormido" : a.connected ? "Disponible" : "Conectando…"}</small>`);
	const agentRow = a => `<button class="item ${view.type === "agent" && view.id === a.id ? "on" : ""}" data-agent="${a.id}">${avatar(a)}<span><b>${esc(a.name)}</b>${estado(a)}</span></button>`;
	const unread = unreadCeo().length;
	setHtml("convs", `<div class="cvtit">Conversaciones</div>
	<button class="item ${view.type === "ceo" ? "on" : ""}" data-view="ceo"><span class="ihash">${ic("hash")}</span><span><b>ceo</b><small>${unread ? `${unread} sin leer` : "Lo que te reportan"}</small></span></button>
	${assistant ? groupHtml("inicio", "Inicio", agentRow(assistant)) : ""}
	${Object.entries(groups).map(([d, list]) => groupHtml(d, nombre(d), list.map(agentRow).join(""))).join("")}`);
}

const hoyEs = iso => iso && new Date(iso).toDateString() === new Date().toDateString();

/** Cómo se llama cada rutina para el dueño, y quién la hace. */
const NOMBRE_RUTINA = { "reporte-diario": "Reporte del día en #ceo", "contenido-diario": "Etiquetar el contenido nuevo", "lectura-jueves": "Lectura de números de la semana", "reporte-viernes": "Reporte para la reunión con Ventas", "calendario-sabado": "Calendario de la semana siguiente", "guiones-lunes": "Guiones de YouTube y reels", "calendario-diario": "Control del calendario", "secuencias-martes": "Secuencias de historias", "revision-anuncios": "Revisar los anuncios", "clientes-diario": "Control de clientes", "inactivos-lunes": "Clientes inactivos", "bugs-diario": "Revisar errores", "sistemas-viernes": "Resumen de Sistemas" };
const rutinaNombre = r => NOMBRE_RUTINA[r.id] ?? nombre(r.id.replaceAll("-", " "));
const rutinaQuien = r => state.agents.find(a => a.department === r.departamento && a.role === r.rol)?.name ?? nombre(r.departamento);
const DIAS_CORTOS = d => (d.length === 7 ? "todos los días" : d.join() === "1,2,3,4,5" ? "lun a vie" : d.join() === "1,2,3,4,5,6" ? "lun a sáb" : d.map(x => DIAS[x]).join(" "));

/** Cuándo vuelve a correr una rutina: el próximo día de la lista, a su hora. */
function proximaVez(r) {
	const ahora = new Date();
	for (let d = 0; d < 8; d++) {
		const cuando = new Date(ahora);
		cuando.setDate(ahora.getDate() + d);
		cuando.setHours(r.hora, 0, 0, 0);
		if (r.dias.includes(cuando.getDay()) && cuando > ahora) return cuando;
	}
	return null;
}

function cuandoTexto(fecha) {
	const dias = Math.round((new Date(fecha).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
	const h = hora(fecha.toISOString());
	if (dias === 0) return `Hoy ${h}`;
	if (dias === 1) return `Mañana ${h}`;
	return `${DIAS[fecha.getDay()][0].toUpperCase()}${DIAS[fecha.getDay()].slice(1)} ${h}`;
}

/** Lo que el equipo hace solo y lo que ya hizo, al lado. */
function historialHtml() {
	const rutinas = (extra.routines ?? []).filter(r => r.prendida).map(r => ({ r, cuando: proximaVez(r) })).sort((a, b) => (a.cuando ?? Infinity) - (b.cuando ?? Infinity));
	const latidos = Object.entries(state.beats ?? {}).filter(([, b]) => b.checks.length);
	const filas = [
		...(state.instagram?.connected ? [`<div><b>Guardar las historias de Instagram</b><small>Leverage · cada hora${state.instagram.lastSync ? ` · la última, ${hora(state.instagram.lastSync)}` : ""}</small></div>`] : []),
		...rutinas.map(({ r, cuando }) => `<div><b>${esc(rutinaNombre(r))}</b><small>${esc(rutinaQuien(r))} · ${DIAS_CORTOS(r.dias)} a las ${r.hora}${cuando ? ` · ${cuandoTexto(cuando).toLowerCase()}` : ""}</small></div>`),
	];
	// Lo que cada agente se anotó para revisar: es una nota suya, así que va cerrada y corta.
	const corto = t => (t.length > 140 ? `${t.slice(0, 137).trimEnd()}…` : t);
	const esperan = latidos.map(([id, b]) => `<details class="hsesp"><summary><span><b>${esc(who(id))}</b><small> · ${b.checks.length} ${b.checks.length === 1 ? "cosa" : "cosas"}</small></span><span class="hschev" aria-hidden="true">›</span></summary><ul>${b.checks.map(c => `<li title="${esc(c)}">${esc(corto(c))}</li>`).join("")}</ul></details>`);
	const fecha = new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
	return `<div class="tablero">
	<div class="tbhead"><div><small>${fecha[0].toUpperCase()}${fecha.slice(1)}</small><h1>Lo que hace solo y lo que ya hizo</h1></div><div class="seg tbseg"><button class="${view.type === "tablero" ? "on" : ""}" data-view="tablero">Hoy</button><button class="${view.type === "historial" ? "on" : ""}" data-view="historial">Programado e historial</button></div></div>
	<div class="hsdos">
		<section class="tbcol"><h2><i class="aro" aria-hidden="true"></i>Programado<span>${filas.length}</span></h2>${filas.length ? `<div class="tblista">${filas.join("")}</div>` : `<p class="tbvacio">No hay nada programado. Las rutinas se prenden en Rutinas.</p>`}${esperan.length ? `<h2 class="hsh2"><i class="aro" aria-hidden="true"></i>Lo que están esperando<span>${esperan.length}</span></h2><div class="tblista">${esperan.join("")}</div>` : ""}</section>
		<section class="tbcol hshist"><h2><i class="piedra" aria-hidden="true"></i>Historial</h2><div class="hsfiltros">${[["hoy", "Hoy"], ["ayer", "Ayer"], ["semana", "Últimos 7 días"]].map(([id, txt]) => `<button class="chipb ${histPeriodo === id ? "on" : ""}" data-hist-periodo="${id}">${txt}</button>`).join("")}</div>${porPersonaHtml(histPeriodo)}</section>
	</div>
</div>`;
}

/** El inicio, con el diseño del Classroom (estilos .tb2 en atv.css): el saludo, el marcador del día y cuatro bloques.
 * Lo que espera tu OK va primero y más grande; al lado, quién está trabajando ahora; abajo, lo que se entregó hoy
 * (como hojas, con el tipo de archivo) y lo que viene programado (como una agenda). Al pie, el pedido al Asistente.
 * No tiene animaciones de entrada: el tablero se vuelve a pintar entero cada pocos segundos. */
function tableroHtml() {
	const okReq = [...pending()].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
	const okKpi = proposed();
	const enCurso = state.agents.filter(a => a.busy || a.queued).sort((a, b) => Number(Boolean(b.busy)) - Number(Boolean(a.busy)));
	const entregas = state.requests.filter(r => r.kind === "entrega" && hoyEs(r.at)).sort((a, b) => b.at.localeCompare(a.at));
	const rutinas = (extra.routines ?? []).filter(r => r.prendida).map(r => ({ r, cuando: proximaVez(r) })).filter(x => x.cuando).sort((a, b) => a.cuando - b.cuando);
	const totalOk = okReq.length + okKpi.length;
	const ahora = new Date();
	const fecha = ahora.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
	const h = ahora.getHours();
	const saludo = h < 6 || h >= 20 ? "Buenas noches" : h < 13 ? "Buen día" : "Buenas tardes";
	const primerNombre = (state.settings?.owner?.name ?? "").split(/\s+/)[0];
	const empresa = state.carpeta?.nombre ?? state.settings?.owner?.company ?? "";
	const quien = id => state.agents.find(a => a.id === id);
	const tipo = r => ({ ok: "Pide tu OK", accion: "Quiere hacer esto", entrega: "Entrega para revisar" })[r.kind] ?? "Pide tu OK";
	const app = r => {
		const a = actionOf(r)?.app;
		return a ? `<img class="tb2-app" src="/ui/apps/${esc(a)}.svg" alt="" onerror="this.remove()">` : "";
	};
	const okCard = r => {
		const ag = quien(r.agentId);
		return `<article class="tb2-pide ${r.kind === "accion" ? "is-accion" : ""}">
			<span class="tb2-tipo">${app(r)}${tipo(r)}</span>
			<b class="tb2-pide__t">${esc(actionOf(r)?.title ?? r.title)}</b>
			<span class="tb2-quien">${ag ? avatar(ag, "xs") : ""}<span>${esc(r.author)}${r.at ? ` · ${ago(r.at).toLowerCase()}` : ""}</span></span>
			<div class="tb2-bots"><button class="b go" data-approve="${r.id}">Aprobar</button><button class="b" data-ver-pedido="${r.id}">Ver</button></div>
		</article>`;
	};
	const kpiCard = k => `<article class="tb2-pide"><span class="tb2-tipo">Nuevo KPI</span><b class="tb2-pide__t">${esc(k.name)}</b><span class="tb2-quien"><span>${esc(k.proposedBy)} · meta ${esc(k.target)}</span></span><div class="tb2-bots"><button class="b" data-ver-pedido="${k.id}">Ver</button></div></article>`;
	const cursoCard = a => {
		const orden = ordenDe(a);
		const paso = a.busy ? (a.ahora ? pasoLegible(a.ahora) : "Trabajando") : "En fila, arranca en un rato";
		const area = a.department ? nombre(a.department) : ROLE_NAMES[a.role] ?? "";
		return `<button class="tb2-curso ${a.busy ? "is-trabaja" : ""}" data-agent="${a.id}">
			<span class="tb2-curso__av">${avatar(a, "sm")}<i aria-hidden="true"></i></span>
			<span class="tb2-curso__txt"><b>${esc(a.name)}<small>${esc(area)}</small></b>${orden ? `<span class="tb2-curso__tarea">${esc(orden.text.split(/\n/)[0].trim().slice(0, 110))}</span>` : ""}<span class="tb2-curso__paso"><i class="${a.busy ? "tbgira" : "tbespera"}" aria-hidden="true"></i><span class="${a.busy ? "tbrespira" : ""}">${esc(paso)}</span>${orden ? `<small>· ${lasted(orden.at, ahora)}</small>` : ""}</span></span>
		</button>`;
	};
	const extension = ruta => (/\.([a-z0-9]+)$/i.exec(ruta ?? "")?.[1] ?? "").toUpperCase();
	const entregaCard = r => {
		const ext = extension(r.file);
		const estado = r.state === "aprobado" ? `<span class="tb2-estado is-ok">Aprobado</span>` : r.state === "pendiente" ? `<span class="tb2-estado is-pide">Espera tu OK</span>` : "";
		const cuerpo = `<span class="tb2-hoja" aria-hidden="true"><i>${esc(ext || "DOC")}</i></span><span class="tb2-entrega__txt"><b>${esc(r.title)}</b><small>${esc(r.author)} · ${hora(r.at)}</small></span>${estado}`;
		return r.file ? `<button class="tb2-entrega" data-file="${esc(r.file)}" title="Ver archivo">${cuerpo}</button>` : `<div class="tb2-entrega">${cuerpo}</div>`;
	};
	const instagram = state.instagram?.connected ? [{ cuando: "Cada hora", nombre: "Guardar las historias de Instagram", quien: `Leverage${state.instagram.lastSync ? ` · la última, ${hora(state.instagram.lastSync)}` : ""}` }] : [];
	const agenda = [...instagram, ...rutinas.map(({ r, cuando }) => ({ cuando: cuandoTexto(cuando), nombre: rutinaNombre(r), quien: rutinaQuien(r) }))];
	const vacio = (titulo, texto) => `<div class="tb2-vacio"><b>${titulo}</b><span>${texto}</span></div>`;
	const sec = (clave, titulo, n, cuerpo, extraCab = "") => `<section class="tb2-sec tb2-${clave}" aria-label="${titulo}"><header class="tb2-sec__cab"><h2>${titulo}</h2>${n ? `<span class="tb2-n">${n}</span>` : ""}<span class="sp"></span>${extraCab}</header>${cuerpo}</section>`;
	const cifra = (n, texto, cls = "") => `<div class="tb2-cifra ${cls}"><b>${n}</b><small>${texto}</small></div>`;
	return `<div class="tablero tb2">
	<header class="tb2-cab">
		<div class="tb2-titulo"><p class="tb2-ojo">${fecha[0].toUpperCase()}${fecha.slice(1)}${empresa ? `<span class="tb2-ojo__emp"> · ${esc(empresa)}</span>` : ""}</p><h1>${saludo}${primerNombre ? `, ${esc(primerNombre)}` : ""}.<br><em>Esto es lo de tu equipo hoy.</em></h1></div>
		<div class="seg tbseg"><button class="${view.type === "tablero" ? "on" : ""}" data-view="tablero">Hoy</button><button class="${view.type === "historial" ? "on" : ""}" data-view="historial">Programado e historial</button></div>
	</header>
	<div class="tb2-marcador" role="list">
		${cifra(totalOk, totalOk === 1 ? "espera tu OK" : "esperan tu OK", totalOk ? "is-pide" : "")}
		${cifra(enCurso.filter(a => a.busy).length, "trabajando ahora", enCurso.some(a => a.busy) ? "is-vivo" : "")}
		${cifra(entregas.length, entregas.length === 1 ? "entrega hoy" : "entregas hoy")}
		${cifra(agenda.length, "en la agenda")}
	</div>
	<div class="tb2-grilla">
		<div class="tb2-col">
		${sec("ok", "Esperan tu OK", totalOk, totalOk ? `<div class="tb2-lista">${okReq.map(okCard).join("")}${okKpi.map(kpiCard).join("")}</div>` : vacio("Nada espera tu OK", "Cuando alguien del equipo te pida algo, aparece acá."), totalOk ? `<button class="tb2-link" data-view="bandeja">Ir a la Bandeja ${ic("chevron-right")}</button>` : "")}
		${sec("hecho", "Entregado hoy", entregas.length, entregas.length ? `<div class="tb2-entregas">${entregas.slice(0, 6).map(entregaCard).join("")}</div>${entregas.length > 6 ? `<button class="tb2-link" data-view="historial">Ver las otras ${entregas.length - 6} ${ic("chevron-right")}</button>` : ""}` : vacio("Todavía no hay entregas hoy", "Lo que el equipo termine va a quedar acá, listo para abrir."))}
		</div><div class="tb2-col">
		${sec("vivo", "Trabajando ahora", enCurso.length, enCurso.length ? `<div class="tb2-lista">${enCurso.map(cursoCard).join("")}</div>` : vacio("Nadie está trabajando", "Pedile algo al Asistente y lo reparte con el equipo."), `<span class="tb2-envivo ${enCurso.some(a => a.busy) ? "on" : ""}"><i></i>En vivo</span>`)}
		${sec("prog", "Lo que viene", agenda.length, agenda.length ? `<ol class="tb2-agenda">${agenda.slice(0, 6).map(x => `<li><span class="tb2-agenda__cuando">${esc(x.cuando)}</span><span class="tb2-agenda__txt"><b>${esc(x.nombre)}</b><small>${esc(x.quien)}</small></span></li>`).join("")}</ol>${agenda.length > 6 ? `<button class="tb2-link" data-view="historial">Ver todo lo programado ${ic("chevron-right")}</button>` : ""}` : vacio("No hay nada programado", "Las rutinas se prenden en Rutinas."))}
		</div>
	</div>
	<form class="tbpedido" id="tb-form"><span class="tbpara">Para: Asistente</span><label class="tbcampo"><span class="tbvh">Pedido para tu equipo</span><textarea id="tb-input" rows="1" autocomplete="off" placeholder="Pedile algo a tu equipo…"></textarea></label>${botonVoz("tb-input")}<button class="send" aria-label="Enviar">${ic("arrow-up")}</button></form>
</div>`;
}

function headerFor(a) {
	const asks = pending().some(r => r.agentId === a.id);
	const pill = a.busy ? `<span class="pill">Trabajando</span>` : asks ? `<span class="pill wait">Espera tu OK</span>` : `<span class="pill idle">${a.queued ? "En fila" : a.asleep ? "Dormido" : "Disponible"}</span>`;
	return `<div class="head">${avatar(a, "hd")}<h1>${esc(a.name)}</h1><span class="sp"></span>${pill}<button class="ic" data-agent-files data-tip="Archivos" aria-label="Archivos">${ic("folder")}</button><button class="ic" data-agent-log data-tip="Actividad" aria-label="Actividad">${ic("clock")}</button><button class="ic" data-agent-card data-tip="Ficha" aria-label="Ficha">${ic("ellipsis")}</button></div>`;
}

let noticesOn = readPref("avisos", false);
const isNotice = m => m.role === "user" && m.text.startsWith("[Leverage]");


/** El veredicto de una revisión de Jeremy, como etiqueta al lado de su nombre. */
function veredictoJeremy(texto) {
	const v = /VEREDICTO:\s*\**\s*(aprobado|corregir|rehacer)/i.exec(texto)?.[1]?.toLowerCase();
	return v ? ` <span class="jver ${v}">${{ aprobado: "Aprobado", corregir: "Corregir", rehacer: "Rehacer" }[v]}</span>` : "";
}

/** De cada tanda del agente queda a la vista su última respuesta y lo demás va cerrado. */
function runsOf(all) {
	const out = [];
	let run = null;
	let since = null;
	for (const m of all) {
		if (m.role === "user") {
			run = null;
			since = m.at;
			// Lo que respondió Juan viaja pegado al mensaje del dueño: se ve como dos burbujas.
			const [propio, juan] = m.text.split(SEPARA_JUAN);
			// Lo de Jeremy también: si lo de antes es un aviso de Leverage, solo queda su burbuja.
			const [antes, jeremy] = m.text.split(SEPARA_JEREMY);
			if (jeremy !== undefined) {
				if (!isNotice(m)) out.push({ ...m, text: antes });
				else if (noticesOn) out.push({ ...m, text: antes, notice: true });
				out.push({ id: `${m.id}-jeremy`, jeremy });
			} else if (juan !== undefined) out.push({ ...m, text: propio }, { id: `${m.id}-juan`, juan });
			else if (!isNotice(m)) out.push(m);
			else if (noticesOn) out.push({ ...m, notice: true });
			continue;
		}
		if (!run) out.push((run = { id: m.id, since: since ?? m.at, items: [] }));
		run.items.push(m);
	}
	return out;
}

function lasted(from, to) {
	const s = Math.max(1, Math.round((new Date(to) - new Date(from)) / 1000));
	if (s < 60) return `${s} s`;
	const min = Math.round(s / 60);
	return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

const STEP_ICONS = { leer: "file-text", buscar: "search", comando: "terminal", editar: "pencil", herramienta: "wrench" };

/** Los pasos seguidos del mismo tipo se juntan en una fila, como en un registro. */
function groupSteps(steps) {
	const out = [];
	for (const s of steps) {
		const prev = out.at(-1);
		if (prev && s.kind !== "nota" && prev.kind === s.kind) prev.count += 1;
		else out.push({ ...s, count: 1 });
	}
	return out;
}

const stepHtml = s =>
	s.kind === "nota"
		? `<li class="st-note"><span class="st-dot"></span><span class="st-t">${esc(s.text)}</span></li>`
		: `<li>${ic(STEP_ICONS[s.kind] ?? "wrench")}<span class="st-t">${esc(s.text)}</span>${s.count > 1 ? `<small>· ${s.count} pasos</small>` : s.detail ? `<code>${esc(s.detail)}</code>` : ""}</li>`;

const RUTA_ARCHIVO = /\/[^\s`"')\]]*\/(?:work|biblioteca|entregas|adjuntos)\/[^\s`"')\]]+\.(?:html|docx|xlsx|pptx|pdf|md|txt|csv|png|jpe?g|webp|gif|mp4|mov|mp3|m4a|wav|ogg|oga|opus|aac|amr)\b/gi;
const CLASE_ARCHIVO = { html: "Página", docx: "Word", xlsx: "Excel", pptx: "Presentación", pdf: "PDF", md: "Documento", txt: "Texto", csv: "Planilla", wav: "Audio", mp4: "Video", mov: "Video", mp3: "Audio", m4a: "Audio", ogg: "Audio", oga: "Audio", opus: "Audio", aac: "Audio", amr: "Audio", webm: "Audio" };

const esMedio = linea => /^\s*!\[[^\]]*\]\(/.test(linea);
const archivosDe = text => [...new Set(String(text ?? "").split("\n").filter(l => !esMedio(l)).flatMap(l => l.match(RUTA_ARCHIVO) ?? []))];

/** "Archivo entregado: /ruta" ya lo dice la tarjeta: en el texto queda solo lo que agrega algo. */
const sinRutasSueltas = text => String(text ?? "").split("\n").filter(l => {
	const resto = l.replace(RUTA_ARCHIVO, "").replace(/[`*:\-\s]/g, "");
	return esMedio(l) || l.search(RUTA_ARCHIVO) < 0 || resto.length > 40;
}).map(l => (esMedio(l) ? l : l.replace(RUTA_ARCHIVO, r => `\`${r.split("/").at(-1)}\``))).join("\n");

function vistaDe(ruta) {
	if (/\.html$/i.test(ruta)) return `${ruta.replace(/[^/]+$/, "")}vista-compu.png`;
	if (/\.(docx|xlsx|pptx|pdf)$/i.test(ruta)) return `${ruta}-vista.png`;
	return /\.(png|jpe?g|webp|gif)$/i.test(ruta) ? ruta : "";
}

// La mención es la señal que hace sonar el aviso: al dueño no le dice nada leerla.
const sinMencion = texto => texto.replace(/(^|\s)@(?:dueño|dueno|franco)\b[,:]?\s*(\S?)/giu, (_, antes, letra) => antes + (antes === "" || antes.includes("\n") ? letra.toUpperCase() : letra));

