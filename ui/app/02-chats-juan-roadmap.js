// ---------- Galería de anuncios ----------
// Cuando un agente entrega una búsqueda de la Biblioteca de Meta, en el chat se ven los creativos, no la ruta.
const RUTA_ANUNCIOS = /\/investigacion\/anuncios-[^/]+\.md$/;
/** Los archivos que se muestran de un mensaje: si trae una búsqueda de anuncios, sus creativos sueltos ya están en la galería. */
const archivosVisibles = texto => {
	const todos = archivosDe(texto);
	return todos.some(r => RUTA_ANUNCIOS.test(r)) ? todos.filter(r => !/\/investigacion\/creativos\//.test(r)) : todos;
};
const galerias = new Map();
const mediaLocal = ruta => `/media/archivo?path=${encodeURIComponent(ruta)}`;
const fuenteDe = f => (!f ? "" : "local" in f ? mediaLocal(f.local) : f.remoto);
const diasTxt = n => (n === null || n === undefined ? "" : n === 1 ? "1 día" : `${n} días`);
function cargarGaleria(ruta) {
	if (galerias.has(ruta)) return;
	galerias.set(ruta, { estado: "cargando" });
	api(`/anuncios?archivo=${encodeURIComponent(ruta)}`)
		.then(async r => galerias.set(ruta, r.ok ? { estado: "ok", d: await r.json() } : { estado: "error" }))
		.catch(() => galerias.set(ruta, { estado: "error" }))
		.finally(() => {
			lastBody = "";
			renderBody();
		});
}
/** El anunciante que se buscó: el que más aparece. Sus anuncios van primero. */
function principalDe(d) {
	const n = new Map();
	for (const c of d.creativos) n.set(c.anunciante, (n.get(c.anunciante) ?? 0) + 1);
	return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}
const ordenGaleria = d => {
	const p = principalDe(d);
	return [...d.creativos].sort((a, b) => (b.anunciante === p) - (a.anunciante === p) || (b.dias ?? -1) - (a.dias ?? -1));
};
function creativoCard(ruta, c, max) {
	const mini = c.miniatura ? `<img src="${esc(mediaLocal(c.miniatura))}" alt="" loading="lazy">` : `<span class="gletra">${esc((c.anunciante || "?").charAt(0).toUpperCase())}</span>`;
	return `<button class="gcard" data-creativo="${esc(ruta)}" data-id="${esc(c.id)}"><span class="gthumb">${mini}${c.dias !== null ? `<span class="gdias ${c.dias === max ? "top" : ""}">${diasTxt(c.dias)}</span>` : ""}${c.video ? `<span class="gplay" aria-hidden="true"></span>` : ""}${c.duracion ? `<span class="gdur">${esc(c.duracion)}</span>` : ""}</span><b>${esc(c.titulo || "Sin texto")}</b><small>${esc(c.anunciante)}</small></button>`;
}
function galeriaHtml(ruta) {
	const g = galerias.get(ruta);
	if (!g) cargarGaleria(ruta);
	if (!g || g.estado !== "ok" || !g.d.creativos.length) return g?.estado === "error" ? fileCard(ruta) : `<div class="galeria cargando"><span class="gthumb"></span><span class="gthumb"></span><span class="gthumb"></span><span class="gthumb"></span></div>`;
	const lista = ordenGaleria(g.d).slice(0, 4);
	const max = Math.max(...g.d.creativos.map(c => c.dias ?? 0));
	return `<div class="galeria"><div class="ggrid">${lista.map(c => creativoCard(ruta, c, max)).join("")}</div><div class="gpie"><button class="b" data-galeria-todos="${esc(ruta)}">Ver los ${g.d.creativos.length} creativos</button><small>${g.d.consulta ? `${esc(g.d.consulta)} · ` : ""}Biblioteca de anuncios de Meta${g.d.leida ? ` · ${new Date(`${g.d.leida}T12:00:00`).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}` : ""}</small></div></div>`;
}
function capaCreativo(html) {
	let capa = document.getElementById("creativo-capa");
	if (!html) return capa?.remove();
	if (!capa) {
		capa = document.createElement("div");
		capa.id = "creativo-capa";
		capa.setAttribute("role", "dialog");
		capa.setAttribute("aria-modal", "true");
		document.body.append(capa);
	}
	capa.innerHTML = `<div class="ccaja">${html}<button class="ic ccerrar" data-creativo-cerrar aria-label="Cerrar">${ic("x")}</button></div>`;
}
function detalleCreativo(ruta, id) {
	const g = galerias.get(ruta);
	const c = g?.d?.creativos.find(x => x.id === id);
	if (!c) return;
	const poster = c.miniatura ? mediaLocal(c.miniatura) : "";
	const medio = c.video
		? `<video class="cmedio" src="${esc(fuenteDe(c.video))}" ${poster ? `poster="${esc(poster)}"` : ""} controls playsinline preload="metadata"></video>`
		: c.imagen
			? `<img class="cmedio" src="${esc(fuenteDe(c.imagen))}" alt="">`
			: `<span class="cmedio gletra">${esc(c.anunciante.charAt(0))}</span>`;
	const datos = [c.dias !== null ? `<span class="tag">${diasTxt(c.dias)} activo</span>` : "", c.duracion ? `<span class="tag">${esc(c.duracion)}</span>` : "", c.destino ? `<span class="tag">Lleva a ${esc(c.destino.replace(/^www\./, ""))}</span>` : "", c.variantes > 1 ? `<span class="tag">${c.variantes} variantes</span>` : ""].join("");
	capaCreativo(`<div class="cdet">${medio}<div class="ctexto"><span class="cquien">${esc(c.anunciante)}</span><h3>${esc(c.titulo || "Sin texto")}</h3><div class="ctags">${datos}</div><p class="cdice">${esc(c.texto)}</p>${c.transcripcion ? `<details class="ctrans"><summary>Lo que dice el video</summary><p>${esc(c.transcripcion)}</p></details>` : ""}<div class="cacc"><a class="b p" href="${esc(c.link)}" target="_blank" rel="noopener">Ver en la Biblioteca de Meta</a><button class="b ghost" data-galeria-todos="${esc(ruta)}">Ver todos</button></div>${c.video && "remoto" in c.video ? `<small class="muted">El video se ve desde Meta: si dejó de cargar, abrilo en la Biblioteca.</small>` : ""}</div></div>`);
}
function todosCreativos(ruta, soloPrincipal = true) {
	const g = galerias.get(ruta);
	if (!g?.d) return;
	const p = principalDe(g.d);
	const lista = ordenGaleria(g.d).filter(c => !soloPrincipal || c.anunciante === p);
	const max = Math.max(...g.d.creativos.map(c => c.dias ?? 0));
	const otros = g.d.creativos.length - g.d.creativos.filter(c => c.anunciante === p).length;
	capaCreativo(`<div class="ctodos"><div class="ctodos-cab"><h3>Anuncios de ${esc(g.d.consulta || p)}</h3>${otros ? `<div class="ctodos-f"><button class="bwchip ${soloPrincipal ? "on" : ""}" data-galeria-filtro="${esc(ruta)}" data-solo="1">De ${esc(p)} · ${g.d.creativos.length - otros}</button><button class="bwchip ${soloPrincipal ? "" : "on"}" data-galeria-filtro="${esc(ruta)}" data-solo="0">Todos · ${g.d.creativos.length}</button></div>` : ""}</div><div class="ggrid todos">${lista.map(c => creativoCard(ruta, c, max)).join("")}</div></div>`);
}
document.addEventListener("click", e => {
	if (e.target.closest("[data-creativo-cerrar]") || e.target.id === "creativo-capa") return capaCreativo("");
	const todos = e.target.closest("[data-galeria-todos]");
	if (todos) return todosCreativos(todos.dataset.galeriaTodos);
	const f = e.target.closest("[data-galeria-filtro]");
	if (f) return todosCreativos(f.dataset.galeriaFiltro, f.dataset.solo === "1");
	const c = e.target.closest("[data-creativo]");
	if (c) detalleCreativo(c.dataset.creativo, c.dataset.id);
});
document.addEventListener("keydown", e => {
	if (e.key === "Escape" && document.getElementById("creativo-capa")) capaCreativo("");
});

function fileCard(ruta, titulo) {
	const partes = ruta.split("/");
	const nombre = titulo || (partes.at(-1) === "index.html" ? partes.at(-2) : partes.at(-1));
	const ext = ruta.split(".").at(-1).toLowerCase();
	const vista = vistaDe(ruta);
	const foto = vista ? `<img alt="" src="/media/archivo?path=${encodeURIComponent(vista)}" onerror="this.remove()">` : "";
	const afuera = ext === "html" ? `<button class="b ghost" data-ver-afuera="${esc(ruta)}">Abrir en el navegador</button>` : "";
	// Un agente puede nombrar un archivo que todavía no hizo ("va a quedar en..."): sin archivo, la tarjeta no se abre.
	if (existeArchivo.get(ruta)?.ok === false) return `<div class="filecard falta" data-falta="${esc(ruta)}"><span class="fopen"><span class="fthumb">${ic("file-text")}</span><span class="ftext"><b>${esc(nombre)}</b><small>Todavía no está en la carpeta</small></span></span></div>`;
	if (/^(mp3|m4a|wav|ogg|oga|opus|aac|webm)$/.test(ext)) return `<div class="filecard sonido"><span class="fopen"><span class="fthumb">${ic("mic")}</span><span class="ftext"><b>${esc(nombre)}</b><audio controls preload="none" src="/media/archivo?path=${encodeURIComponent(ruta)}"></audio></span></span></div>`;
	return `<div class="filecard"><button class="fopen" data-file="${esc(ruta)}"><span class="fthumb">${ic("file-text")}${foto}</span><span class="ftext"><b>${esc(nombre)}</b><small>${CLASE_ARCHIVO[ext] ?? "Imagen"} · Abrir acá</small></span></button>${afuera}</div>`;
}

/** Qué archivos nombrados en el chat existen de verdad. Lo que falta se vuelve a mirar cada tanto: puede aparecer después. */
const existeArchivo = new Map();
const REMIRAR_FALTANTE_MS = 15_000;
let mirandoArchivos = false;
async function revisarArchivos() {
	if (mirandoArchivos) return;
	const ahora = Date.now();
	const rutas = [...new Set([...document.querySelectorAll("#body .filecard [data-file], #body .filecard[data-falta]")].map(b => b.dataset.file ?? b.dataset.falta))];
	const mirar = rutas.filter(r => {
		const e = existeArchivo.get(r);
		return !e || (!e.ok && ahora - e.at > REMIRAR_FALTANTE_MS);
	});
	if (!mirar.length) return;
	mirandoArchivos = true;
	try {
		const res = await api("/files/existen", { method: "POST", body: JSON.stringify({ paths: mirar.slice(0, 100) }) });
		if (!res.ok) return;
		const { existen } = await res.json();
		let cambio = false;
		for (const r of mirar.slice(0, 100)) {
			const ok = existen[r] !== false;
			if ((existeArchivo.get(r)?.ok ?? true) !== ok) cambio = true;
			existeArchivo.set(r, { ok, at: ahora });
		}
		if (cambio) {
			lastBody = "";
			renderBody();
		}
	} finally {
		mirandoArchivos = false;
	}
}

function runHtml(a, run, working) {
	const answer = run.items.findLast(m => m.text);
	const steps = groupSteps(run.items.flatMap(m => [...(m.text && m !== answer ? [{ kind: "nota", text: sinMencion(m.text) }] : []), ...(m.steps ?? [])]));
	const last = run.items.at(-1);
	const label = working ? `<span data-since="${esc(run.since)}">Trabajando</span>` : `Trabajó ${lasted(run.since, last.at)}`;
	const now = working && steps.length ? `<div class="wnow">${esc(steps.at(-1).text)}</div>` : "";
	const work = steps.length ? `<div class="work">${fold(`run:${run.id}`, label, `<ol class="trace">${steps.map(stepHtml).join("")}</ol>`)}${now}</div>` : "";
	if (!answer) return work;
	const archivos = archivosVisibles(answer.text);
	const texto = blocksOf(sinRutasSueltas(sinMencion(answer.text))).filter(b => b.trim());
	const burbuja = b => `<div class="bub">${md(b, { enlaces: true })}</div>`;
	return `${work}<div class="msg">${avatar(a)}<div class="stack">${texto.slice(0, 1).map(burbuja).join("")}${archivos.map(r => (RUTA_ANUNCIOS.test(r) ? galeriaHtml(r) : fileCard(r, state.requests?.findLast(q => q.file === r)?.title))).join("")}${texto.slice(1).map(burbuja).join("")}</div>${answer.at ? `<small class="when">${ago(answer.at)}</small>` : ""}</div>`;
}

function chatHtml(a) {
	const list = runsOf([...messages, ...sending]);
	if (!list.length) {
		const hello = a.role === "asistente" ? (carpeta ? `Soy el Asistente de ${esc(state.carpeta?.nombre ?? "este cliente")}. Pedime lo que necesites y yo lo reparto con el equipo.` : "Soy tu Asistente. Preguntame lo que quieras o pedime que arme tu equipo.") : `Escribile a ${esc(a.name)} para darle una orden.`;
		return `<div class="empty"><b>${esc(a.name)}</b>${hello}</div>`;
	}
	const rows = list.map((m, i) =>
		m.notice
			? `<div class="work">${fold(`notice:${m.id}`, "Aviso del sistema", `<div class="note">${esc(m.text.replace("[Leverage] ", ""))}</div>`, "boxed")}</div>`
			: m.jeremy
			? `<div class="msg">${avatar({ id: "jeremy" })}<div class="stack"><small class="jnom">Jeremy${veredictoJeremy(m.jeremy)}</small><div class="bub">${md(m.jeremy)}</div></div></div>`
			: m.juan
			? `<div class="msg">${avatar(state.agents.find(x => x.role === "juan") ?? { id: "juan" })}<div class="stack"><small class="jnom">Juan</small><div class="bub">${md(m.juan)}</div></div></div>`
			: m.role === "user"
			? `<div class="me"><div class="bub">${md(m.text)}</div>${m.at ? `<small class="when">${ago(m.at)}</small>` : ""}</div>`
			: runHtml(a, m, a.busy && i === list.length - 1),
	);
	const dichos = new Set(messages.flatMap(m => archivosDe(m.text)));
	const pendientes = (state.requests ?? []).filter(r => r.agentId === a.id && r.kind === "entrega" && r.file && r.state === "pendiente" && !dichos.has(r.file));
	if (pendientes.length) rows.push(`<div class="msg">${avatar(a)}<div class="stack">${pendientes.map(r => fileCard(r.file, r.title)).join("")}</div></div>`);
	// Los mensajes para clientes del classroom que este agente dejó listos: el texto exacto y el botón, acá mismo.
	const mensajes = (state.requests ?? []).filter(r => r.agentId === a.id && r.kind === "accion" && / en el classroom$/.test(r.title ?? "") && (r.state === "pendiente" || Date.now() - new Date(r.at) < 24 * 3600_000));
	if (mensajes.length) rows.push(`<div class="msg">${avatar(a)}<div class="stack">${mensajes.map(mensajeCard).join("")}</div></div>`);
	// Mientras trabaja se ve qué está haciendo (buscando, transcribiendo…), no solo los puntitos.
	if (a.busy || sending.length) rows.push(`<div class="msg">${avatar(a)}<div class="typing-fila"><div class="typing"><i></i><i></i><i></i></div>${a.busy && a.ahora ? `<span class="typing-paso">${esc(pasoLegible(a.ahora))}</span>` : ""}</div></div>`);
	rows.push(paseHtml(a));
	return `<div class="col">${rows.join("")}</div>`;
}

/** Un mensaje para un cliente del classroom, listo para salir a tu nombre: se ve tal cual y sale con un clic. */
function mensajeCard(r) {
	const cliente = /^(?:Para vos: )?Contestarle a (.+) en el classroom$/.exec(r.title ?? "")?.[1] ?? "el cliente";
	const pendiente = r.state === "pendiente";
	const estado = pendiente ? `<i></i>Listo para mandar` : { aprobado: "Mandado", hecho: "Mandado", rechazado: "Descartado", descartado: "Descartado" }[r.state] ?? esc(r.state);
	return `<div class="okcard msjcard"><div class="okst ${pendiente ? "on" : ""}">${estado}</div><b>Para ${esc(cliente)} · sale a tu nombre</b><div class="msjtexto">${esc(r.payload ?? "")}</div>${pendiente ? `<div class="oka"><button class="b p" data-approve="${r.id}">Mandar</button><button class="b" data-view="bandeja">Cambiarlo</button></div>` : ""}</div>`;
}

let storyOpen = null;

/** Lo que espera al dueño se entiende y se aprueba acá mismo; el detalle y la respuesta quedan en la Bandeja. */
function okCard(p) {
	const r = state.requests.find(x => x.id === p.story.pedido);
	const pendiente = r?.state === "pendiente";
	const estado = pendiente ? `<i></i>Espera tu OK` : r ? esc(r.state[0].toUpperCase() + r.state.slice(1)) : "Te necesito";
	return `<div class="okcard"><div class="okst ${pendiente ? "on" : ""}">${estado}</div><b>${esc(p.story.title)}</b><p><span>Recomienda:</span> ${esc(sinMencion(p.text).replaceAll("**", ""))}</p>${pendiente ? `<div class="oka"><button class="b p" data-approve="${r.id}">Aprobar</button><button class="b" data-view="bandeja">Ver detalle</button></div>` : ""}</div>`;
}

/** Jeremy manda texto corrido: sus títulos en mayúsculas son las secciones. */
function seccionesDe(lectura) {
	const secciones = [];
	for (const linea of (lectura ?? "").split("\n")) {
		const t = linea.trim();
		if (t && t.length < 70 && t === t.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(t)) secciones.push({ titulo: t, parrafos: [] });
		else if (t && secciones.length) secciones.at(-1).parrafos.push(t);
	}
	return secciones;
}

/** El roadmap sale de sus acciones: qué hacer primero y qué número destraba el paso siguiente. */
function accionesDe(secciones) {
	const arranque = secciones.find(s => /ARRANCAR/.test(s.titulo));
	return (arranque?.parrafos ?? []).flatMap(p => {
		const m = /^Acci[oó]n\s*(\d+)\s*[—–:,-]+\s*([^.]+)\./.exec(p);
		if (!m) return [];
		const puerta = /N[uú]mero puerta:\s*(.+?)(?:\.\s|\.$|$)/.exec(p)?.[1] ?? "";
		const falla = /N[uú]mero puerta:.+?\.\s+(Si [^.]+|Regla: [^.;]+)/.exec(p)?.[1] ?? "";
		return [{ n: m[1], titulo: m[2].trim(), puerta, falla }];
	});
}

const mermaidSvg = new Map();
const mermaidPidiendo = new Set();
let mermaidListo = null;

function cargarMermaid() {
	mermaidListo ??= new Promise((ok, no) => {
		const s = document.createElement("script");
		s.src = "/ui/vendor/mermaid-11.12.2.min.js";
		s.onload = () => {
			window.mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base", flowchart: { curve: "basis", wrappingWidth: 240 }, themeVariables: { fontFamily: "inherit", fontSize: "16px", primaryColor: "#ffffff", primaryTextColor: "#242321", primaryBorderColor: "#D3D0CA", lineColor: "#777775" } });
			ok(window.mermaid);
		};
		s.onerror = no;
		document.head.append(s);
	});
	return mermaidListo;
}

const textoMermaid = t => `"${String(t).replace(/"/g, "#quot;").replace(/\s+/g, " ").trim()}"`;

/** El diagrama sale del texto de Jeremy: cada acción, la puerta que la destraba y qué se hace si no se cumple. */
function diagramaJeremy(grieta, acciones) {
	const lineas = ["flowchart TD", `G[${textoMermaid(grieta)}]:::grieta`];
	acciones.forEach((a, i) => {
		lineas.push(`${i ? `P${i} -->|"Se cumple"|` : "G -->"} A${i + 1}[${textoMermaid(`${a.n} · ${a.titulo}`)}]:::accion`);
		if (a.puerta) lineas.push(`A${i + 1} --> P${i + 1}{{${textoMermaid(a.puerta)}}}:::puerta`);
		if (a.falla) lineas.push(`P${i + 1} -.->|"No"| F${i + 1}[${textoMermaid(a.falla)}]:::falla`);
	});
	lineas.push("classDef grieta fill:#FEEAE9,stroke:#B40210,color:#B40210", "classDef accion fill:#242321,stroke:#242321,color:#ffffff", "classDef puerta fill:#E7EEF9,stroke:#1351C2,color:#1351C2", "classDef falla fill:#ffffff,stroke:#929190,stroke-dasharray:4 3,color:#3F3F46");
	return lineas.join("\n");
}

async function pintarMermaid(fuente) {
	if (mermaidPidiendo.has(fuente)) return;
	mermaidPidiendo.add(fuente);
	try {
		const m = await cargarMermaid();
		const { svg } = await m.render(`jeremy-${mermaidPidiendo.size}`, fuente);
		mermaidSvg.set(fuente, svg);
	} catch (e) {
		console.error(e);
		mermaidSvg.set(fuente, "");
	}
	lastBody = "";
	renderBody();
}

/** Mientras se arma, o si falla, se ven los pasos: nunca un hueco. */
function mermaidHtml(fuente, acciones) {
	const svg = mermaidSvg.get(fuente);
	if (svg) return `<div class="jmer">${svg}</div>`;
	if (svg === undefined) void pintarMermaid(fuente);
	return roadmapJeremy(acciones);
}

const roadmapJeremy = acciones => `<ol class="jroad">${acciones.map(a => `<li><span class="jn">${esc(a.n)}</span><b>${esc(a.titulo)}</b>${a.puerta ? `<small>Puerta: ${esc(a.puerta)}</small>` : ""}</li>`).join("")}</ol>`;

function lecturaCard(p) {
	const secciones = seccionesDe(state.jeremy?.lectura);
	const incomoda = secciones.find(s => /INC[OÓ]MODA/.test(s.titulo))?.parrafos[0] ?? p.text;
	const acciones = accionesDe(secciones);
	const grieta = incomoda.split(/\.\s/)[0].replace(/\bel payload\b/, "los datos");
	return `<div class="jcard"><div class="okst">Lectura de ${esc(p.story.title)}</div><p>${esc(incomoda)}</p>${acciones.length ? mermaidHtml(diagramaJeremy(grieta, acciones), acciones) : ""}<div class="oka"><button class="b" data-story="${p.id}">Ver lectura completa</button></div></div>`;
}

function jeremyVisor(p) {
	const secciones = seccionesDe(state.jeremy?.lectura).filter(s => s.parrafos.length);
	const acciones = accionesDe(secciones);
	const cuerpo = secciones.filter(s => !/ARRANCAR/.test(s.titulo)).map(s => `<section><h3>${esc(s.titulo[0] + s.titulo.slice(1).toLowerCase())}</h3>${s.parrafos.map(x => `<p>${esc(x)}</p>`).join("")}</section>`).join("");
	const arranque = secciones.find(s => /ARRANCAR/.test(s.titulo));
	return `<div class="sover" data-story-close><div class="sbox jbox" role="dialog" aria-label="Lectura de Jeremy" data-modal-stay><div class="shead">${avatar({ id: p.agentId })}<span><b>Lectura de Jeremy</b><small>${esc(p.story.title)} · ${hora(p.at)}</small></span><button class="ic" data-story-close aria-label="Cerrar">${ic("x")}</button></div><div class="jbody">${acciones.length ? `<section><h3>Por dónde arrancar</h3>${arranque.parrafos.map(x => `<p>${esc(x)}</p>`).join("")}</section>` : ""}${cuerpo}</div></div></div>`;
}

let juanAbierto = null;
/** La nota de voz que se está pasando a texto: ya se ve en la charla. */
let juanEnviando = null;
let juanTema = "para-vos";
/** De qué cliente se habla en un chat nuevo. Vacío es una charla general. */
let juanProyecto = null;
const proyectoElegido = () => juanProyecto ?? carpeta ?? "";
const nombreProyecto = id => (state.clientes ?? []).find(c => c.id === id)?.nombre;
let juanError = "";
const JUAN_TEMAS = [
	["para-vos", "Para vos", ["¿Por dónde arrancamos esta semana?", "¿Cuál es la limitación que frena más este negocio?"]],
	["oferta", "Oferta", ["¿Cómo valido esta oferta?", "Armame la frase de la oferta con el método de ATV"]],
	["contenido", "Contenido", ["¿Qué dolor ataco esta semana?", "¿Qué le cambiarías al calendario?"]],
	["ventas", "Ventas", ["¿Cómo califico en 2 preguntas?", "¿Qué le falta al proceso de agendamiento?"]],
	["metricas", "Métricas", ["¿Qué número miro primero?", "Haceme la ingeniería inversa de la meta"]],
];

const juanCaja = (chat, cerca) => `<form class="jbox2 ${cerca ? "cerca" : ""}" id="juan-form"><div id="thumbs"></div><textarea id="juan-input" rows="${cerca ? 1 : 3}" placeholder="${cerca ? "Seguí la charla con Juan…" : "Contale a Juan con qué necesitás ayuda…"}"></textarea><div class="jpie">${chat ? `<span class="jpill">${ic("folder-open")}${esc(nombreProyecto(chat.proyecto) ?? "General")}</span>` : `<label class="jpill jsel">${ic("folder-open")}<select id="juan-proyecto" aria-label="De qué cliente hablamos"><option value="">General</option>${(state.clientes ?? []).map(c => `<option value="${esc(c.id)}" ${c.id === proyectoElegido() ? "selected" : ""}>${esc(c.nombre)}</option>`).join("")}</select></label>`}<button type="button" class="ic jadj" id="attach" data-tip="Adjuntar" aria-label="Adjuntar archivo">${ic("plus")}</button><input type="file" id="attach-input" multiple hidden><span class="sp"></span>${botonVoz("juan-input")}<span class="jpill">${avatar(state.agents.find(a => a.role === "juan") ?? { id: "juan" })}Juan IA</span>${chat?.esperando ? `<button class="jsend" type="button" data-juan-frenar="${chat.id}" data-tip="Frenar" aria-label="Frenar a Juan"><i class="jfreno"></i></button>` : `<button class="jsend" type="submit" aria-label="Enviar">${ic("arrow-up")}</button>`}</div></form>${juanError ? `<div class="jerr">${esc(juanError)}</div>` : ""}`;

const juanPlegados = new Set();

/** Lo técnico no se lee en la charla: la ruta pasa a ser una tarjeta y la cita del SOP no se muestra. */
const textoDeJuan = texto => sinRutasSueltas(texto).split("\n").filter(l => !/^\s*sale del? .*(sop|clase \d|advantage|marketing 100k|radar)/i.test(l)).join("\n");

const PASO_VERBO = { leer: "Leer", buscar: "Buscar", editar: "Editar" };
const nombreDePaso = detalle => String(detalle ?? "").replace(/^[a-z]+:\/\//, "").split("/").filter(Boolean).at(-1)?.replace(/[-_]/g, " ") ?? "";

/** El agente a veces describe el paso en inglés: ahí se arma en castellano con lo que hizo de verdad. */
function pasoLegible(p) {
	if (p.text && !/^[A-Z][a-z]+ing\b/.test(p.text)) return p.text;
	if (p.kind === "comando") return "Ejecutar un comando";
	const nombre = nombreDePaso(p.detail);
	if (p.kind === "herramienta") return nombre ? nombre[0].toUpperCase() + nombre.slice(1) : "Usar una herramienta";
	return `${PASO_VERBO[p.kind] ?? "Revisar"} ${nombre}`.trim();
}

/** Lo que hizo, en renglones livianos: mientras trabaja se ve abierto, después se pliega. */
function accionesHtml(pasos, clave, vivo) {
	if (!pasos?.length) return "";
	const abierto = vivo ? !juanPlegados.has(clave) : juanPlegados.has(clave);
	const textos = pasos.map(pasoLegible).filter((t, i, todos) => t !== todos[i - 1]);
	const filas = textos.map((t, i) => `<div class="jpaso ${vivo && i === textos.length - 1 ? "ahora" : ""}">${esc(t)}</div>`).join("");
	const titulo = vivo ? "Trabajando" : `${textos.length} ${textos.length === 1 ? "acción" : "acciones"}`;
	return `<div class="jacc ${abierto ? "abierta" : ""}"><button data-juan-plegar="${esc(clave)}">${titulo}${ic("chevron-down")}</button>${abierto ? `<div class="jpasos">${filas}</div>` : ""}</div>`;
}

function juanHtml() {
	const chats = state.juanChats ?? [];
	const hablando = juanEnviando && (juanEnviando.id ?? null) === (juanAbierto ?? null) ? { rol: "yo", texto: juanEnviando.marca } : null;
	const abierto = chats.find(c => c.id === juanAbierto);
	const chat = hablando ? { ...(abierto ?? { id: "", titulo: "", proyecto: proyectoElegido() || undefined }), mensajes: [...(abierto?.mensajes ?? []), hablando], esperando: true } : abierto;
	const lista = `<aside class="jlista"><button class="jnuevo" data-juan-nuevo>${ic("plus")}Chat nuevo</button>${chats.length ? `<small>Recientes</small>` : ""}${chats.map(c => `<div class="jfila"><button class="jitem ${c.id === juanAbierto ? "on" : ""}" data-juan-abrir="${c.id}"><span>${esc(c.titulo)}</span><small>${c.esperando ? "Pensando…" : `${nombreProyecto(c.proyecto) ? `${esc(nombreProyecto(c.proyecto))} · ` : ""}${ago(c.at)}`}</small></button><button class="jborrar" data-juan-borrar="${c.id}" data-tip="Borrar chat" aria-label="Borrar chat">${ic("trash-2")}</button></div>`).join("")}</aside>`;
	if (chat) {
		const burbujas = chat.mensajes.map((m, i) => (m.rol === "yo" ? `<div class="jyo">${md(m.texto)}</div>` : `${accionesHtml(m.pasos, `${chat.id}-${i}`, false)}${m.frenado ? `<div class="jpensando quieto">${esc(m.texto)}</div>` : `<div class="jel">${md(textoDeJuan(m.texto))}</div>${archivosDe(m.texto).map(r => fileCard(r)).join("")}`}`)).join("");
		const vivos = chat.esperando ? (state.juanPasos?.[chat.id] ?? []) : [];
		return `<div class="jv">${lista}<section class="jcharla"><div class="jmsgs" data-charla="${chat.id}:${chat.mensajes.length}">${burbujas}${chat.esperando ? accionesHtml(vivos, `${chat.id}-vivo`, true) || `<div class="jpensando">Pensando</div>` : ""}</div>${juanCaja(chat, true)}</section></div>`;
	}
	const tema = JUAN_TEMAS.find(t => t[0] === juanTema) ?? JUAN_TEMAS[0];
	return `<div class="jv">${lista}<section class="jhome"><h1>${nombreProyecto(proyectoElegido()) ? `¿Qué vemos de ${esc(nombreProyecto(proyectoElegido()))}?` : "¿En qué te ayudo hoy?"} 👋</h1>${juanCaja(null, false)}<div class="jchips">${JUAN_TEMAS.map(([id, nombre]) => `<button class="${id === tema[0] ? "on" : ""}" data-juan-tema="${id}">${nombre}</button>`).join("")}</div><div class="jideas">${tema[2].map(p => `<button data-juan-idea="${esc(p)}">${esc(p)}</button>`).join("")}</div></section></div>`;
}

async function enviarAJuan() {
	const input = document.getElementById("juan-input");
	const escrito = input?.value.trim() ?? "";
	if (audiosEnCamino()) return;
	const archivos = attached.splice(0);
	paintThumbs();
	const texto = [escrito || (archivos.length ? "Mirá esto." : ""), ...lineasAdjuntos(archivos)].filter(Boolean).join("\n\n");
	if (!texto) return;
	guardarEscrito("juan-input", "");
	input.value = "";
	grow(input);
	estadoScroll.juan.pegado = true;
	const res = await api("/juan/chats", { method: "POST", body: JSON.stringify({ texto, chat: juanAbierto ?? undefined, proyecto: proyectoElegido() || undefined }) });
	const cuerpo = await res.json().catch(() => ({}));
	juanError = res.ok ? "" : (cuerpo.error ?? "No se pudo enviar");
	if (res.ok) {
		juanAbierto = cuerpo.id;
		await loadState();
	} else if (!input.isConnected || !input.value) {
		const caja = document.getElementById("juan-input");
		if (caja) {
			caja.value = escrito;
			grow(caja);
			guardarEscrito("juan-input", escrito);
		}
		// Si no salió, los archivos vuelven a quedar listos para mandar.
		attached.push(...archivos);
		paintThumbs();
	}
	lastBody = "";
	renderBody();
}

async function frenarJuan(id) {
	const res = await api(`/juan/chats/${id}/frenar`, { method: "POST" });
	juanError = res.ok ? "" : "No se pudo frenar a Juan";
	if (res.ok) await loadState();
	lastBody = "";
	renderBody();
}

async function borrarChatDeJuan(id) {
	const chat = (state.juanChats ?? []).find(c => c.id === id);
	if (!chat || !confirm(`¿Borrar el chat "${chat.titulo}"? No se puede recuperar.`)) return;
	const res = await api(`/juan/chats/${id}`, { method: "DELETE" });
	juanError = res.ok ? "" : "No se pudo borrar el chat";
	if (res.ok) {
		if (juanAbierto === id) juanAbierto = null;
		await loadState();
	}
	lastBody = "";
	renderBody();
}

document.addEventListener("change", e => {
	if (e.target.id !== "juan-proyecto") return;
	juanProyecto = e.target.value;
	lastBody = "";
	renderBody();
});

document.addEventListener("submit", e => {
	if (e.target.id !== "juan-form") return;
	e.preventDefault();
	void enviarAJuan();
});

/** Buscar en la Bandeja filtra la lista mientras escribís. */
document.addEventListener("input", e => {
	if (e.target.id !== "bw-busca") return;
	bwBusca = e.target.value;
	renderBody();
});

/** Escribir en un chat de la Bandeja le manda el mensaje a ese agente (o a #ceo). */
document.addEventListener("submit", async e => {
	if (e.target.id !== "bw-form") return;
	e.preventDefault();
	const caja = document.getElementById("bw-input");
	const escrito = caja.value.trim();
	if (audiosEnCamino()) return;
	const adjuntos = attached.splice(0);
	const texto = [escrito || (adjuntos.length ? "Mirá esto." : ""), ...lineasAdjuntos(adjuntos)].filter(Boolean).join("\n\n");
	if (!texto) return;
	caja.value = "";
	caja.style.height = "";
	bwBajarHasta = Date.now() + 15_000;
	if (bandejaChat === "ceo") {
		await api("/ceo", { method: "POST", body: JSON.stringify({ text: texto }) });
		return loadState();
	}
	bwEnviando.push({ chat: bandejaChat, text: texto, at: new Date().toISOString() });
	renderBody();
	const res = await api(`/agents/${bandejaChat}/order`, { method: "POST", body: JSON.stringify({ text: texto }) });
	if (!res.ok) {
		bwEnviando.splice(bwEnviando.findIndex(s => s.text === texto), 1);
		caja.value = escrito;
		attached.push(...adjuntos);
		renderBody();
		return;
	}
	void cargarHiloBandeja();
});

/** El pedido del tablero va al Asistente, y se abre su chat para ver cómo lo reparte. */
document.addEventListener("submit", e => {
	if (e.target.id !== "tb-form") return;
	e.preventDefault();
	const caja = document.getElementById("tb-input");
	const texto = caja.value.trim();
	const asistente = state.agents.find(a => a.role === "asistente");
	if (!texto || !asistente) return;
	caja.value = "";
	caja.style.height = "";
	go({ type: "agent", id: asistente.id });
	const input = document.getElementById("input");
	if (!input) return;
	input.value = texto;
	void send();
});

/** Al escribir @ en el chat de un agente aparecen Juan, que responde antes de que el agente actúe, y Jeremy, que revisa lo que hizo. */
const MENCION = /(^|\s)@(\p{L}*)$/u;

function mencionables() {
	const juan = state.agents.find(a => a.role === "juan");
	return [
		...(juan ? [{ id: "juan", nombre: "Juan IA", sub: "Responde antes de que el agente actúe", av: avatar(juan) }] : []),
		...(state.conJeremy === false ? [] : [{ id: "jeremy", nombre: "Jeremy", sub: state.jeremyRevision ? "Revisa lo que hizo el agente" : "Falta conectarlo en Ajustes, Tus claves", av: avatar({ id: "jeremy" }) }]),
	];
}

/** Las cajas donde se le escribe a un agente: el chat, la Bandeja y la barra del Tablero. En todas se puede etiquetar. */
const CAJAS_MENCION = new Set(["input", "bw-input", "tb-input"]);
const cajaConMencion = el => Boolean(el && CAJAS_MENCION.has(el.id) && !(el.id === "bw-input" && document.querySelector(".bwhilo")?.dataset.chat === "ceo"));
let cajaMencion = null;

function mencionEnCurso(input) {
	const antes = input.value.slice(0, input.selectionStart);
	const m = MENCION.exec(antes);
	const opciones = m ? mencionables().filter(o => o.id.startsWith(m[2].toLowerCase())) : [];
	return opciones.length ? { desde: antes.length - m[2].length - 1, hasta: input.selectionStart, opciones } : null;
}

function pintarMencion(input) {
	const abierta = document.getElementById("mpop");
	const en = input && mencionEnCurso(input);
	if (!en) return void abierta?.remove();
	const ids = en.opciones.map(o => o.id).join(",");
	if (abierta?.dataset.ids === ids) return;
	abierta?.remove();
	cajaMencion = input;
	input.closest(".composer, .bwcaja, .tbpedido")?.insertAdjacentHTML("afterbegin", `<div class="mpop" id="mpop" role="listbox" aria-label="Etiquetar" data-ids="${ids}">${en.opciones.map((o, i) => `<button type="button" class="mitem ${i ? "" : "on"}" role="option" data-mencion="${o.id}">${o.av}<span><b>${o.nombre}</b><small>${o.sub}</small></span></button>`).join("")}</div>`);
}

/** Las etiquetas se pintan mientras escribís: una copia del texto atrás de la caja, que solo se ve cuando hay una mención. */
const ETIQUETA = /(^|\s)(@(?:juan|jeremy))(?![\p{L}\p{N}])/giu;
// La copia con las menciones tiene que moverse con la caja: si no, al escribir mucho el cursor queda lejos del texto.
document.addEventListener("scroll", e => {
	if (e.target?.id !== "input") return;
	const espejo = document.getElementById("espejo");
	if (espejo) espejo.scrollTop = e.target.scrollTop;
}, true);

function pintarEspejo(input) {
	const espejo = document.getElementById("espejo");
	if (!input || !espejo) return;
	const nombres = mencionables().map(o => o.id);
	const hay = [...input.value.matchAll(ETIQUETA)].some(m => nombres.includes(m[2].slice(1).toLowerCase()));
	input.parentElement.classList.toggle("con-mencion", hay);
	espejo.innerHTML = hay ? `${esc(input.value).replace(ETIQUETA, '$1<span class="at">$2</span>')}${input.value.endsWith("\n") ? " " : ""}` : "";
	espejo.scrollTop = input.scrollTop;
}

function elegirMencion(id) {
	const input = cajaMencion?.isConnected ? cajaMencion : document.getElementById("input");
	const en = input && mencionEnCurso(input);
	const elegido = id ?? document.querySelector("#mpop .mitem.on")?.dataset.mencion;
	document.getElementById("mpop")?.remove();
	if (!en || !elegido) return;
	input.value = `${input.value.slice(0, en.desde)}@${elegido} ${input.value.slice(en.hasta)}`;
	const caret = en.desde + elegido.length + 2;
	input.setSelectionRange(caret, caret);
	input.focus();
	if (input.id === "input") grow(input);
	else input.dispatchEvent(new Event("input", { bubbles: true }));
	pintarEspejo(input);
}

document.addEventListener("input", e => {
	if (!cajaConMencion(e.target)) return;
	pintarMencion(e.target);
	if (e.target.id === "input") pintarEspejo(e.target);
});
document.addEventListener(
	"scroll",
	e => {
		if (e.target.id === "input") pintarEspejo(e.target);
	},
	true,
);
document.addEventListener("click", e => {
	const mencion = e.target.closest("[data-mencion]");
	if (mencion) return void elegirMencion(mencion.dataset.mencion);
	if (cajaConMencion(e.target)) pintarMencion(e.target);
	else document.getElementById("mpop")?.remove();
});
document.addEventListener("mousedown", e => {
	if (e.target.closest("[data-mencion]")) e.preventDefault();
});
// Va antes que el Enter que envía: con la lista abierta, Enter o Tab eligen al marcado y las flechas se mueven.
document.addEventListener(
	"keydown",
	e => {
		if (!cajaConMencion(e.target) || !document.getElementById("mpop")) return;
		if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
			e.preventDefault();
			e.stopImmediatePropagation();
			elegirMencion();
		} else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			e.stopImmediatePropagation();
			const items = [...document.querySelectorAll("#mpop .mitem")];
			const i = items.findIndex(x => x.classList.contains("on"));
			items[i]?.classList.remove("on");
			items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.classList.add("on");
		} else if (e.key === "Escape") {
			e.stopImmediatePropagation();
			document.getElementById("mpop").remove();
		}
	},
	true,
);

