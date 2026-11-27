// ---------- Classroom: el piloto que contesta a los clientes ----------
// Corre en el servidor del classroom; acá se ve qué hizo hoy, lo que quedó para el equipo y el modo de cada coach.
// El classroom se abre en el navegador de Leverage, al costado, y queda abierto aunque cambies de vista.
const MODOS_CLS = [["apagado", "Apagado"], ["borrador", "Borrador"], ["automatico", "Automático"]];
const CLS_DEFECTO = "https://classroom.atvos.io";

async function cargarClassroom() {
	const r = await api("/classroom/piloto");
	extra.classroom = await r.json().catch(() => ({ conectado: false, error: "No respondió" }));
	renderBody();
}

function abrirEnNavegador(url) {
	const dock = document.getElementById("dock");
	if (!dock.firstChild) {
		store("webUrl", url);
		dock.innerHTML = webHtml();
	} else {
		const web = document.getElementById("web");
		if (web && web.getURL?.() !== url) web.loadURL(url);
	}
	dock.classList.add("open", "ancho");
	document.querySelector(".app").classList.add("docked", "cls");
}

/** Al entrar a la vista se abre el classroom, salvo que el navegador ya esté en él (no se pierde donde estabas). */
function abrirClassroom() {
	if (!IN_APP) return;
	const base = extra.classroom?.url ?? CLS_DEFECTO;
	const web = document.getElementById("web");
	const actual = web?.getURL?.() ?? "";
	abrirEnNavegador(actual.startsWith(base) ? actual : `${base}/mensajes`);
}

// ---------- Responder: buscar al cliente, ver su chat y pedirle a Juan IA la respuesta ----------
let clsTab = stored("clsTab", "consultas");
let clsConsultas = null;
let clsFiltro = stored("clsFiltro", "sin");
let clsConsulta = null;
let clsResultados = null;
let clsSel = null;
let clsChat = null;
let clsError = "";
let clsBuscarEn = 0;
let clsSondeo = null;

async function buscarClientesCls(q) {
	const yo = ++clsBuscarEn;
	const r = await api(`/classroom/clientes?buscar=${encodeURIComponent(q)}`);
	const d = await r.json().catch(() => ({}));
	if (yo !== clsBuscarEn) return;
	clsResultados = r.ok ? (d.clientes ?? []) : [];
	const caja = document.getElementById("cls-resultados");
	if (caja) caja.innerHTML = resultadosClsHtml();
	else if (view.type === "classroom") renderBody();
}

/** Desde un pedido de la Bandeja o del Tablero: abre Responder con ese cliente y su respuesta armada. */
async function abrirRespuestaCls(nombre) {
	clsTab = "responder";
	store("clsTab", clsTab);
	store("clsBuscar", nombre);
	go({ type: "classroom" });
	await buscarClientesCls(nombre);
	const norm = s => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
	const c = (clsResultados ?? []).find(x => norm(x.nombre) === norm(nombre)) ?? (clsResultados ?? [])[0];
	if (c) await abrirClienteCls(c.cliente_id, c.nombre);
}

async function abrirClienteCls(id, nombre) {
	clsSel = { id: Number(id), nombre };
	clsChat = null;
	clsError = "";
	renderBody();
	await cargarChatCls();
}

async function cargarChatCls() {
	if (!clsSel) return;
	const r = await api(`/classroom/chat?cliente_id=${clsSel.id}`);
	const d = await r.json().catch(() => ({}));
	if (!r.ok) clsError = d.error ?? "El classroom no devolvió el chat.";
	else clsChat = d;
	if (clsTab === "consultas" && clsConsulta?.marca?.estado === "armando" && d.estado === "listo" && clsConsulta.marca.quien === clsConsultasYo) {
		clsConsulta.marca.estado = "lista";
		void marcarConsulta("marcar", "lista").then(cargarConsultas);
	}
	clearTimeout(clsSondeo);
	// Mientras Juan IA arma la respuesta, se mira cada 8 segundos.
	if (clsChat?.estado === "armando" && view.type === "classroom") clsSondeo = setTimeout(cargarChatCls, 8000);
	if (view.type === "classroom" && !document.activeElement?.matches?.("#cls-texto")) {
		renderBody();
		// Lo último que escribió el cliente (y la respuesta armada) es lo que importa: el chat arranca abajo.
		requestAnimationFrame(() => {
			const m = document.getElementById("cls-msgs");
			if (m) m.scrollTop = m.scrollHeight;
		});
	}
}

