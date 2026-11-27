// Lo que hay pintado adentro del chat de Instagram y lo último que se armó, para no rehacerlo si no cambió.
let dmPintado = null;
let dmUltimo = null;
let altoDm = null;
// Repintar reemplaza todo el HTML: cada caja con scroll propio (listas, documentos, trazas) volvería arriba sola.
// Se anota dónde estaba cada una, por su etiqueta, su primera clase y su orden, y se la devuelve ahí.
const firmaScroll = n => `${n.tagName}.${n.classList[0] ?? ""}`;
function anotarScrolls(el) {
	const cuenta = new Map();
	const anotados = new Map();
	for (const n of el.querySelectorAll("*")) {
		const firma = firmaScroll(n);
		const i = cuenta.get(firma) ?? 0;
		cuenta.set(firma, i + 1);
		// La charla y la lista de la Bandeja deciden solas dónde quedan (abajo al abrir y al mandar).
		if (n.classList?.contains("bwhilo") || n.classList?.contains("bwfilas")) continue;
		if (n.scrollTop || n.scrollLeft) anotados.set(`${firma}#${i}`, [n.scrollTop, n.scrollLeft]);
	}
	return anotados;
}
function devolverScrolls(el, anotados) {
	if (!anotados.size) return;
	const cuenta = new Map();
	for (const n of el.querySelectorAll("*")) {
		const firma = firmaScroll(n);
		const i = cuenta.get(firma) ?? 0;
		cuenta.set(firma, i + 1);
		const donde = anotados.get(`${firma}#${i}`);
		if (donde) [n.scrollTop, n.scrollLeft] = donde;
	}
}
function renderBody() {
	void revisarArchivos();
	// Mientras el dueño escribe en el roadmap, no se repinta: se le borraría lo que está escribiendo.
	if (view.type === "roadmap" && document.querySelector(".rmeditor")) return;
	const a = activeAgent();
	const sinClaude = state.login === false && (view.type === "agent" || view.type === "equipo");
	const html = sinClaude ? faltaClaudeHtml() : view.type === "agent" ? (a ? chatHtml(a) : `<div class="empty"><b>Estamos preparando tu Asistente</b>Tarda unos segundos.</div>`) : VIEWS[view.type]();
	if (html === lastBody) return;
	const el = document.getElementById("body");
	const typed = [...el.querySelectorAll("input[id],textarea[id],select[id]")].map(t => [t.id, t.value]);
	const focus = document.activeElement?.id;
	// Dónde estaba el cursor: enfocar de nuevo un campo recién pintado lo deja al principio.
	const activo = document.activeElement;
	const cursor = focus && typeof activo?.selectionStart === "number" ? [activo.selectionStart, activo.selectionEnd, activo.selectionDirection ?? "none", activo.scrollLeft, activo.scrollTop] : null;
	const modalOpen = el.querySelector(".omodal");
	const lectura = el.querySelector(".jmsgs");
	const hiloViejo = el.querySelector(".bwhilo");
	const hiloAntes = hiloViejo && { chat: hiloViejo.dataset.chat, top: hiloViejo.scrollTop, alFinal: hiloViejo.scrollHeight - hiloViejo.scrollTop - hiloViejo.clientHeight < 40 };
	const filasViejas = el.querySelector(".bwfilas")?.scrollTop ?? 0;
	const leyendo = lectura && { clave: lectura.dataset.charla, top: lectura.scrollTop };
	const mismaVista = tabKey(view) === bodyVista;
	const scrolls = mismaVista ? anotarScrolls(el) : new Map();
	const arriba = el.scrollTop;
	const medios = [...el.querySelectorAll("video,audio")];
	// El chat de Instagram que no cambió se deja tal cual: rehecho, sus fotos vuelven a cargar y el chat salta.
	const dmViejo = el.querySelector("#dm-msgs");
	const dmIgual = Boolean(dmViejo && dmPintado && dmUltimo && dmPintado.id === dmUltimo.id && dmPintado.html === dmUltimo.html);
	const fotosDm = dmViejo && dmPintado?.id === dmUltimo?.id ? [...dmViejo.querySelectorAll("img")].filter(i => i.complete && i.naturalHeight) : [];
	el.innerHTML = html;
	const dmNuevo = el.querySelector("#dm-msgs");
	if (dmNuevo && dmIgual) dmNuevo.replaceWith(dmViejo);
	else if (dmNuevo) {
		// Cambió (llegó o se mandó un mensaje): las fotos que ya estaban se reusan, con su alto ya puesto.
		for (const nueva of dmNuevo.querySelectorAll("img")) {
			const i = fotosDm.findIndex(f => f.getAttribute("src") === nueva.getAttribute("src"));
			if (i >= 0) nueva.replaceWith(fotosDm.splice(i, 1)[0]);
		}
	}
	dmPintado = dmNuevo ? dmUltimo : null;
	// Un video o un audio que ya estaba se reusa tal cual. Creado de nuevo, se cortaría y volvería a 0,
	// y mientras vuelve a cargar no ocupa lugar: el chat saltaría. Va después del chat de Instagram: si el chat
	// quedó como estaba, sus videos ya están en su lugar y no hay que sacárselos.
	for (const nuevo of el.querySelectorAll("video,audio")) {
		const i = medios.indexOf(nuevo) >= 0 ? medios.indexOf(nuevo) : medios.findIndex(m => m.getAttribute("src") === nuevo.getAttribute("src"));
		if (i < 0) continue;
		const viejo = medios.splice(i, 1)[0];
		if (viejo !== nuevo) nuevo.replaceWith(viejo);
	}
	lastBody = html;
	bodyVista = tabKey(view);
	const hiloNuevo = el.querySelector(".bwhilo");
	if (hiloNuevo) {
		const foco = bwFoco && document.getElementById(`bw-${bwFoco}`);
		if (foco) {
			hiloNuevo.scrollTop = foco.offsetTop - 24;
			bwFoco = null;
		} else hiloNuevo.scrollTop = Date.now() > bwBajarHasta && hiloAntes && hiloAntes.chat === hiloNuevo.dataset.chat && !hiloAntes.alFinal ? hiloAntes.top : hiloNuevo.scrollHeight;
		const filas = el.querySelector(".bwfilas");
		if (filas) filas.scrollTop = filasViejas;
	}
	// El chat se repinta mientras el agente trabaja: atados al reloj de la página, los puntos no vuelven a arrancar.
	for (const punto of el.querySelectorAll(".typing i, .pase-anim")) for (const anim of punto.getAnimations()) anim.startTime = 0;
	if (modalOpen) el.querySelector(".omodal")?.classList.add("still");
	if (view.type === "equipo") drawOrg();
	for (const [id, value] of typed) {
		const t = document.getElementById(id);
		if (t) t.value = value;
	}
	// Enfocar de nuevo la caja no tiene que mover la página para mostrarla.
	if (focus) {
		const campo = document.getElementById(focus);
		campo?.focus({ preventScroll: true });
		if (campo && cursor && typeof campo.setSelectionRange === "function") {
			try {
				campo.setSelectionRange(cursor[0], cursor[1], cursor[2]);
				campo.scrollLeft = cursor[3];
				campo.scrollTop = cursor[4];
			} catch {
				// Un campo de número o de fecha no tiene cursor de texto.
			}
		}
	}
	if (focus === "input") pintarMencion(document.getElementById("input"));
	pintarEspejo(document.getElementById("input"));
	const pitch = document.getElementById("onb-pitch");
	if (pitch) grow(pitch);
	devolverEscrito("juan-input");
	if (document.getElementById("juan-input")) paintThumbs();
	const paraJuan = document.getElementById("juan-input");
	if (paraJuan?.value) grow(paraJuan);
	// Con el texto y los altos ya repuestos, cada caja vuelve a donde estaba.
	if (mismaVista) {
		dejarEn(el, arriba);
		devolverScrolls(el, scrolls);
	}
	// Un chat de Instagram recién abierto arranca abajo, en lo último, como en Instagram.
	const dmMsgs = el.querySelector("#dm-msgs");
	if (dmMsgs && (dms.bajar || (dms.pegado && !dmIgual))) {
		dmMsgs.scrollTop = dmMsgs.scrollHeight;
		dms.bajar = false;
		dms.pegado = true;
	}
	// Si la caja se achica (la de escribir crece, aparece un aviso), lo último sigue a la vista.
	if (dmMsgs && typeof ResizeObserver !== "undefined") {
		altoDm ??= new ResizeObserver(() => {
			const caja = document.getElementById("dm-msgs");
			if (caja && dms.pegado) caja.scrollTop = caja.scrollHeight;
		});
		altoDm.disconnect();
		altoDm.observe(dmMsgs);
	}
	// Un mensaje nuevo baja hasta lo último; si estás leyendo más arriba, repintar no te mueve.
	// Va después de que la caja de texto recupera su alto: si no, al crecer tapa los últimos renglones y el chat parece subir.
	const charla = el.querySelector(".jmsgs");
	if (charla) {
		// Otra charla arranca abajo. En la misma, solo se baja si estabas abajo: si subiste a leer, no te mueve.
		const mismaCharla = leyendo?.clave.split(":")[0] === charla.dataset.charla.split(":")[0];
		if (!mismaCharla || estadoScroll.juan.pegado) irAlFinal(charla);
		else dejarEn(charla, leyendo.top);
	}
	// Si la tarjeta abierta quedó más alta de lo calculado, se acomoda el sendero una vez con el alto real.
	const tarjeta = el.querySelector(".rmcard");
	if (tarjeta && Math.abs((rmAltos.get(Number(tarjeta.dataset.rmN)) ?? 0) - tarjeta.offsetHeight) > 4) {
		rmAltos.set(Number(tarjeta.dataset.rmN), tarjeta.offsetHeight);
		lastBody = "";
		return renderBody();
	}
	const opened = view.type === "agent" && chatScrolled !== view.id;
	chatScrolled = view.type === "agent" ? view.id : null;
	// Solo se baja al abrir el chat o si estabas abajo. Que el agente esté trabajando o que haya un mensaje
	// enviándose no alcanza: eso era lo que te bajaba a la fuerza mientras leías más arriba.
	if (opened || (estadoScroll.body.pegado && esChatConFinal())) irAlFinal(el);
	// El contenido es nuevo: se vigila su alto para seguir abajo cuando termine de cargar.
	if (altoDelChat && el.firstElementChild) altoDelChat.observe(el.firstElementChild);
}