document.addEventListener("keydown", e => {
	if (e.target.id === "juan-input" && e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		void enviarAJuan();
	}
});

document.addEventListener("click", e => {
	const t = e.target.closest("[data-juan-nuevo],[data-juan-abrir],[data-juan-borrar],[data-juan-frenar],[data-juan-tema],[data-juan-idea],[data-juan-plegar]");
	if (!t) return;
	const d = t.dataset;
	if (d.juanBorrar) return void borrarChatDeJuan(d.juanBorrar);
	if (d.juanFrenar) return void frenarJuan(d.juanFrenar);
	if (d.juanPlegar) juanPlegados[juanPlegados.has(d.juanPlegar) ? "delete" : "add"](d.juanPlegar);
	if ("juanNuevo" in d) juanAbierto = null;
	if (d.juanAbrir) juanAbierto = d.juanAbrir;
	if (d.juanTema) juanTema = d.juanTema;
	juanError = "";
	lastBody = "";
	renderBody();
	if (d.juanIdea) {
		const input = document.getElementById("juan-input");
		input.value = d.juanIdea;
		grow(input);
		input.focus();
	}
});

// Una imagen que el agente nombró pero no guardó: en vez del ícono roto, un aviso claro.
document.addEventListener(
	"error",
	e => {
		const img = e.target;
		if (!(img instanceof HTMLImageElement) || !img.closest(".bub, .tx, .jel, #file") || img.dataset.rota) return;
		img.dataset.rota = "1";
		const aviso = document.createElement("span");
		aviso.className = "sinimg";
		aviso.textContent = `No está la imagen${img.alt && !/\.(png|jpe?g|webp)$/i.test(img.alt) ? `: ${img.alt}` : ""}. Quien la mandó no la llegó a guardar.`;
		img.replaceWith(aviso);
	},
	true,
);