/** La cara de un cliente: sus iniciales en un color que sale del nombre, así cada uno se reconoce de un vistazo. */
function caraCls(nombre) {
	let h = 0;
	for (const ch of String(nombre ?? "")) h = (h * 31 + ch.codePointAt(0)) >>> 0;
	return `<span class="cls-cara t${h % 6}">${esc(initials(nombre))}</span>`;
}

function resultadosClsHtml() {
	if (clsResultados === null) return `<p class="muted">Buscando…</p>`;
	if (!clsResultados.length) return `<p class="muted">No encontré clientes con ese nombre.</p>`;
	return clsResultados.map(c => `<button class="cls-cli ${clsSel?.id === c.cliente_id ? "on" : ""}" data-cls-cliente="${c.cliente_id}" data-nombre="${esc(c.nombre)}">${caraCls(c.nombre)}<span class="cls-txt"><b>${esc(c.nombre)}</b><small>${esc([c.grupo, c.coach ? `con ${c.coach}` : ""].filter(Boolean).join(" · "))}</small></span></button>`).join("");
}

function mensajeClsHtml(m) {
	const delCliente = m.de === "cliente";
	const adj = (m.adjuntos ?? []).map(a => `<button class="cls-adj" data-cls-url="${esc(a.url)}">${ic("file-text")}<span>${esc(a.nombre)}</span></button>`).join("");
	const looms = (m.looms ?? []).map(u => `<button class="cls-adj" data-cls-url="${esc(u)}">${ic("video")}<span>Loom</span></button>`).join("");
	const hora = m.cuando ? new Date(m.cuando).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
	return `<div class="cls-msg ${delCliente ? "" : "eq"}"><small><b>${esc(delCliente ? (clsChat?.chat?.cliente?.nombre ?? "Cliente") : m.de)}</b> ${esc(hora)}</small>${m.texto ? `<div class="cls-burbuja">${inline(m.texto)}</div>` : ""}${adj || looms ? `<div class="cls-adjs">${adj}${looms}</div>` : ""}</div>`;
}

function respuestaClsHtml() {
	const d = clsChat;
	if (!d) return "";
	const quien = d.quien ?? "vos";
	if (d.estado === "armando") return `<div class="cls-resp armando"><b>Juan IA está armando la respuesta</b><small>Lee el chat, abre lo que mandó adjunto y transcribe los Looms. Puede tardar unos minutos.</small></div>`;
	const fallo = d.estado === "fallo" ? `<div class="soft-note">Juan IA terminó sin dejar la respuesta. Mirá su chat para ver qué pasó, o probá de nuevo.</div>` : "";
	const b = d.borrador;
	if (!b) return fallo;
	return `${fallo}<div class="cls-resp"><div class="cls-resp-top"><b>Respuesta armada</b><span class="sp"></span><small>solo la ves vos</small></div>
	<textarea id="cls-texto" rows="7" aria-label="Respuesta para ${esc(clsSel?.nombre ?? "el cliente")}">${esc(b.texto)}</textarea>
	${b.explicacion ? `<div class="cls-porque"><b>Qué le estás diciendo, en simple</b><span>${inline(b.explicacion)}</span></div>` : ""}
	<div class="cls-resp-acc"><button class="b ghost" data-cls-otra>Pedir otra</button><button class="b ghost" data-cls-descartar="${clsSel?.id}">Descartar</button><span class="sp"></span><button class="b go" data-cls-mandar="${clsSel?.id}">Mandar como ${esc(quien)}</button></div></div>`;
}