const tabKey = v => `${v.type}:${v.id ?? ""}`;

function rememberTab(v) {
	if ((v.type === "agent" && !v.id) || v.type === "onboarding") return;
	const key = tabKey(v);
	const i = tabs.findIndex(t => tabKey(t) === key);
	if (i >= 0) tabs[i] = v;
	else tabs = [...tabs, v].slice(-8);
	store("tabs", tabs);
}

function tabLabel(t) {
	if (t.type !== "agent") return { name: TITLES[t.type]?.[0] ?? t.type, lead: ic(TITLES[t.type]?.[2] ?? "file-text") };
	const a = state.agents.find(x => x.id === t.id);
	return a ? { name: a.name, lead: avatar(a, "xs") } : null;
}

function tabsHtml() {
	return "";
	const list = tabs.map((t, i) => ({ t, i, label: tabLabel(t) })).filter(x => x.label);
	if (list.length < 2) return "";
	return `<div class="tabs">${list.map(({ t, i, label }) => `<div class="tab ${tabKey(t) === tabKey(view) ? "on" : ""}"><button class="tgo" data-tab="${i}">${label.lead}<span>${esc(label.name)}</span></button><button class="tabx" data-tab-close="${i}" aria-label="Cerrar ${esc(label.name)}">${ic("x")}</button></div>`).join("")}</div>`;
}