/** A quién le pasó trabajo este agente y siguen en eso: el pedido viaja de él a ellos mientras trabajan. */
function paseHtml(a) {
	const alcanzo = [...(state.pases?.[a.id] ?? [])].reverse();
	const todos = alcanzo.map(p => ({ ...state.agents.find(x => x.id === p.id), desde: p.at })).filter(x => x.id && (x.busy || x.queued));
	const trabajando = todos.slice(0, 3);
	if (!trabajando.length) return "";
	const inicio = Math.min(...trabajando.map(x => Date.parse(x.desde)));
	const cuadro = (x, i) => `<div class="pase-ag"><span class="pase-cuadro pase-anim" style="animation-delay:${i * 0.7}s">${avatar(x)}</span><b>${esc(x.name)}</b><small>${esc(x.ahora ? pasoLegible(x.ahora) : x.busy ? "Trabajando" : "Por arrancar")}</small></div>`;
	return `<div class="pase" aria-label="Tu equipo trabajando"><div class="pase-fila"><div class="pase-ag"><span class="pase-cuadro yo">${avatar(a)}</span><b>${esc(a.name)}</b></div><div class="pase-via" aria-hidden="true"><i class="pase-anim"></i><i class="pase-anim"></i></div><div class="pase-equipo">${trabajando.map(cuadro).join("")}</div></div><div class="pase-pie"><span class="pase-punto pase-anim"></span>${todos.length === 1 ? `${esc(todos[0].name)} está trabajando en lo que le pasó` : `${todos.length} trabajando en lo que les pasó`}<small>${ago(new Date(inicio).toISOString())}</small></div></div>`;
}