function responderHtml() {
	const izq = `<section class="cls-buscar"><label class="cls-lbl">Buscar un cliente<input id="cls-buscar" placeholder="Nombre del cliente" autocomplete="off" value="${esc(stored("clsBuscar", ""))}"></label><div id="cls-resultados" class="cls-lista">${resultadosClsHtml()}</div></section>`;
	if (!clsSel) return `<div class="cls-resp-grid">${izq}<section class="cls-chat vacio"><div class="empty"><b>Elegí un cliente</b>Vas a ver su chat y, con un botón, Juan IA te arma la respuesta correcta para que la mandes vos.</div></section></div>`;
	return `<div class="cls-resp-grid">${izq}${chatPaneHtml()}</div>`;
}

function chatPaneHtml() {
	if (!clsSel) return `<section class="cls-chat vacio"><div class="empty"><b>Elegí una consulta</b>Vas a ver el chat del cliente y, con un botón, Juan IA te arma la respuesta correcta para que la mandes vos.</div></section>`;
	const d = clsChat;
	const c = d?.chat?.cliente ?? {};
	const m = clsConsulta?.marca;
	const deOtro = m && clsConsultasYo && m.quien !== clsConsultasYo;
	const tomada = m ? `<small class="cls-tomada ${deOtro ? "otro" : ""}">${deOtro ? `La está respondiendo ${esc(m.quien)}` : "Tomada por vos · el equipo lo ve"}</small>${deOtro ? "" : `<button class="linkb" data-cls-soltar>Soltar</button>`}` : "";
	const cab = `<div class="cls-chat-top"><b>${esc(clsSel.nombre)}</b><small>${esc([c.plan, c.vence ? `vence ${c.vence}` : ""].filter(Boolean).join(" · "))}</small><span class="sp"></span>${tomada}${d?.chat?.canal_id ? `<button class="linkb" data-cls-canal="${d.chat.canal_id}">Abrir en el classroom</button>` : ""}</div>`;
	const cuerpo = clsError ? `<div class="soft-note">${esc(clsError)}</div>` : !d ? `<p class="muted">Abriendo el chat…</p>` : (d.chat?.mensajes ?? []).slice(-12).map(mensajeClsHtml).join("");
	const armando = d?.estado === "armando" || Boolean(deOtro);
	const pie = `<div class="cls-pie"><span class="muted">Juan IA lee todo, también los Looms y los adjuntos, y la escribe en tu voz.</span><span class="sp"></span><button class="b go" data-cls-armar ${armando || !d ? "disabled" : ""}>${armando ? "Armando…" : "Armar respuesta"}</button></div>`;
	return `<section class="cls-chat">${cab}<div class="cls-msgs" id="cls-msgs">${cuerpo}${respuestaClsHtml()}</div>${pie}</section>`;
}

let clsConsultasYo = null;

async function cargarConsultas() {
	const r = await api("/classroom/consultas");
	const d = await r.json().catch(() => ({}));
	clsConsultas = r.ok ? d : { error: d.error ?? "El classroom no devolvió las consultas.", consultas: [] };
	clsConsultasYo = d.yo ?? null;
	if (clsConsulta) clsConsulta = (clsConsultas.consultas ?? []).find(x => x.clave === clsConsulta.clave) ?? clsConsulta;
	if (view.type === "classroom" && clsTab === "consultas" && !document.activeElement?.matches?.("#cls-texto")) renderBody();
}

async function marcarConsulta(accion, estado) {
	if (!clsConsulta) return true;
	const r = await api(`/classroom/consultas/${accion}`, { method: "POST", body: JSON.stringify({ clave: clsConsulta.clave, cliente: clsConsulta.cliente, estado }) });
	if (!r.ok) {
		clsError = (await r.json().catch(() => ({}))).error ?? "No se pudo.";
		return false;
	}
	return true;
}

async function abrirConsulta(clave) {
	const q = (clsConsultas?.consultas ?? []).find(x => x.clave === clave);
	if (!q) return;
	clsConsulta = q;
	if (q.cliente_id) return abrirClienteCls(q.cliente_id, q.cliente);
	// Un chat que dejó el piloto viene sin id de cliente: se busca por nombre.
	const r = await api(`/classroom/clientes?buscar=${encodeURIComponent(q.cliente)}`);
	const c = ((await r.json().catch(() => ({}))).clientes ?? [])[0];
	if (c) return abrirClienteCls(c.cliente_id, c.nombre);
	clsError = `No encontré a ${q.cliente} en el classroom.`;
	renderBody();
}