function inboxTools() {
	const opt = (id, label) => `<button class="${inboxFilter === id ? "on" : ""}" data-inbox="${id}">${label}</button>`;
	return `<span class="sp"></span><div class="seg">${opt("todo", "Todo")}${opt("aprobar", `Tu OK${pending().length + proposed().length ? ` · ${pending().length + proposed().length}` : ""}`)}${opt("canales", `Reportes${unreadCeo().length ? ` · ${unreadCeo().length} sin leer` : ""}`)}</div><button class="b" data-read-all>${ic("check")}Marcar leído</button>`;
}

function renderHead() {
	const a = activeAgent();
	// La pantalla abierta queda marcada en la hoja: el diseño (atv.css) adapta la cabecera según cuál sea.
	const hoja = document.getElementById("main");
	if (hoja) hoja.dataset.vista = view.type;
	if (view.type === "onboarding" || view.type === "tablero" || view.type === "historial" || view.type === "bandeja") {
		setHtml("head", "");
		return;
	}
	const [t, sub, icon] = TITLES[view.type] ?? [];
	const n = view.type === "bandeja" ? newInbox().length + (unreadCeo().length ? 1 : 0) : 0;
	setHtml("head", tabsHtml() + (view.type === "agent" ? (a ? headerFor(a) : "") : `<div class="head slim">${ic(icon)}<b>${t}</b>${view.type === "bandeja" ? `<small>${n || ""}</small>${inboxTools()}` : sub ? `<small>${sub}</small>` : ""}</div>`));
}