/** En la barra el roadmap se ve de un vistazo: en qué paso va y cuánto falta. */
function roadmapFila() {
	const r = state.roadmap;
	const on = view.type === "roadmap" ? "on" : "";
	if (!r) return `<button class="row ${on}" data-view="roadmap">${ic("route")}Roadmap</button>`;
	const actual = r.pasos.find(p => p.estado === "en curso");
	const tramos = r.pasos.map(p => `<i class="${p.estado === "aprobado" ? "ok" : p.estado === "en curso" ? "ahora" : ""}"></i>`).join("");
	return `<button class="rmfila ${on}" data-view="roadmap"><span class="rmfila-top">${ic("route")}<b>Roadmap</b><small>${actual ? `${actual.n} de ${r.pasos.length}` : "Terminado"}</small></span><span class="rmfila-paso">${esc(actual ? actual.titulo : r.titulo)}</span><span class="rmfila-barra">${tramos}</span></button>`;
}

/** Roadmap como sendero: un círculo por paso en zigzag, el paso abierto con sus tareas y el punto de encuentro antes del siguiente. */
const RM = { ancho: 1000, izq: 300, der: 720, fila: 170, top: 92 };
let rmAbierto = null;
let rmVista = { x: 0, y: 0, s: 1 };
/** Alto real de cada tarjeta abierta, medido en pantalla: el cálculo previo es solo para la primera vez. */
const rmAltos = new Map();

