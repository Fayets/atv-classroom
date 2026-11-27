function renderSide() {
	const count = newInbox().length + unreadCeo().length;
	const ventas = state.instagram?.connected ? pestana("dms", "Ventas", "", ["dms", "auto"]) + pestana("contenido", "Contenido") : "";
	const avisos = [
		state.login === false && state.settings?.onboarding?.done !== false ? `<button class="tbaviso" data-section="cuentas">${ic("user-round")}<span>Falta iniciar sesión con Claude</span></button>` : "",
		state.outOfQuota ? `<button class="tbaviso" data-section="cuentas">${ic("gauge")}<span>Sin cupo de Claude</span></button>` : "",
		state.memoria?.presion === "critica" ? `<button class="tbaviso" data-section="general">${ic("gauge")}<span>Memoria de la compu al límite</span></button>` : "",
	].join("");
	setHtml("side", `
	<div class="tbfila">
		<button class="logo" data-view="tablero" aria-label="Ir al tablero">${document.getElementById("logo").innerHTML}<span>Leverage</span></button>
		<nav class="tbnav" aria-label="Principal">${pestana("tablero", "Tablero", "", ["tablero", "historial"])}${pestana("bandeja", "Bandeja", count ? `<span class="badge">${count}</span>` : "", ["bandeja", "ceo"])}${ventas}${pestana("equipo", "Equipo")}${pestana("roadmap", "Roadmap")}${pestana("biblioteca", "Biblioteca")}${pestana("juan", "Juan IA")}</nav>
		<div class="tbder">${carpetaSelector()}${pilotoBoton()}${sinClassroom() ? "" : `<button class="ic ${view.type === "classroom" ? "on" : ""}" data-view="classroom" data-tip="Classroom" aria-label="Classroom">${ic("graduation-cap")}</button>`}<button class="ic" data-dock data-tip="Tu navegador" aria-label="Tu navegador">${ic("globe")}</button><button class="ic ${menuOpen ? "on" : ""}" data-menu data-tip="Menú" aria-label="Menú">${ic("settings")}</button></div>
	</div>${avisos ? `<div class="tbavisos">${avisos}</div>` : ""}${menuOpen ? menuHtml() : ""}`);
	document.querySelector(".app")?.classList.toggle("chat", esVistaDeChat());
	renderConvs();
	renderPanel();
}

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