// El chat sigue al final solo mientras estés al final. Lo decide lo que hace la persona, nunca un repintado:
// subir (con la rueda, el dedo, el teclado o la barra) lo suelta al instante, y volver al final lo vuelve a pegar.
// Si algo cambia de alto estando pegado (una imagen que carga, el agente que suma un paso), vuelve abajo solo.
const SUELTA_PX = 4;
const FINAL_PX = 24;
const estadoScroll = { body: { pegado: true, top: 0 }, juan: { pegado: true, top: 0 } };
const cualScroll = el => (el?.id === "body" ? estadoScroll.body : el?.classList?.contains("jmsgs") ? estadoScroll.juan : null);
const esChatConFinal = () => view.type === "agent" || view.type === "ceo";
/** Mover la caja desde el código: se anota dónde quedó, así el aviso de scroll que llega después no parece una subida. */
function dejarEn(el, top) {
	el.scrollTop = top;
	const s = cualScroll(el);
	if (s) s.top = el.scrollTop;
}
function irAlFinal(el) {
	dejarEn(el, el.scrollHeight);
	const s = cualScroll(el);
	if (s) s.pegado = true;
}
function bajarSiPegado() {
	const el = document.getElementById("body");
	if (el && estadoScroll.body.pegado && esChatConFinal()) irAlFinal(el);
}
document.addEventListener("scroll", e => {
	const s = cualScroll(e.target);
	if (!s) return;
	const t = e.target.scrollTop;
	// Quedó más arriba de donde estaba: la persona subió. Si está al final, vuelve a seguir. Lo demás no cambia nada.
	if (t < s.top - SUELTA_PX) s.pegado = false;
	else if (e.target.scrollHeight - t - e.target.clientHeight <= FINAL_PX) s.pegado = true;
	s.top = t;
}, true);
// La rueda hacia arriba suelta en el momento, sin esperar a que el scroll se mueva: si no, un repintado te gana de mano.
document.addEventListener("wheel", e => {
	const caja = e.target?.closest?.("#body,.jmsgs");
	const s = cualScroll(caja);
	if (s && e.deltaY < 0 && caja.scrollTop > 0) s.pegado = false;
}, { passive: true, capture: true });
document.addEventListener("load", e => {
	if (e.target?.closest?.("#body") && /^(IMG|VIDEO)$/.test(e.target.tagName)) bajarSiPegado();
}, true);
let altoDelChat = null;
function vigilarAltoDelChat() {
	altoDelChat?.disconnect();
	const el = document.getElementById("body");
	if (!el || typeof ResizeObserver === "undefined") return;
	altoDelChat = new ResizeObserver(bajarSiPegado);
	altoDelChat.observe(el);
	if (el.firstElementChild) altoDelChat.observe(el.firstElementChild);
}