/** Lo que se entregó mientras el paso estuvo abierto: archivos que pasaron por la Bandeja y lo que se publicó. */
/** Lo entregado en una tarea, a la vista: qué es (el Miro, el Typeform, el archivo) y un botón para abrirlo. Las versiones viejas, plegadas. */
const rmNombreDe = e => {
	if (e.link) {
		try {
			const u = new URL(e.link);
			const host = u.hostname.replace(/^www\./, "");
			const cola = u.pathname.split("/").filter(Boolean).at(-1) ?? "";
			return { icono: "globe", texto: `${host}${cola ? ` · ${cola.length > 18 ? `${cola.slice(0, 16)}…` : cola}` : ""}` };
		} catch {
			return { icono: "globe", texto: e.link };
		}
	}
	return { icono: "file-text", texto: (e.archivo ?? "").split("/").at(-1) };
};
const rmAbrir = e => (e.link ? `<a href="${esc(e.link)}" target="_blank" rel="noreferrer">Abrir</a>` : `<button data-file="${esc(e.archivo)}">Ver</button>`);
const rmFila = (e, extra = "", t) => {
	const n = rmNombreDe(e);
	const lapiz = t ? `<button class="rmcitar" data-rm-citar="${esc(t.texto)}" data-rm-ref="${esc(e.link ?? e.archivo)}" aria-label="Pedir un cambio en ${esc(t.texto)}" title="Pedir un cambio">${ic("pencil")}</button>` : "";
	return `<span class="rmentrega ${extra}">${ic(n.icono)}<span class="rmentrega-n">${esc(n.texto)}</span>${rmAbrir(e)}${lapiz}</span>`;
};
/** El link que un agente dejó escrito en el texto de la tarea también es una entrega. */
const rmLinkDe = t => t.link ?? /https:\/\/[^\s)]+/.exec(t.texto)?.[0]?.replace(/[.,;]+$/, "");
function rmEntregaHtml(t) {
	const link = rmLinkDe(t);
	const filas = [link && { link }, t.archivo && { archivo: t.archivo }].filter(Boolean);
	if (!filas.length) return "";
	const viejas = t.versiones ?? [];
	return `<span class="rmentregas">${filas.map(e => rmFila(e, "", t)).join("")}${viejas.length ? `<details class="rmvers"><summary>${viejas.length === 1 ? "1 versión anterior" : `${viejas.length} versiones anteriores`}</summary>${viejas.map(v => [v.link && { link: v.link }, v.archivo && { archivo: v.archivo }].filter(Boolean).map(e => rmFila(e, "vieja")).join("")).join("")}</details>` : ""}</span>`;
}