function consultasHtml() {
	const d = clsConsultas;
	const todas = d?.consultas ?? [];
	const yo = clsConsultasYo;
	const sin = todas.filter(q => !q.marca);
	const mias = todas.filter(q => q.marca && q.marca.quien === yo);
	const lista = clsFiltro === "mias" ? mias : clsFiltro === "todas" ? todas : sin;
	const filtro = (id, nombre, n) => `<button class="${clsFiltro === id ? "on" : ""}" data-cls-filtro="${id}">${nombre} · ${n}</button>`;
	const espera = h => (h === null || h === undefined ? "" : `<small class="cls-espera ${h >= 12 ? "mucha" : h >= 4 ? "media" : ""}">espera ${h} h</small>`);
	const estado = q => {
		if (!q.marca) return "";
		const txt = q.marca.quien === yo ? ({ tomada: "Tomada por vos", armando: "Juan IA está armando", lista: "Respuesta lista" })[q.marca.estado] ?? "" : `La está respondiendo ${q.marca.quien}`;
		return `<small class="cls-q-estado">${esc(txt)}</small>`;
	};
	const items = !d ? `<p class="muted spad">Trayendo las consultas…</p>` : d.error ? `<div class="soft-note">${esc(d.error)}</div>` : !lista.length ? `<p class="muted spad">${clsFiltro === "mias" ? "No tenés consultas tomadas." : "No hay consultas pendientes."}</p>` : lista.map(q => `<button class="cls-q ${clsConsulta?.clave === q.clave ? "on" : ""}" data-cls-consulta="${esc(q.clave)}"><span class="cls-q-top"><b>${esc(q.cliente)}</b>${espera(q.espera_horas)}<span class="sp"></span>${estado(q)}</span><span class="cls-q-que">${esc(q.tipo)} · ${esc(q.que)}</span><small class="cls-q-de">${q.origen === "update" ? `del update de Mauri${q.para ? ` · para ${esc(q.para)}` : ""}` : "chat que dejó el piloto"}</small></button>`).join("");
	const aviso = d && !d.en_la_nube && !d.error ? `<div class="soft-note">Sin conexión con la base del equipo: la lista se ve, pero no se puede tomar ni ver quién la está respondiendo.</div>` : "";
	return `<div class="cls-resp-grid"><section class="cls-consultas"><div class="seg cls-filtros">${filtro("sin", "Sin tomar", sin.length)}${filtro("mias", "Mías", mias.length)}${filtro("todas", "Todas", todas.length)}</div>${aviso}<div class="cls-q-lista">${items}</div></section>${chatPaneHtml()}</div>`;
}