/** El inicio: lo que espera tu OK, lo que está en curso, lo que se entregó hoy y lo que viene. */
function tableroHtml() {
	const okReq = [...pending()].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
	const okKpi = proposed();
	const enCurso = state.agents.filter(a => a.busy || a.queued);
	const entregas = state.requests.filter(r => r.kind === "entrega" && hoyEs(r.at)).sort((a, b) => b.at.localeCompare(a.at));
	const rutinas = (extra.routines ?? []).filter(r => r.prendida).map(r => ({ r, cuando: proximaVez(r) })).filter(x => x.cuando).sort((a, b) => a.cuando - b.cuando);
	const totalOk = okReq.length + okKpi.length;
	const instagram = state.instagram?.connected ? [`<div><b>Guardar las historias de Instagram</b><small>Leverage · cada hora${state.instagram.lastSync ? ` · la última, ${hora(state.instagram.lastSync)}` : ""}</small></div>`] : [];
	const fecha = new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
	const tipo = r => ({ ok: "Pide tu OK", accion: "Quiere hacer esto", entrega: "Entrega" })[r.kind] ?? "Pide tu OK";
	const okCard = r => {
		const accion = actionOf(r);
		return `<article class="tbcard"><b>${esc(accion?.title ?? r.title)}</b><small class="${r.kind === "accion" ? "riesgo" : ""}">${esc(r.author)} · ${tipo(r)}</small><div class="tbbots"><button class="b p" data-approve="${r.id}">Aprobar</button><button class="b" data-ver-pedido="${r.id}">Ver</button></div></article>`;
	};
	const kpiCardTb = k => `<article class="tbcard"><b>Nuevo KPI: ${esc(k.name)}</b><small>${esc(k.proposedBy)} · meta ${esc(k.target)}</small><div class="tbbots"><button class="b" data-ver-pedido="${k.id}">Ver</button></div></article>`;
	const cursoCard = a => {
		const orden = ordenDe(a);
		const paso = a.busy ? (a.ahora ? pasoLegible(a.ahora) : "Trabajando") : "En fila, arranca en un rato";
		const tarea = orden ? `<span class="tbtarea"><span>${esc(orden.text.split(/\n/)[0].trim().slice(0, 90))}</span><small>hace ${lasted(orden.at, new Date())}</small></span>` : "";
		return `<button class="tbcard tbcurso" data-agent="${a.id}"><span class="tbquien">${avatar(a, "xs")}<b>${esc(a.name)}</b></span>${tarea}<span class="tbpaso"><i class="${a.busy ? "tbgira" : "tbespera"}" aria-hidden="true"></i><span class="${a.busy ? "tbrespira" : ""}">${esc(paso)}</span></span></button>`;
	};
	const entregaCard = r => `<article class="tbcard tbhecho"><b>${esc(r.title)}</b><small>${esc(r.author)} · ${hora(r.at)}${r.state === "aprobado" ? " · aprobado" : r.state === "pendiente" ? " · espera tu OK" : ""}</small>${r.file ? `<button class="tbchip" data-file="${esc(r.file)}">Ver archivo</button>` : ""}</article>`;
	const vacio = texto => `<p class="tbvacio">${texto}</p>`;
	const col = (clave, titulo, n, cuerpo, punto) => `<section class="tbcol tb-${clave} ${n ? "" : "cero"}" aria-label="${titulo}"><h2><i class="${punto}" aria-hidden="true"></i>${titulo}<span>${n}</span></h2>${cuerpo}</section>`;
	return `<div class="tablero">
	<div class="tbhead"><div><small>${fecha[0].toUpperCase()}${fecha.slice(1)}</small><h1>Tu equipo, hoy</h1></div><div class="seg tbseg"><button class="${view.type === "tablero" ? "on" : ""}" data-view="tablero">Hoy</button><button class="${view.type === "historial" ? "on" : ""}" data-view="historial">Programado e historial</button></div><div class="tbnums"><div class="${totalOk ? "rojo" : ""}"><b>${totalOk}</b><small>esperan tu OK</small></div><div><b>${enCurso.length}</b><small>en curso</small></div><div><b>${entregas.length}</b><small>entregados hoy</small></div></div></div>
	<div class="tbcols">
		${col("ok", "Esperan tu OK", totalOk, okReq.map(okCard).join("") + okKpi.map(kpiCardTb).join("") || vacio("Nada espera tu OK."), "rojo")}
		${col("curso", "En curso", enCurso.length, enCurso.map(cursoCard).join("") || vacio("Nadie está trabajando ahora."), "carbon")}
		${col("hecho", "Entregado hoy", entregas.length, entregas.slice(0, 4).map(entregaCard).join("") + (entregas.length > 4 ? `<button class="tbmas" data-view="historial">Ver los otros ${entregas.length - 4}</button>` : "") || vacio("Todavía no hay entregas hoy."), "piedra")}
		${col("prog", "Programado", rutinas.length + instagram.length, rutinas.length + instagram.length ? `<div class="tblista">${instagram.join("")}${rutinas.slice(0, 5).map(({ r, cuando }) => `<div><b>${esc(rutinaNombre(r))}</b><small>${esc(rutinaQuien(r))} · ${cuandoTexto(cuando)}</small></div>`).join("")}</div>${rutinas.length > 5 ? `<button class="tbmas" data-view="historial">Ver todas</button>` : ""}` : vacio("No hay nada programado."), "aro")}
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