/** Lo que ocupa la tarjeta abierta, para que el paso siguiente quede debajo y no tapado. */
function rmAltoTarjeta(p) {
	const lineas = texto => Math.ceil((texto?.length ?? 0) / 50);
	const tareas = p.tareas.length ? 24 + p.tareas.reduce((n, t) => n + lineas(t.texto) * 20 + (t.quien ? 18 : 0) + 14, 0) : 60;
	const pie = p.estado === "en curso" ? 40 + lineas(p.listoCuando || "x") * 18 + 52 : 40;
	const entregas = p.tareas.reduce((n, t) => n + (t.link ? 1 : 0) + (t.archivo ? 1 : 0) + (t.versiones?.length ? 1 : 0), 0);
	const partes = p.partes?.length ? p.partes.length * 90 + 40 : 0;
	return 32 + 22 + lineas(p.detalle) * 20 + tareas + pie + entregas * 34 + partes;
}

function roadmapHtml() {
	const r = state.roadmap;
	if (!r) return `<div class="empty"><b>Todavía no hay roadmap</b>Cuando le des al Asistente un plan de varios pasos, aparece acá: un paso por vez, con lo que va tildando el equipo.</div>`;
	const actual = r.pasos.find(p => p.estado === "en curso");
	// 0 es "todos cerrados": tocar el paso abierto lo pliega y queda su título, como los demás.
	const abierto = rmAbierto === 0 ? null : (r.pasos.find(p => p.n === rmAbierto) ?? actual ?? r.pasos.at(-1));
	let y = RM.top;
	const nodos = r.pasos.map((p, i) => {
		const x = i % 2 ? RM.der : RM.izq;
		const nodo = { p, x, y };
		y += p.n === abierto?.n ? Math.max(RM.fila, (rmAltos.get(p.n) ?? rmAltoTarjeta(p)) + 56) : RM.fila;
		return nodo;
	});
	const tramo = (a, b) => `M${a.x} ${a.y} C ${a.x} ${a.y + (b.y - a.y) * 0.6}, ${b.x} ${a.y + (b.y - a.y) * 0.4}, ${b.x} ${b.y}`;
	const hechos = nodos.findIndex(n => n.p.estado !== "aprobado");
	const tramos = nodos.slice(1).map((b, i) => `<path class="${i < (hechos < 0 ? nodos.length : hechos) ? "hecho" : ""}" d="${tramo(nodos[i], b)}"/>`).join("");
	const marca = { aprobado: "hecha", espera_ok: "espera", hecha: "hecha", pendiente: "" };
	const tarea = t => `<li class="${marca[t.estado]}"><button class="rmcheck" data-rm-tarea="${esc(t.id)}" data-hecha="${t.estado === "hecha" ? "" : "1"}" aria-label="${t.estado === "hecha" ? "Destildar" : "Tildar"}: ${esc(t.texto)}">${t.estado === "hecha" ? ic("check") : ""}</button><span class="rmtexto"><span class="rmt" data-rm-editar="tarea" data-id="${esc(t.id)}" title="Tocá para editar">${esc(t.texto)}</span>${t.quien ? `<small>${esc(t.quien)}</small>` : ""}${rmEntregaHtml(t)}</span>${t.estado === "espera_ok" ? `<button class="rmok" data-view="bandeja">Tu OK</button>` : ""}${rmLinkDe(t) || t.archivo ? "" : `<button class="rmborrar rmcitar-t" data-rm-citar="${esc(t.texto)}" data-rm-ref="tarea del roadmap" aria-label="Pedir un cambio en: ${esc(t.texto)}" title="Pedir un cambio">${ic("pencil")}</button>`}<button class="rmborrar" data-rm-borrar-tarea="${esc(t.id)}" data-texto="${esc(t.texto)}" aria-label="Sacar la tarea: ${esc(t.texto)}" title="Sacar la tarea">${ic("x")}</button></li>`;
	// Con partes, el paso se lee en orden: cada tramo con sus tareas, sus entregas y su cierre.
	const cuerpo = p => {
		const mas = parte => (p.estado === "aprobado" ? "" : `<button class="rmmas" data-rm-agregar="tarea" data-n="${p.n}" data-parte="${esc(parte ?? "")}">+ Agregar tarea</button>`);
		if (!p.partes?.length) return `<ul>${p.tareas.map(tarea).join("")}</ul>${mas()}`;
		const enCurso = p.partes.find(pa => p.tareas.some(t => t.parte === pa.clave && t.estado !== "hecha") || !p.tareas.some(t => t.parte === pa.clave));
		const tramo = pa => {
			const suyas = p.tareas.filter(t => t.parte === pa.clave);
			const hechas = suyas.filter(t => t.estado === "hecha").length;
			const estado = suyas.length && hechas === suyas.length ? "hecha" : pa === enCurso && p.estado === "en curso" ? "ahora" : "";
			return `<div class="rmparte ${estado}"><div class="rmparte-h"><span class="rmparte-n">${estado === "hecha" ? ic("check") : `${p.n}${esc(pa.clave)}`}</span><b>${esc(pa.titulo)}</b><small>${hechas} de ${suyas.length}</small></div><ul>${suyas.map(tarea).join("")}</ul>${mas(pa.clave)}${pa.cierre ? `<div class="rmparte-c">Cierra cuando: ${esc(pa.cierre)}</div>` : ""}</div>`;
		};
		const sueltas = p.tareas.filter(t => !p.partes.some(pa => pa.clave === t.parte));
		return `${p.partes.map(tramo).join(`<div class="rmparte-f" aria-hidden="true">↓</div>`)}${sueltas.length ? `<div class="rmparte otras"><div class="rmparte-h"><b>Otras tareas del paso</b></div><ul>${sueltas.map(tarea).join("")}</ul></div>` : ""}`;
	};
	const tarjeta = ({ p, x, y }) => {
		const lado = x === RM.izq ? `left:${x + 52}px` : `left:${x - 52 - 400}px`;
		const listas = p.tareas.filter(t => t.estado === "hecha").length;
		const pie = p.estado === "en curso" ? `<div class="rmgate"><span class="rmrombo"></span><span><b>Punto de encuentro</b>${esc(p.listoCuando || "Revisás lo de este paso y lo aprobás")}</span><button class="b p" data-rm-aprobar="${p.n}" data-faltan="${p.tareas.length - listas}">${p.n === r.pasos.length ? "Aprobar y cerrar el plan" : `Aprobar y abrir el paso ${p.n + 1}`}</button></div>` : p.estado === "aprobado" ? `<div class="rmdone">${ic("check")}Aprobado ${p.aprobadoAt ? ago(p.aprobadoAt) : ""}</div>` : `<div class="rmdone">Se abre cuando apruebes el paso ${p.n - 1}</div>`;
		const masPaso = `<button class="rmmas rmmas-paso" data-rm-agregar="paso" data-n="${p.n}">+ Agregar un paso después de este</button>`;
		return `<div class="rmcard" data-rm-n="${p.n}" style="${lado};top:${y - 28}px"><div class="rmh"><b data-rm-editar="titulo" data-n="${p.n}" title="Tocá para editar">${esc(p.titulo)}</b>${p.tareas.length ? `<span>${listas} de ${p.tareas.length}</span>` : ""}<button class="rmborrar-paso" data-rm-borrar-paso="${p.n}" data-titulo="${esc(p.titulo)}" aria-label="Sacar el paso ${p.n}: ${esc(p.titulo)}" title="Sacar el paso">${ic("trash-2")}</button></div>${p.detalle ? `<p data-rm-editar="detalle" data-n="${p.n}" title="Tocá para editar">${esc(p.detalle)}</p>` : ""}${p.tareas.length ? `<div class="rmbar"><i style="transform:scaleX(${listas / p.tareas.length})"></i></div>${cuerpo(p)}` : (p.subpasosPedidos && Date.now() - Date.parse(p.subpasosPedidos) < 15 * 60_000 ? `<p class="rmvacio rmarmando">Juan está armando los subpasos…</p>` : `<div class="rmsinpasos"><p class="rmvacio">Todavía no tiene subpasos.</p><button class="b" data-rm-subpasos>Que Juan arme los subpasos</button></div>`)}${pie}${masPaso}</div>`;
	};
	const etiqueta = ({ p, x, y }) => `<button class="rmlabel ${x === RM.izq ? "" : "der"}" data-rm-paso="${p.n}" style="${x === RM.izq ? `left:${x + 40}px` : `left:${x - 40 - 240}px`};top:${y - 18}px"><b>${esc(p.titulo)}</b><small>${p.estado === "aprobado" ? "Aprobado" : p.estado === "en curso" ? `En curso · ${p.tareas.filter(t => t.estado === "hecha").length} de ${p.tareas.length}` : esc(p.detalle ?? "")}</small></button>`;
	const nodo = ({ p, x, y }) => `<button class="rmnodo ${p.estado === "aprobado" ? "ok" : p.estado === "en curso" ? "ahora" : ""} ${p.n === abierto?.n ? "abierto" : ""}" data-rm-paso="${p.n}" style="left:${x - 24}px;top:${y - 24}px" aria-label="Paso ${p.n}: ${esc(p.titulo)}">${p.estado === "aprobado" ? ic("check") : p.n}</button>`;
	const alto = y + 80;
	return `<div class="rmap" id="rmap"><div class="rmtitulo"><b>${esc(r.titulo)}</b><small>${actual ? `Paso ${actual.n} de ${r.pasos.length}` : "Plan terminado"}</small></div><div class="rmundo" id="rmundo" style="width:${RM.ancho}px;height:${alto}px;transform:translate(${rmVista.x}px,${rmVista.y}px) scale(${rmVista.s})"><svg class="rmcamino" width="${RM.ancho}" height="${alto}" aria-hidden="true">${tramos}</svg>${nodos.map(nodo).join("")}${nodos.filter(n => n.p.n !== abierto?.n).map(etiqueta).join("")}${abierto ? tarjeta(nodos.find(n => n.p.n === abierto.n)) : ""}</div></div>`;
}