function renderShell() {
	const isChat = view.type === "agent" || view.type === "ceo";
	document.getElementById("main").innerHTML = `<button class="mback" data-mback aria-label="Volver">${ic("chevron-left")}</button><div id="head"></div><div class="thread solo" id="body" style="overflow:auto"></div>
	${isChat ? `<div class="composer"><form class="box" id="composer"><div id="thumbs"></div><button type="button" class="ic" id="attach" data-tip="Adjuntar" aria-label="Adjuntar archivo">${ic("plus")}</button><input type="file" id="attach-input" multiple hidden><div class="campo"><div class="espejo" id="espejo" aria-hidden="true"></div><textarea id="input" rows="1" placeholder="${view.type === "ceo" ? "Escribí en #ceo" : "Escribile a tu equipo"}"></textarea></div>${botonVoz("input")}<button class="send" id="send" aria-label="Enviar">${ic("arrow-up")}</button></form></div>` : "<div></div>"}
	<div id="file"></div>`;
	lastBody = "";
	estadoScroll.body.pegado = true;
	renderHead();
	renderBody();
	vigilarAltoDelChat();
	devolverEscrito("input");
	if (isChat) document.getElementById("input")?.focus();
}

/** Hasta cuándo leíste cada chat de la Bandeja: abrir un chat limpia su número, aunque lo que pide tu OK siga marcado. */
let bwLeido = stored("bwLeido", {});
const leidoDe = id => bwLeido[id] ?? "";
function marcarChatLeido(id) {
	bwLeido = { ...bwLeido, [id]: new Date().toISOString() };
	store("bwLeido", bwLeido);
	if (id === "ceo") markCeoRead();
}

function markCeoRead() {
	ceoReadAt = state.ceo.at(-1)?.at ?? ceoReadAt;
	store("ceoReadAt", ceoReadAt);
}

function go(next) {
	if (next.type === "classroom" && sinClassroom()) next = { type: "tablero" };
	// Entrar al chat de un agente desde cualquier lado lo deja leído en la Bandeja.
	if (next.type === "agent" && next.id) marcarChatLeido(next.id);
	if (next.type === "ceo") marcarChatLeido("ceo");
	// El navegador sigue abierto al salir del Classroom, pero vuelve a su ancho de siempre.
	if (next.type !== "classroom") {
		document.getElementById("dock")?.classList.remove("ancho");
		document.querySelector(".app")?.classList.remove("cls");
	}
	view = next;
	menuOpen = false;
	openItem = null;
	rememberTab(next);
	if (next.type === "ceo") markCeoRead();
	messages = [];
	sending = [];
	renderShell();
	renderSide();
	void loadMessages();
	void loadExtra();
}

/** Sonidos propios, generados acá: uno suave por cada cosa que pasa en el equipo. */
let soundsOn = stored("sonidos", true);
let audio = null;
let lastSound = 0;
const SOUNDS = {
	despierta: { notes: [523], gain: 0.035 },
	termina: { notes: [659, 880], gain: 0.06 },
	pide: { notes: [880, 1175], gain: 0.07 },
};

/** Aviso del sistema, solo si Leverage no está a la vista: mirando la pantalla alcanza con el sonido. */
function avisar(titulo, texto) {
	if (!("Notification" in window) || document.hasFocus()) return;
	if (Notification.permission === "granted") new Notification(titulo, { body: texto });
	else if (Notification.permission === "default") Notification.requestPermission();
}

function play(kind) {
	const now = Date.now();
	if (!soundsOn || audio?.state !== "running" || now - lastSound < 1500) return;
	lastSound = now;
	const { notes, gain } = SOUNDS[kind];
	notes.forEach((freq, i) => {
		const at = audio.currentTime + i * 0.11;
		const tone = audio.createOscillator();
		const level = audio.createGain();
		tone.frequency.value = freq;
		level.gain.setValueAtTime(0.0001, at);
		level.gain.exponentialRampToValueAtTime(gain, at + 0.015);
		level.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
		tone.connect(level).connect(audio.destination);
		tone.start(at);
		tone.stop(at + 0.36);
	});
}

// El navegador solo deja sonar después de que la persona tocó la página.
addEventListener("pointerdown", () => {
	audio ??= new AudioContext();
	void audio.resume();
});

function soundFor(old, next) {
	const was = new Map(old.agents.map(a => [a.id, a]));
	const nuevo = next.requests.find(r => r.state === "pendiente" && !old.requests.some(o => o.id === r.id));
	if (nuevo) {
		avisar(`${nuevo.author} te necesita`, nuevo.title);
		return play("pide");
	}
	// El filtro de atención: suena cuando un agente te llama, no cada vez que termina algo.
	const llamado = next.agents.find(a => a.aviso && a.aviso.id !== was.get(a.id)?.aviso?.id);
	if (llamado) {
		avisar(llamado.name, llamado.aviso.texto);
		return play("pide");
	}
	if (next.agents.some(a => was.get(a.id)?.asleep && !a.asleep)) play("despierta");
}