function classroomHtml() {
	const c = extra.classroom;
	const tab = (id, nombre) => `<button role="tab" aria-selected="${clsTab === id}" class="${clsTab === id ? "on" : ""}" data-cls-tab="${id}">${nombre}</button>`;
	// Arriba: el classroom al que está conectado y las pestañas en la cápsula (atv.css). Las consultas sin tomar llevan su número.
	const sinTomar = (clsConsultas?.consultas ?? []).filter(q => !q.marca).length;
	const host = (c?.url ?? CLS_DEFECTO).replace(/^https?:\/\//, "");
	const tabs = `<div class="vt-cab cls-cab"><span class="vt-tit"><b>Classroom</b><small>${c?.conectado ? `<i class="cls-ok"></i>${esc(host)} · conectado` : esc(host)}</small></span>${c?.conectado && !c.error ? `<div class="seg cls-tabs" role="tablist" aria-label="Classroom">${tab("consultas", `Consultas${sinTomar ? ` <span class="cls-n">${sinTomar}</span>` : ""}`)}${tab("responder", "Responder")}${tab("piloto", "Piloto")}</div>` : ""}</div>`;
	if (c?.conectado && !c.error && clsTab === "consultas") return `${tabs}${consultasHtml()}`;
	if (c?.conectado && !c.error && clsTab === "responder") return `${tabs}${responderHtml()}`;
	return `${tabs}${pilotoClsHtml()}`;
}

function pilotoClsHtml() {
	const c = extra.classroom;
	if (!c) return `<div class="empty"><b>Cargando el classroom</b></div>`;
	if (!c.conectado)
		return `<div class="cls"><div class="empty"><b>${c.vencida ? "Tu conexión con el classroom se cortó" : "Falta entrar con tu cuenta del classroom"}</b>${c.vencida ? "Entrá de nuevo con tu cuenta y sigue como antes. " : ""}Se abre el classroom, aceptás y listo: las consultas, las respuestas y lo que mandes salen a tu nombre. No hace falta pegar ninguna clave.</div><button class="b p" data-classroom-entrar ${conectandoClassroom ? "disabled" : ""}>${conectandoClassroom ? "Esperando que aceptes en el classroom…" : "Entrar con el classroom"}</button>${provError.classroomLogin ? `<div class="who">${esc(provError.classroomLogin)}</div>` : ""}</div>`;
	if (c.error) return `<div class="cls"><div class="empty"><b>El classroom no respondió</b>${esc(c.error)}</div><button class="b" data-cls-recargar>Reintentar</button></div>`;
	const h = c.hoy ?? {};
	const tile = (n, txt, rojo) => `<div class="cls-tile ${rojo ? "rojo" : ""}"><b>${n ?? 0}</b><small>${txt}</small></div>`;
	const modos = (c.modos ?? []).map(m => `<div class="cls-fila"><span>${esc(m.nombre)}</span><div class="seg cls-seg" role="radiogroup" aria-label="Modo de ${esc(m.nombre)}">${MODOS_CLS.map(([id, nom]) => `<button role="radio" aria-checked="${m.modo === id}" class="${m.modo === id ? "on" : ""}" data-cls-modo="${m.admin_id}" data-modo="${id}">${nom}</button>`).join("")}</div></div>`).join("");
	const espera = iso => (iso ? `espera hace ${lasted(iso, new Date()).replace(/ 0 min$/, "")}` : "");
	const paraVos = (c.para_vos ?? []).map(p => `<button class="cls-vos" data-cls-canal="${p.canal_id}">${caraCls(p.cliente ?? "Cliente")}<span class="cls-txt"><b>${esc(p.cliente ?? "Cliente")}</b><small>${esc(p.motivo ?? "")}</small></span><small class="cls-espera">${espera(p.creado_en)}</small></button>`).join("");
	const n = (c.para_vos ?? []).length;
	return `<div class="cls clsdos">
	<section class="cls-izq"><h2 class="cls-tit">Esperan respuesta <span>${n}</span></h2><p class="muted">Los chats de clientes que el piloto dejó para el equipo. Al tocar uno se abre en el classroom, con la respuesta propuesta.</p>${paraVos ? `<div class="cls-lista">${paraVos}</div>` : `<p class="tbvacio">Ningún cliente espera respuesta.</p>`}${IN_APP ? `<button class="b ghost" data-cls-abrir>Abrir el classroom</button>` : `<a class="b ghost" href="${esc(c.url)}/mensajes" target="_blank" rel="noreferrer">Abrir el classroom</a>`}</section>
	<section class="cls-der">
		<div class="ajcard"><h3 class="clabel">Hoy</h3><div class="cls-tiles">${tile(h.automatico, "salieron solos")}${tile(h.enviado, "borradores enviados tal cual")}${tile(h.editado, "editados antes de mandar")}${tile(n, "para el equipo", n > 0)}</div></div>
		<div class="ajcard"><h3 class="clabel">Modo de cada coach</h3><div class="cls-modos">${modos || `<div class="muted">No hay coaches activos.</div>`}</div></div>
		<div class="ajcard"><h3 class="clabel">Conocimiento</h3><div class="muted">${c.llamadasJuan ? `${c.llamadasJuan} llamadas de Fathom de Juan en esta compu. La IA de Juan las lee para contestar como él.` : "Las llamadas de Fathom de Juan se bajan solas en la próxima media hora."}</div></div>
	</section>
</div>`;
}

document.addEventListener("click", async e => {
	const t = e.target.closest("[data-cls-modo],[data-cls-canal],[data-cls-abrir],[data-cls-recargar]");
	if (!t) return;
	const base = extra.classroom?.url ?? CLS_DEFECTO;
	if (t.dataset.clsCanal) {
		if (IN_APP) abrirEnNavegador(`${base}/mensajes?c=${encodeURIComponent(t.dataset.clsCanal)}`);
		else window.open(`${base}/mensajes?c=${encodeURIComponent(t.dataset.clsCanal)}`, "_blank", "noreferrer");
		return;
	}
	if ("clsAbrir" in t.dataset) return abrirEnNavegador(`${base}/mensajes`);
	if ("clsRecargar" in t.dataset) return cargarClassroom();
	const r = await api(`/classroom/piloto/${t.dataset.clsModo}`, { method: "PUT", body: JSON.stringify({ modo: t.dataset.modo }) });
	if (!r.ok) {
		extra.classroom = { ...extra.classroom, error: (await r.json().catch(() => ({}))).error ?? "No se pudo cambiar el modo" };
		return renderBody();
	}
	await cargarClassroom();
});

document.addEventListener("input", e => {
	if (e.target.id !== "cls-buscar") return;
	store("clsBuscar", e.target.value);
	clearTimeout(e.target._t);
	e.target._t = setTimeout(() => buscarClientesCls(e.target.value.trim()), 250);
});

document.addEventListener("click", async e => {
	const t = e.target.closest("[data-cls-tab],[data-cls-cliente],[data-cls-armar],[data-cls-otra],[data-cls-mandar],[data-cls-descartar],[data-cls-url],[data-cls-filtro],[data-cls-consulta],[data-cls-soltar]");
	if (!t) return;
	if (t.dataset.clsTab) {
		clsTab = t.dataset.clsTab;
		store("clsTab", clsTab);
		if (clsTab === "consultas") void cargarConsultas();
		return renderBody();
	}
	if (t.dataset.clsFiltro) {
		clsFiltro = t.dataset.clsFiltro;
		store("clsFiltro", clsFiltro);
		return renderBody();
	}
	if (t.dataset.clsConsulta) return abrirConsulta(t.dataset.clsConsulta);
	if ("clsSoltar" in t.dataset) {
		await marcarConsulta("soltar");
		return cargarConsultas();
	}
	if (t.dataset.clsCliente) {
		clsConsulta = null;
		return abrirClienteCls(t.dataset.clsCliente, t.dataset.nombre);
	}
	if (t.dataset.clsUrl) return IN_APP ? abrirEnNavegador(t.dataset.clsUrl) : window.open(t.dataset.clsUrl, "_blank", "noreferrer");
	if (!clsSel) return;
	t.disabled = true;
	const enConsultas = clsTab === "consultas" && clsConsulta;
	// Desde Consultas, armar la respuesta es tomarla: el equipo ve que la está respondiendo esta persona.
	if (enConsultas && ("clsArmar" in t.dataset || "clsOtra" in t.dataset) && !(await marcarConsulta("tomar"))) {
		t.disabled = false;
		return renderBody();
	}
	let r;
	if ("clsArmar" in t.dataset || "clsOtra" in t.dataset) r = await api("/classroom/armar", { method: "POST", body: JSON.stringify({ cliente_id: clsSel.id, nombre: clsSel.nombre, otra: "clsOtra" in t.dataset }) });
	else if (t.dataset.clsMandar) r = await api(`/classroom/respuesta/${t.dataset.clsMandar}/mandar`, { method: "POST", body: JSON.stringify({ texto: document.getElementById("cls-texto")?.value ?? "" }) });
	else r = await api(`/classroom/respuesta/${t.dataset.clsDescartar}/descartar`, { method: "POST", body: "{}" });
	const d = await r.json().catch(() => ({}));
	clsError = r.ok ? "" : (d.error ?? "No se pudo.");
	t.disabled = false;
	if (r.ok && enConsultas) {
		if ("clsArmar" in t.dataset || "clsOtra" in t.dataset) await marcarConsulta("marcar", "armando");
		else if (t.dataset.clsMandar) await marcarConsulta("marcar", "respondida");
		else if (t.dataset.clsDescartar) await marcarConsulta("soltar");
		void cargarConsultas();
	}
	await cargarChatCls();
});