/** Editar en el lugar: el texto pasa a ser un campo; Enter guarda, Esc cancela y salir del campo también guarda. */
function rmEditor(el, valor, guardar, multilinea = false, placeholder = "") {
	const campo = document.createElement(multilinea ? "textarea" : "input");
	campo.className = `rmeditor ${el.tagName === "B" ? "titulo" : ""}`;
	campo.value = valor;
	campo.placeholder = placeholder;
	if (multilinea) campo.rows = 3;
	el.replaceWith(campo);
	campo.focus();
	campo.select?.();
	let listo = false;
	const cerrar = async ok => {
		if (listo) return;
		listo = true;
		const nuevo = campo.value.trim();
		campo.remove();
		if (ok && nuevo && nuevo !== valor.trim()) return void (await guardar(nuevo));
		lastBody = "";
		renderBody();
	};
	campo.addEventListener("keydown", e => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			void cerrar(true);
		}
		if (e.key === "Escape") void cerrar(false);
	});
	campo.addEventListener("blur", () => void cerrar(true));
}

async function rmPost(ruta, cuerpo) {
	const res = await api(ruta, { method: "POST", body: JSON.stringify(cuerpo) });
	if (!res.ok) alert((await res.json().catch(() => ({}))).error ?? "No se pudo");
	await loadState();
	lastBody = "";
	renderBody();
}

document.addEventListener("click", e => {
	const editar = e.target.closest("[data-rm-editar],[data-rm-agregar]");
	if (editar) {
		const d = editar.dataset;
		if (d.rmEditar === "tarea") return rmEditor(editar, editar.textContent, v => rmPost("/roadmap/editar", { tarea: d.id, texto: v }));
		if (d.rmEditar === "titulo") return rmEditor(editar, editar.textContent, v => rmPost("/roadmap/editar", { paso: Number(d.n), titulo: v }));
		if (d.rmEditar === "detalle") return rmEditor(editar, editar.textContent, v => rmPost("/roadmap/editar", { paso: Number(d.n), detalle: v }), true);
		if (d.rmAgregar === "tarea") return rmEditor(editar, "", v => rmPost("/roadmap/editar", { agregarTarea: true, paso: Number(d.n), parte: d.parte || undefined, texto: v }), false, "Nueva tarea y Enter");
		if (d.rmAgregar === "paso") return rmEditor(editar, "", v => rmPost("/roadmap/editar", { agregarPaso: true, paso: Number(d.n), titulo: v }), false, "Título del paso nuevo y Enter");
	}
	const borrar = e.target.closest("[data-rm-borrar-tarea],[data-rm-borrar-paso]");
	if (borrar) {
		const d = borrar.dataset;
		if (d.rmBorrarTarea) {
			if (!confirm(`¿Sacás la tarea "${d.texto}"?`)) return;
			return void rmPost("/roadmap/borrar", { tarea: d.rmBorrarTarea });
		}
		if (!confirm(`¿Sacás el paso "${d.titulo}" con todas sus tareas? Los pasos de después se corren un lugar.`)) return;
		rmAbierto = null;
		return void rmPost("/roadmap/borrar", { paso: Number(d.rmBorrarPaso) });
	}
	const lapiz = e.target.closest("[data-rm-citar]");
	if (lapiz) {
		const asistente = state.agents.find(a => a.role === "asistente");
		if (!asistente) return;
		citaChat = { titulo: lapiz.dataset.rmCitar, ref: lapiz.dataset.rmRef };
		go({ type: "agent", id: asistente.id });
		paintThumbs();
		const input = document.getElementById("input");
		input?.setAttribute("placeholder", "Contale al Asistente qué cambiar");
		input?.focus();
		return;
	}
	if (e.target.closest("[data-cita-x]")) {
		citaChat = null;
		return void paintThumbs();
	}
	const t = e.target.closest("[data-rm-paso],[data-rm-tarea],[data-rm-aprobar],[data-rm-subpasos]");
	if (!t) return;
	const d = t.dataset;
	if ("rmSubpasos" in d) return void rmPost("/roadmap/subpasos", {});
	if (d.rmTarea) return void rmPost("/roadmap/tarea", { id: d.rmTarea, hecha: Boolean(d.hecha) });
	if (d.rmAprobar) {
		const faltan = Number(d.faltan);
		if (faltan > 0 && !confirm(`Quedan ${faltan} ${faltan === 1 ? "tarea sin tildar" : "tareas sin tildar"}. ¿Aprobás el paso igual?`)) return;
		rmAbierto = null;
		return void rmPost("/roadmap/aprobar", { paso: Number(d.rmAprobar) });
	}
	const tocado = Number(d.rmPaso);
	const r = state.roadmap;
	const abiertoAhora = rmAbierto === 0 ? null : (rmAbierto ?? r?.pasos.find(p => p.estado === "en curso")?.n ?? r?.pasos.at(-1)?.n);
	rmAbierto = tocado === abiertoAhora ? 0 : tocado;
	lastBody = "";
	renderBody();
});

// Moverse por el mapa: arrastrar para desplazarse, pellizcar o Ctrl + rueda para acercar. Solo se toca el transform.
let rmArrastre = null;
const rmAplicar = () => {
	const mundo = document.getElementById("rmundo");
	if (mundo) mundo.style.transform = `translate(${rmVista.x}px,${rmVista.y}px) scale(${rmVista.s})`;
};
document.addEventListener("pointerdown", e => {
	const mapa = e.target.closest?.("#rmap");
	if (!mapa || e.button !== 0 || e.target.closest("button,a,input,textarea,[data-rm-editar]")) return;
	rmArrastre = { x: e.clientX - rmVista.x, y: e.clientY - rmVista.y };
	mapa.classList.add("arrastrando");
});
document.addEventListener("pointermove", e => {
	if (!rmArrastre) return;
	rmVista = { ...rmVista, x: e.clientX - rmArrastre.x, y: e.clientY - rmArrastre.y };
	rmAplicar();
});
document.addEventListener("pointerup", () => {
	if (!rmArrastre) return;
	rmArrastre = null;
	document.getElementById("rmap")?.classList.remove("arrastrando");
});
document.addEventListener(
	"wheel",
	e => {
		const mapa = e.target.closest?.("#rmap");
		const mundo = document.getElementById("rmundo");
		if (!mapa || !mundo) return;
		e.preventDefault();
		if (e.ctrlKey) {
			const caja = mundo.parentElement.getBoundingClientRect();
			const base = mundo.offsetLeft;
			const px = e.clientX - caja.left - base;
			const py = e.clientY - caja.top - mundo.offsetTop;
			const s = Math.min(1.8, Math.max(0.4, rmVista.s * Math.exp(-e.deltaY * 0.01)));
			rmVista = { s, x: px - (px - rmVista.x) * (s / rmVista.s), y: py - (py - rmVista.y) * (s / rmVista.s) };
		} else rmVista = { ...rmVista, x: rmVista.x - e.deltaX, y: rmVista.y - e.deltaY };
		rmAplicar();
	},
	{ passive: false },
);

function ceoHtml() {
	const todos = [...state.ceo, ...bwEnviando.filter(s => s.chat === "ceo").map((s, i) => ({ id: `env${i}`, at: s.at, author: state.persona || state.settings?.owner?.name || "Vos", agentId: "dueno", text: s.text }))];
	if (!todos.length) return `<div class="empty"><b>#ceo</b>Acá te van a reportar tus captains cuando tengas un departamento.</div>`;
	const body = p => (p.story?.tag === "Te necesito" ? okCard(p) : p.story?.tag === "Jeremy" && state.jeremy?.lectura ? lecturaCard(p) : p.story ? `<button class="storycard" data-story="${p.id}"><span class="stag">${esc(p.story.tag)}</span><b>${esc(p.story.title)}</b><span class="sview">Ver</span></button>` : `<div class="tx">${md(p.text)}</div>`);
	const open = state.ceo.find(p => p.id === storyOpen);
	const viewer = open?.story?.tag === "Jeremy" ? jeremyVisor(open) : open?.story ? `<div class="sover" data-story-close><div class="sbox" role="dialog" aria-label="${esc(open.story.title)}" data-modal-stay><div class="shead">${avatar({ id: open.agentId })}<span><b>${esc(open.author)}</b><small>${hora(open.at)}</small></span><button class="ic" data-story-close aria-label="Cerrar">${ic("x")}</button></div><div class="sbody"><span class="stag">${esc(open.story.tag)}</span><h2>${esc(open.story.title)}</h2><div>${md(open.text)}</div>${open.story.ticket ? `<button class="b" data-view="tickets">Ver ${esc(open.story.ticket)}</button>` : ""}</div></div></div>` : "";
	return `<div class="col" style="gap:2px">${todos.map(p => `<div class="cmsg">${avatar({ id: p.agentId })}<div><div class="nm"><b>${esc(p.author)}</b><small>${hora(p.at)}</small></div>${body(p)}</div></div>`).join("")}</div>${viewer}`;
}

function reqCard(r) {
	const mode = changing.get(r.id);
	const open = Boolean(mode);
	const asks = r.kind === "ok";
	const prompts = { cambios: "¿Qué querés que cambie?", rechazar: "¿Por qué? Es opcional, pero ayuda a que no lo repita", responder: "Tu respuesta" };
	const sends = { cambios: "Enviar cambios", rechazar: "Rechazar", responder: "Responder" };
	return `<div class="card req" style="max-width:none"><div class="ch"><span class="doc">${ic("file-text")}</span><span><b>${esc(actionOf(r)?.title ?? r.title)}</b><small>${esc(r.author)} · ${{ ok: "pide tu OK", accion: "quiere hacer esto" }[r.kind] ?? "entrega"} · ${hora(r.at)}</small></span><span class="sp"></span><span class="state ${r.state === "pendiente" ? "pend" : ""}">${esc(r.state)}</span></div>
	<div class="body2">${md(r.detail)}${r.payload ? payloadHtml(r.payload) : ""}${r.file ? `<div><button class="b" data-file="${esc(r.file)}">Ver archivo</button></div>` : ""}${r.note ? `<div class="who">Tu nota: ${esc(r.note)}</div>` : ""}
	${open ? `<textarea id="nota-${r.id}" placeholder="${prompts[mode]}"></textarea>` : ""}</div>
	${r.state === "pendiente" ? `<div class="ca">${open ? `<button class="b p" data-send-changes="${r.id}">${sends[mode]}</button><button class="b ghost" data-cancel="${r.id}">Cancelar</button>` : `<button class="b p" data-approve="${r.id}">Aprobar</button><button class="b" data-changes="${r.id}" data-mode="${asks ? "responder" : "cambios"}">${asks ? "Responder" : "Pedir cambios"}</button><span class="sp"></span><button class="b ghost danger" data-changes="${r.id}" data-mode="rechazar">Rechazar</button>`}</div>` : ""}</div>`;
}

function kpiCard(k) {
	return `<div class="card req" style="max-width:none"><div class="ch"><span class="doc">${ic("clock")}</span><span><b>Nuevo KPI: ${esc(k.name)}</b><small>${esc(k.proposedBy)} · meta ${esc(k.target)}</small></span></div><div class="body2"><code>${esc(k.command)}</code></div><div class="ca"><button class="b p" data-kpi-ok="${k.id}">Aprobar</button><button class="b" data-kpi-no="${k.id}">Rechazar</button></div></div>`;
}

const VERBS = { SEND: "Mandar", CREATE: "Crear", UPDATE: "Actualizar", DELETE: "Borrar", REPLY: "Responder", POST: "Publicar", ADD: "Agregar", REMOVE: "Sacar", MOVE: "Mover", INSERT: "Agregar", CANCEL: "Cancelar", SCHEDULE: "Programar", UPLOAD: "Subir" };
const NOUNS = { EMAIL: "un mail", MESSAGE: "un mensaje", EVENT: "un evento", DRAFT: "un borrador", FILE: "un archivo", ROW: "una fila", PAGE: "una página", INVOICE: "una factura", CONTACT: "un contacto", COMMENT: "un comentario" };

/** GMAIL_SEND_EMAIL se lee como "Mandar un mail" y trae el logo de Gmail. */
function actionOf(r) {
	if (r.kind !== "accion") return null;
	const parts = /^[A-Z0-9_]+$/.test(r.title) ? r.title.split("_") : null;
	if (!parts) return { title: r.title, app: "" };
	const [app, verb, ...rest] = parts;
	const noun = rest.length === 1 && NOUNS[rest[0]] ? NOUNS[rest[0]] : rest.join(" ").toLowerCase();
	return { title: `${VERBS[verb] ?? nombre((verb ?? "").toLowerCase())} ${noun}`.trim(), app: app.toLowerCase() };
}

const FIELDS = { recipient_email: "Para", to: "Para", cc: "Copia", bcc: "Copia oculta", subject: "Asunto", body: "Mensaje", text: "Texto", message: "Mensaje", title: "Título", summary: "Título", description: "Descripción", amount: "Monto", start_datetime: "Empieza", end_datetime: "Termina" };

/** Lo que se va a mandar, escrito para una persona. Si no tiene forma simple, se muestra tal cual. */
function payloadHtml(raw) {
	let data = null;
	try {
		data = JSON.parse(raw);
	} catch {
		return `<pre class="payload">${esc(raw)}</pre>`;
	}
	const rows = data && typeof data === "object" && !Array.isArray(data) ? Object.entries(data) : [];
	if (!rows.length || rows.some(([, v]) => typeof v === "object" && v !== null)) return `<pre class="payload">${esc(raw)}</pre>`;
	return `<dl class="pay">${rows.map(([k, v]) => `<dt>${esc(FIELDS[k] ?? nombre(k.replaceAll("_", " ")))}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
}

