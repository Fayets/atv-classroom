async function decide(id, action, nota) {
	await api(`/requests/${id}/${action}`, { method: "POST", body: JSON.stringify({ nota }) });
	changing.delete(id);
	await loadState();
}

// El reloj de "Trabajando" cambia solo su texto: no repinta el chat.
setInterval(() => {
	for (const el of document.querySelectorAll("[data-since]")) el.textContent = `Trabajando ${lasted(el.dataset.since, new Date())}`;
}, 1000);

document.addEventListener("click", async e => {
	const t = e.target.closest("[data-ver-afuera]");
	if (!t) return;
	const res = await api(`/media/enlace?path=${encodeURIComponent(t.dataset.verAfuera)}`);
	if (res.ok) window.open((await res.json()).url, "_blank", "noopener");
	else avisar("No se pudo abrir esta página.");
});

document.addEventListener("click", e => {
	const t = e.target.closest("[data-lib-carpeta],[data-lib-tab]");
	if (!t) return;
	libCarpeta = t.dataset.libCarpeta ?? "";
	if ("libCarpeta" in t.dataset) renderBody();
});

document.addEventListener("click", async e => {
	const conectar = e.target.closest("[data-sw-conectar]");
	const quitar = e.target.closest("[data-sw-quitar]");
	if (conectar) {
		const res = await api("/software", { method: "POST", body: JSON.stringify({ nombre: value("sw-nombre"), url: value("sw-url"), clave: value("sw-clave"), campo: value("sw-campo"), descripcion: value("sw-desc"), permiso: value("sw-permiso") }) });
		const r = await res.json().catch(() => ({}));
		avisar(res.ok ? `${r.nombre} conectado` : "No se pudo conectar", res.ok ? (r.rutas?.length ? `Aprendí ${r.rutas.length} rutas.` : "No encontré su documentación: contales a los agentes qué rutas tiene.") : r.error);
	} else if (quitar) await api(`/software/${quitar.dataset.swQuitar}`, { method: "DELETE" });
	else return;
	lastBody = "";
	await loadExtra();
	renderBody();
});

document.addEventListener("change", async e => {
	const t = e.target.closest("[data-sw-permiso]");
	if (!t) return;
	await api(`/software/${t.dataset.swPermiso}`, { method: "PATCH", body: JSON.stringify({ permiso: t.value }) });
	await loadExtra();
});

document.addEventListener("click", async e => {
	const t = e.target.closest("[data-onb-enlaces]");
	if (!t) return;
	const agenda = value("onb-agenda");
	const url = value("onb-cobro-url");
	const cobro = url ? { nombre: value("onb-cobro-nombre") || "Cobro", precio: Number(value("onb-cobro-precio")) || 0, moneda: "USD", url } : undefined;
	const res = await api("/crm/enlaces", { method: "POST", body: JSON.stringify({ ...(agenda ? { agenda } : {}), ...(cobro ? { cobro } : {}) }) });
	avisar(res.ok ? "Links guardados" : "Revisá los links", res.ok ? "Tus agentes ya los pueden usar." : "Tienen que empezar con https://");
});

document.addEventListener("click", e => {
	const t = e.target.closest("[data-crm-abrir]");
	if (!t) return;
	crmAbierto = Boolean(t.dataset.crmAbrir);
	renderBody();
});

document.addEventListener("click", async e => {
	const t = e.target.closest("[data-crm-borrar]");
	if (!t || !confirm("¿Borrar este contacto?")) return;
	await api(`/crm/${t.dataset.crmBorrar}`, { method: "DELETE" });
	await loadExtra();
	renderBody();
});

document.addEventListener("change", async e => {
	const t = e.target.closest("[data-crm-etapa]");
	if (!t) return;
	await api(`/crm/${t.dataset.crmEtapa}`, { method: "PATCH", body: JSON.stringify({ etapa: t.value }) });
	await loadExtra();
	renderBody();
});

document.addEventListener("click", e => {
	const t = e.target.closest("[data-page-width]");
	if (!t) return;
	const marco = document.querySelector(".pagebox iframe");
	if (marco) marco.style.width = t.dataset.pageWidth ? `${t.dataset.pageWidth}px` : "100%";
});

document.addEventListener("click", e => {
	const t = e.target.closest("[data-fig]");
	if (!t) return;
	if (t.dataset.figCode === "true") figureAsCode.add(t.dataset.fig);
	else figureAsCode.delete(t.dataset.fig);
	renderBody();
	repintarDoc();
});

document.addEventListener("click", e => {
	const t = e.target.closest("[data-copy]");
	if (!t) return;
	void navigator.clipboard.writeText(copies.get(t.dataset.copy) ?? "");
	t.classList.add("done");
	setTimeout(() => t.classList.remove("done"), 1500);
});

document.addEventListener("click", e => {
	const t = e.target.closest("[data-theme-pick],[data-notices]");
	if (!t) return;
	if (t.dataset.themePick) {
		themePref = t.dataset.themePick;
		store("tema", themePref);
		applyLook();
	} else {
		noticesOn = !noticesOn;
		store("avisos", noticesOn);
	}
	renderBody();
});

document.addEventListener("click", async e => {
	const story = e.target.closest("[data-story]");
	const close = e.target.closest("[data-story-close]");
	if (story || (close && !e.target.closest("[data-modal-stay]:not(.sbox)") && (close.tagName === "BUTTON" || !e.target.closest(".sbox")))) {
		storyOpen = story?.dataset.story ?? null;
		return renderBody();
	}
	const state2 = e.target.closest("[data-ticket-state]");
	if (state2) {
		await api(`/tickets/${state2.dataset.ticket}`, { method: "PATCH", body: JSON.stringify({ state: state2.dataset.ticketState }) });
		return loadState();
	}
	if (e.target.closest("[data-ticket-add]")) {
		const input = document.getElementById("ticket-title");
		if (!input.value.trim()) return;
		await api("/tickets", { method: "POST", body: JSON.stringify({ title: input.value, owner: document.getElementById("ticket-owner").value }) });
		input.value = "";
		await loadState();
	}
});

document.addEventListener("click", async e => {
	if (!e.target.closest("[data-import]")) return;
	await api("/import", { method: "POST" });
	await loadExtra();
});

let updating = false;
let updatingDesde = 0;
/** Si la app no toma el pedido en este rato, no lo va a tomar: no está mirando. */
const SIN_TOMAR_MS = 20_000;
/** Una actualización normal tarda menos de un minuto; pasado esto, algo se trabó. */
const TRABADA_MS = 6 * 60_000;
const hace = iso => (iso ? Date.now() - Date.parse(iso) : 0);
/** En qué va la actualización, con lo que cuenta el servidor: nunca queda en "Actualizando…" sin decir nada. */
function faseActualizacion() {
	const c = state.updateCheck ?? {};
	const v = state.update?.version ?? "";
	if (c.error) return { titulo: "No se pudo actualizar", texto: c.error, reintentar: true };
	if (c.pedida && hace(c.pedida) > SIN_TOMAR_MS) return { titulo: "La app no tomó la actualización", texto: "Cerrá Leverage con Cmd+Q y abrilo de nuevo: se instala sola al abrir.", reintentar: false };
	if (updatingDesde && Date.now() - updatingDesde > TRABADA_MS) return { titulo: "Está tardando más de lo normal", texto: "Cerrá Leverage con Cmd+Q, abrilo de nuevo y tocá Actualizar otra vez.", reintentar: true };
	if (c.instalando) return { titulo: `Instalando la ${v}`, texto: "Ya se bajó. Leverage se reinicia solo en unos segundos; no cierres la app.", barra: true };
	return { titulo: `Actualizando a la ${v}`, texto: "Bajando la versión nueva. Leverage se reinicia solo; no cierres la app.", barra: true };
}
// "Buscar ahora": la app de escritorio busca en el canal de ATV y anota qué encontró. Si en 25 s no contestó, es una app vieja.
let buscando = 0;
let buscadaMsg = "";
const BUSCADA = {
	"al-dia": "Ya tenés la última versión.",
	"sin-conexion": "No se pudo conectar para buscar. Revisá internet y probá de nuevo.",
	"sin-canal": "Esta app no tiene canal de actualizaciones: instalala desde el instalador de ATV.",
	invalida: "La versión publicada no viene firmada por ATV: no se instala.",
};
function versionTexto(update) {
	if (update && updating) {
		const f = faseActualizacion();
		return `${esc(f.titulo)}. ${esc(f.texto)}`;
	}
	if (update) return `Hay una versión nueva: ${esc(update.version)}.${update.notes ? ` ${esc(update.notes)}` : ""}`;
	return esc(buscadaMsg);
}
function revisarBuscada() {
	if (!buscando) return;
	const c = state.updateCheck;
	if (c?.at && Date.parse(c.at) >= buscando - 2000) {
		buscadaMsg = state.update ? "" : (BUSCADA[c.resultado] ?? "");
		buscando = 0;
	} else if (Date.now() - buscando > 25_000) {
		buscadaMsg = "La app no respondió. Si es anterior a la 0.2.10, instalala de nuevo desde el instalador de ATV.";
		buscando = 0;
	} else return;
	lastBody = "";
	renderBody();
}
setInterval(revisarBuscada, 1000);
document.addEventListener("click", async e => {
	if (!e.target.closest("[data-update-buscar]") || buscando) return;
	buscando = Date.now();
	buscadaMsg = "";
	lastBody = "";
	renderBody();
	await api("/update/buscar", { method: "POST" }).catch(() => null);
});
document.addEventListener("click", async e => {
	if (!e.target.closest("[data-update]") || (updating && !faseActualizacion().reintentar)) return;
	updating = true;
	updatingDesde = Date.now();
	if (state.updateCheck) state.updateCheck.error = null;
	lastBody = "";
	renderBody();
	avisoVersion();
	await api("/update", { method: "POST" });
});

// El aviso de versión nueva: aparece solo arriba a la derecha, se puede dejar para más tarde y, al actualizar,
// la ventana se recarga sola cuando el servidor vuelve con la versión nueva.
const MAS_TARDE_MS = 6 * 3_600_000;
let versionCargada = "";
function dejadoParaMasTarde(version) {
	try {
		const x = JSON.parse(localStorage.getItem("actualizacion-mas-tarde") || "null");
		return x?.version === version && Date.now() - x.at < MAS_TARDE_MS;
	} catch {
		return false;
	}
}
/** Conectar abre la autorización en el navegador de la persona (ahí ya tiene sus sesiones, y la ventana de la app no
 * corta los pasos de Instagram o Google). Mientras tanto, un cartel; la app revisa sola hasta que quede o falle. */
let espera = null;
const ESPERA_MAX_MS = 10 * 60_000;
function cartelConexion(html) {
	document.getElementById("aviso-instagram")?.remove();
	if (!html) return;
	const el = document.createElement("div");
	el.id = "aviso-instagram";
	el.setAttribute("role", "alert");
	el.innerHTML = html;
	document.body.append(el);
}
function cartelProblemaInstagram(problema) {
	const tope = /payment method/i.test(problema) && /more than \d+ accounts/i.test(problema);
	cartelConexion(
		tope
			? `<b>Para sumar más cuentas de Instagram, pasá a pago en Zernio</b><p>Tu cuenta de Zernio ya tiene 2 cuentas de Instagram conectadas, que es lo gratis. Cargá una tarjeta en Zernio y volvé a tocar Conectar. Cada cuenta de más cuesta unos US$ 6 por mes.</p><div class="av-acc"><a class="b p" href="https://zernio.com" target="_blank" rel="noopener">Abrir Zernio</a><button class="b ghost" data-aviso-ig-ok>Entendido</button></div>`
			: `<b>No se pudo conectar Instagram</b><p>${esc(problema)}</p><div class="av-acc"><button class="b ghost" data-aviso-ig-ok>Entendido</button></div>`,
	);
}
async function refrescarConexiones() {
	await loadState();
	if (document.querySelector(".app.onboarding")) await loadOnbData();
	else {
		const c = await api("/connections");
		if (c.ok) extra.connections = await c.json();
	}
	lastBody = "";
	renderBody();
}
async function revisarEspera() {
	const e = espera;
	if (!e || (e.carpeta || "") !== (carpeta || "")) return;
	if (Date.now() - e.desde > ESPERA_MAX_MS) {
		espera = null;
		return cartelConexion("");
	}
	if (e.tipo === "instagram") {
		const s = await (await api("/state")).json().catch(() => ({}));
		const ig = s.instagram ?? {};
		if (ig.connected) {
			espera = null;
			cartelConexion("");
			return refrescarConexiones();
		}
		if (ig.problem && ig.problem !== e.problemaAntes) {
			espera = null;
			cartelProblemaInstagram(ig.problem);
			return refrescarConexiones();
		}
	} else {
		const c = await (await api("/connections")).json().catch(() => ({}));
		const cuentas = c.composio?.accounts?.length ?? 0;
		if (cuentas > e.cuentasAntes || (c.problem && c.problem !== e.problemaAntes)) {
			espera = null;
			cartelConexion(c.problem && c.problem !== e.problemaAntes ? `<b>No se pudo conectar</b><p>${esc(c.problem)}</p><div class="av-acc"><button class="b ghost" data-aviso-ig-ok>Entendido</button></div>` : "");
			return refrescarConexiones();
		}
	}
	setTimeout(() => void revisarEspera(), 3000);
}
document.addEventListener(
	"click",
	e => {
		if (e.target.closest("[data-aviso-ig-ok]")) {
			espera = null;
			return cartelConexion("");
		}
		const el = e.target.closest('[data-onb-save-go^="/connect/"],a[href*="/connect/"]');
		if (!el) return;
		const ruta = el.dataset.onbSaveGo ?? new URL(el.getAttribute("href"), location.href).pathname;
		if (!/^\/connect\/(instagram|app\/[a-z0-9_-]+)$/.test(ruta)) return;
		e.preventDefault();
		e.stopImmediatePropagation();
		window.open(scoped(`${ruta}?afuera=1`), "_blank");
		const tipo = ruta === "/connect/instagram" ? "instagram" : "app";
		espera = { tipo, carpeta, desde: Date.now(), problemaAntes: tipo === "instagram" ? (state.instagram?.problem ?? null) : (extra.connections?.problem ?? null), cuentasAntes: extra.connections?.composio?.accounts?.length ?? 0 };
		cartelConexion(`<b>${tipo === "instagram" ? "Terminá de conectar en tu navegador" : "Terminá de autorizar en la ventana que se abrió"}</b><p>${tipo === "instagram" ? "Se abrió una pestaña para autorizar tu Instagram. Cuando termines, esto se actualiza solo." : "Cuando termines se cierra sola y esto se actualiza."}</p><div class="av-acc"><button class="b ghost" data-aviso-ig-ok>Cancelar</button></div>`);
		setTimeout(() => void revisarEspera(), 3000);
	},
	true,
);
function avisoVersion() {
	if (state.version) {
		if (!versionCargada) versionCargada = state.version;
		else if (state.version !== versionCargada) return location.reload();
	}
	const u = state.update;
	let el = document.getElementById("aviso-version");
	if (!u || (!updating && dejadoParaMasTarde(u.version))) return el?.remove();
	if (!el) {
		el = document.createElement("div");
		el.id = "aviso-version";
		el.setAttribute("role", "status");
		document.body.append(el);
	}
	const f = updating ? faseActualizacion() : null;
	const html = f
		? `<b>${esc(f.titulo)}</b><p>${esc(f.texto)}</p>${f.barra ? `<div class="av-barra"><i></i></div>` : `<div class="av-acc">${f.reintentar ? `<button class="b p" data-update-reintentar>Reintentar</button>` : ""}<button class="b ghost" data-update-luego>Más tarde</button></div>`}`
		: `<b>Hay una versión nueva: ${esc(u.version)}</b>${u.notes ? `<p>${esc(u.notes)}</p>` : ""}<div class="av-acc"><button class="b p" data-update>Actualizar ahora</button><button class="b ghost" data-update-luego>Más tarde</button></div>`;
	if (el.dataset.html !== html) {
		el.innerHTML = html;
		el.dataset.html = html;
	}
}
document.addEventListener("click", async e => {
	if (e.target.closest("[data-update-luego]")) {
		try {
			localStorage.setItem("actualizacion-mas-tarde", JSON.stringify({ version: state.update?.version, at: Date.now() }));
		} catch {}
		updating = false;
		document.getElementById("aviso-version")?.remove();
		return;
	}
	if (!e.target.closest("[data-update-reintentar]")) return;
	if (state.updateCheck) state.updateCheck.error = null;
	updating = true;
	updatingDesde = Date.now();
	avisoVersion();
	await api("/update", { method: "POST" });
});

// El navegador entra de costado sobre lo que estás mirando, y la página queda viva aunque lo cierres.
document.addEventListener("click", e => {
	const dock = document.getElementById("dock");
	if (e.target.closest("[data-dock-full]")) dock.classList.toggle("full");
	if (!e.target.closest("[data-dock]")) return;
	if (!dock.firstChild) dock.innerHTML = webHtml();
	const open = dock.classList.toggle("open");
	if (!open) {
		dock.classList.remove("ancho");
		document.querySelector(".app").classList.remove("cls");
	}
	// El chat se acomoda al lado de una vez; lo que se anima es solo el panel.
	document.querySelector(".app").classList.toggle("docked", open);
});

const webAddress = text => (/^https?:\/\//.test(text) ? text : /^[^\s]+\.[^\s]+$/.test(text) ? `https://${text}` : `https://www.google.com/search?q=${encodeURIComponent(text)}`);

document.addEventListener("click", e => {
	const t = e.target.closest("[data-web]");
	const web = document.getElementById("web");
	if (!t || !web) return;
	if (t.dataset.web === "back" && web.canGoBack()) web.goBack();
	if (t.dataset.web === "forward" && web.canGoForward()) web.goForward();
	if (t.dataset.web === "reload") web.reload();
});

document.addEventListener("keydown", e => {
	if (e.target.id === "web-url" && e.key === "Enter") document.getElementById("web")?.loadURL(webAddress(e.target.value.trim()));
});

// La barra sigue a la página, y al volver abre donde quedaste.
new MutationObserver(() => {
	const web = document.getElementById("web");
	if (!web || web.dataset.wired) return;
	web.dataset.wired = "1";
	const show = e => {
		const input = document.getElementById("web-url");
		if (input && document.activeElement !== input) input.value = e.url;
		store("webUrl", e.url);
	};
	web.addEventListener("did-navigate", show);
	web.addEventListener("did-navigate-in-page", show);
}).observe(document.body, { childList: true, subtree: true });

let cuentaEnCurso = 0;
document.addEventListener("input", e => {
	if (!e.target.closest("[data-obj]")) return;
	clearTimeout(cuentaEnCurso);
	cuentaEnCurso = setTimeout(pintarCadena, 200);
});

new MutationObserver(() => {
	const box = document.getElementById("obj-cadena");
	if (box && !box.childElementCount) void pintarCadena();
}).observe(document.body, { childList: true, subtree: true });

document.addEventListener("click", async e => {
	const t = e.target.closest("[data-jeremy-save]");
	if (!t) return;
	const id = t.dataset.jeremySave || "jeremy";
	const url = document.getElementById(`${id}-url`).value.trim();
	const value = document.getElementById(`${id}-clave`).value.trim();
	const res = await api("/connections/keys", { method: "POST", body: JSON.stringify({ name: JEREMYS[id][0], host: url, url, type: "header", field: "x-webhook-secret", value }) });
	provError[id] = res.ok ? "" : (await res.json().catch(() => ({}))).error ?? "No se pudo guardar";
	if (res.ok) changingKeys.delete(id);
	await loadExtra();
	await loadState();
	lastBody = "";
	renderBody();
});

document.addEventListener("click", async e => {
	const t = e.target.closest("[data-jeremy-pedir]");
	if (!t) return;
	t.disabled = true;
	await api("/onboarding", { method: "POST", body: JSON.stringify({ objetivo: objetivoCampos() }) });
	const res = await api("/jeremy/pedir", { method: "POST", body: "{}" });
	const r = await res.json().catch(() => ({}));
	if (!r.pedido) alert(r.error ?? "Falta conectar Jeremy y Entregas en Tus claves.");
	await loadState();
	lastBody = "";
	renderBody();
});

document.addEventListener("click", async e => {
	const t = e.target.closest("[data-px-guardar],[data-px-probar]");
	if (!t) return;
	t.disabled = true;
	const probar = t.matches("[data-px-probar]");
	const cuerpo = probar ? { codigo: document.getElementById("px-codigo")?.value.trim() || undefined } : { pixel: document.getElementById("px-pixel")?.value, token: document.getElementById("px-token")?.value.trim() || undefined };
	const r = await api(probar ? "/conversiones/probar" : "/conversiones", { method: "POST", body: JSON.stringify(cuerpo) });
	const d = await r.json().catch(() => ({}));
	pixelError = r.ok ? "" : (d.error ?? "No se pudo.");
	if (r.ok && extra.pixel) extra.pixel = { ...extra.pixel, estado: d.estado, linea: d.linea };
	t.disabled = false;
	renderBody();
});

document.addEventListener("click", async e => {
	const t = e.target.closest("[data-obj-guardar]");
	if (!t) return;
	t.disabled = true;
	const res = await api("/onboarding", { method: "POST", body: JSON.stringify({ objetivo: objetivoCampos() }) });
	t.disabled = false;
	t.textContent = res.ok ? "Guardado" : "No se pudo guardar";
	await loadState();
});

document.addEventListener("click", async e => {
	const t = e.target.closest("[data-cliente-borrar]");
	if (!t) return;
	const c = state.clientes.find(x => x.id === t.dataset.clienteBorrar);
	if (!c || !confirm(`Vas a borrar a ${c.nombre}. Se apagan sus ${c.agentes} agentes, se cierran sus pendientes, su Instagram se desconecta de Zernio y su carpeta va a la papelera de Leverage. ¿Seguro?`)) return;
	t.disabled = true;
	const res = await api(`/clientes/${c.id}`, { method: "DELETE" });
	if (!res.ok) alert((await res.json().catch(() => ({}))).error ?? "No se pudo borrar");
	await loadState();
});

document.addEventListener("click", async e => {
	const t = e.target.closest("[data-acceso-todos]");
	if (!t) return;
	const cual = t.dataset.accesoTodos;
	const aviso = cual === "computer" ? "Todos los agentes van a poder pedir manejar esta compu. Cada vez lo aprobás vos en la Bandeja. ¿Seguro?" : "Todos los agentes van a poder leer en el Chrome sin sesiones y pedir el tuyo. Cada vez lo aprobás vos en la Bandeja. ¿Seguro?";
	if (!confirm(aviso)) return;
	for (const a of state.agents.filter(x => !x[cual])) await api(`/${cual === "computer" ? "computer" : "navegador"}/${a.id}`, { method: "PATCH", body: JSON.stringify({ on: true }) });
	await loadState();
	lastBody = "";
	renderBody();
});

document.addEventListener("click", async e => {
	const t = e.target.closest("[data-computer-agent]");
	if (!t) return;
	const a = state.agents.find(x => x.id === t.dataset.computerAgent);
	await api(`/computer/${a.id}`, { method: "PATCH", body: JSON.stringify({ on: !a.computer }) });
	await loadState();
	renderBody();
});

let browserError = "";
document.addEventListener("click", async e => {
	const open = e.target.closest("[data-browser-open]");
	const agent = e.target.closest("[data-browser-agent]");
	if (open) {
		const res = await api("/navegador", { method: "POST" });
		browserError = res.ok ? "" : (await res.json()).error;
		await loadExtra();
	}
	if (agent) {
		const a = state.agents.find(x => x.id === agent.dataset.browserAgent);
		await api(`/navegador/${a.id}`, { method: "PATCH", body: JSON.stringify({ on: !a.browser }) });
		await loadState();
		renderBody();
	}
});

let phoneError = "";
document.addEventListener("click", async e => {
	if (!e.target.closest("[data-phone-on]")) return;
	const res = await api("/phone", { method: "POST" });
	const out = await res.json();
	phoneError = out.error ?? "";
	await loadState();
	renderBody();
});

// En el celular se ve una cosa por vez: en el chat, la flecha muestra con quién más podés hablar.
const onPhone = matchMedia("(max-width:760px)");
document.addEventListener("click", e => {
	const app = document.querySelector(".app");
	if (e.target.closest("[data-mback]")) app.classList.add("showside");
	else if (e.target.closest(".side [data-agent],.side [data-view],.convs [data-agent],.convs [data-view],.menu [data-view],.menu [data-section]")) app.classList.remove("showside");
}, true);

document.addEventListener("click", e => {
	const t = e.target.closest("[data-sounds]");
	if (!t) return;
	soundsOn = !soundsOn;
	store("sonidos", soundsOn);
	t.classList.toggle("on", soundsOn);
	t.setAttribute("aria-checked", soundsOn);
	if (soundsOn) setTimeout(() => play("termina"), 50);
});

/** Quién habló con quién se ve solo al pasar por una tarjeta: el organigrama queda limpio. */
document.addEventListener("mouseover", e => {
	const node = e.target.closest?.("[data-node]")?.dataset.node;
	for (const t of document.querySelectorAll("#org-talks .talk")) t.classList.toggle("show", t.dataset.a === node || t.dataset.b === node);
});

document.addEventListener("click", e => {
	const t = e.target.closest("[data-group]");
	if (!t) return;
	if (!shutGroups.delete(t.dataset.group)) shutGroups.add(t.dataset.group);
	store("shutGroups", [...shutGroups]);
	renderSide();
});

document.addEventListener("click", e => {
	const t = e.target.closest("[data-fold]");
	if (!t) return;
	const open = !folds.delete(t.dataset.fold);
	if (open) folds.add(t.dataset.fold);
	t.parentElement.classList.toggle("open", open);
	t.setAttribute("aria-expanded", open);
});

document.addEventListener("click", async e => {
	const t = e.target.closest("[data-bw-chat],[data-bw-filtro],[data-bw-volver],[data-vc-save],[data-ver-pedido],[data-ceo-leido],[data-onb-mas],[data-onb-releer],[data-onb-volver-ig],[data-onb-add-ig],[data-perf-ok],[data-perf-corregir],[data-perf-guardar],[data-perf-cancelar],[data-perf-releer],[data-redes-mas],[data-hist-filtro],[data-hist-periodo],[data-hist-mas],[data-agent],[data-view],[data-approve],[data-changes],[data-send-changes],[data-cancel],[data-file],[data-close-file],[data-kpi-ok],[data-kpi-no],[data-ig-save],[data-ig-sync],[data-ig-off],[data-menu],[data-section],[data-zoom],[data-off-toggle],[data-off-save],[data-block-add],[data-block-del],[data-lib-tab],[data-lib-form],[data-lib-add],[data-lib-del],[data-acct-off],[data-cp-save],[data-key-add],[data-key-del],[data-mcp-add],[data-mcp-del],[data-key-edit],[data-side-toggle],[data-mcp-open],[data-own-open],[data-item],[data-inbox],[data-read-all],[data-tab],[data-tab-close],[data-claude-add],[data-claude-cancel],[data-agents-restart],[data-owner-save],[data-onb-next],[data-onb-back],[data-onb-skip],[data-onb-face],[data-onb-team],[data-onb-add],[data-onb-save-go],[data-onb-redo],[data-onb-cat],[data-modal-stay],[data-modal-close],[data-edit-agent],[data-agent-save],[data-agent-remove],[data-prov-save],[data-cupo-save],[data-dec-del],[data-swipe-f],[data-carp-open],[data-carp],[data-cli-new],[data-onb-cancel],[data-cli-team],[data-neg-save],[data-wf-toggle],[data-wf-del],[data-skill-base],[data-skill-del],[data-redes-save]");
	if (menuOpen && !t?.hasAttribute("data-menu")) {
		menuOpen = false;
		renderSide();
	}
	if (!t) return;
	const d = t.dataset;
	if (d.agentRemove) {
		if (!removing) {
			removing = true;
			lastBody = "";
			renderBody();
			return;
		}
		await api(`/agents/${d.agentRemove}`, { method: "DELETE" });
		removing = false;
		agentEdit = null;
		await loadState();
		lastBody = "";
		renderBody();
	} else if (d.editAgent) {
		agentEdit = d.editAgent;
		modeloEnFicha = null;
		agentError = "";
		removing = false;
		renderBody();
		document.getElementById("agent-name")?.select();
	} else if ("modalClose" in d) {
		agentEdit = null;
		renderBody();
	} else if (d.agentSave) {
		const modelo = document.querySelector("input[name=agent-model]:checked")?.value;
		const res = await api(`/agents/${d.agentSave}`, { method: "PATCH", body: JSON.stringify({ name: document.getElementById("agent-name").value, title: document.getElementById("agent-title").value, managerId: document.getElementById("agent-boss")?.value, ...(modelo ? { model: modelo } : {}) }) });
		agentError = res.ok ? "" : (await res.json()).error ?? "No se pudo guardar";
		if (res.ok) {
			agentEdit = null;
			modeloEnFicha = null;
		}
		await loadState();
		lastBody = "";
		renderBody();
	} else if (d.agent) {
		agentEdit = null;
		go({ type: "agent", id: d.agent });
	} else if ("onbNext" in d) {
		if (onb.step === 1 && !document.getElementById("onb-name").value.trim()) {
			onbError = onbCliente() ? "Falta el nombre." : "Falta tu nombre.";
			lastBody = "";
			renderBody();
			return;
		}
		onbError = "";
		// En el paso 3 de un cliente, Continuar primero lee su perfil y lo muestra; el segundo Continuar sigue.
		if (onbCliente() && !onbNuevo && onb.step === 3 && !onbPerfil.vista && (extra.library?.material ?? []).some(m => m.kind === "instagram")) {
			onbPerfil.vista = true;
			onbPerfil.lectura = null;
			lastBody = "";
			renderBody();
			return void (await leerPerfilOnb(true));
		}
		if (onb.step === 3) {
			onbPerfil.vista = false;
			clearTimeout(onbPerfil.reloj);
		}
		if (onbNuevo) await crearDesdeOnb();
		else if (onb.step === 5) await (onbCliente() ? terminarOnbCliente([...onbTeams]) : finishOnb(onbTeam));
		else await saveOnb({ ...stepOneFields(), step: pasoSiguiente(onb.step) });
	} else if ("onbBack" in d && onb.step === 3 && onbPerfil.vista) {
		onbPerfil.vista = false;
		clearTimeout(onbPerfil.reloj);
		lastBody = "";
		renderBody();
	} else if ("onbBack" in d) await saveOnb({ ...stepOneFields(), step: pasoAnterior(onb.step) });
	else if ("onbReleer" in d) await leerPerfilOnb(true);
	else if ("onbVolverIg" in d) {
		onbPerfil.vista = false;
		lastBody = "";
		renderBody();
	}
	else if ("onbCancel" in d) cancelarOnbCliente();
	else if ("onbSkip" in d) {
		if (onb.step === 5) await (onbCliente() ? terminarOnbCliente([]) : finishOnb(null));
		else await saveOnb({ step: pasoSiguiente(onb.step) });
	} else if (d.onbFace && onbNuevo) {
		guardarBorrador();
		onb = { ...onb, face: d.onbFace === "true" };
		lastBody = "";
		renderBody();
	} else if (d.onbFace) {
		const typed = stepOneFields();
		await api("/onboarding", { method: "POST", body: JSON.stringify(typed) });
		onb = { ...onb, face: d.onbFace === "true" };
		await saveOnb({ face: onb.face });
	} else if (d.onbTeam) {
		onbTeam = d.onbTeam;
		if (onbCliente()) onbTeams.has(d.onbTeam) ? onbTeams.delete(d.onbTeam) : onbTeams.add(d.onbTeam);
		lastBody = "";
		renderBody();
	} else if (d.onbCat) {
		onbCat = onbCat === d.onbCat ? null : d.onbCat;
		lastBody = "";
		renderBody();
		document.getElementById("onb-material")?.focus();
	} else if ("onbAdd" in d) {
		await addMaterialFrom();
	} else if ("onbAddIg" in d) {
		onbCat = "instagram";
		await addMaterialFrom();
		onbCat = null;
		lastBody = "";
		renderBody();
	} else if ("onbMas" in d) {
		onbMas = !(onbMas || Boolean(onbCat));
		onbCat = null;
		lastBody = "";
		renderBody();
	} else if (d.perfOk || d.perfGuardar) {
		t.disabled = true;
		const r = d.perfOk ? await api("/library/guias/confirmar", { method: "POST", body: JSON.stringify({ topic: d.perfOk }) }) : await api("/library/guias", { method: "POST", body: JSON.stringify({ topic: d.perfGuardar, texto: document.getElementById("perf-texto")?.value ?? "" }) });
		const res = await r.json().catch(() => ({}));
		perfError = r.ok ? "" : (res.error ?? "No se pudo guardar.");
		if (r.ok) perfEditando = "";
		const l = await api("/library");
		if (l.ok) extra.library = await l.json();
		lastBody = "";
		renderBody();
	} else if (d.perfCorregir) {
		perfEditando = d.perfCorregir;
		perfError = "";
		lastBody = "";
		renderBody();
		document.getElementById("perf-texto")?.focus();
	} else if ("perfReleer" in d) {
		const r = await api("/perfil/rapido", { method: "POST", body: "{}" });
		if (r.ok) extra.perfilRapido = (await r.json()).lectura;
		lastBody = "";
		renderBody();
		// Se vuelve a mirar hasta que termine.
		const mirar = async () => {
			const g = await api("/perfil/rapido");
			if (g.ok) extra.perfilRapido = (await g.json()).lectura;
			if (view.type !== "carpeta") return;
			lastBody = "";
			renderBody();
			if (extra.perfilRapido?.estado === "leyendo") setTimeout(mirar, 3000);
		};
		setTimeout(mirar, 3000);
	} else if ("perfCancelar" in d) {
		perfEditando = "";
		perfError = "";
		lastBody = "";
		renderBody();
	} else if (d.onbSaveGo) {
		location.href = scoped(d.onbSaveGo);
	} else if ("onbRedo" in d) {
		await api("/onboarding", { method: "POST", body: JSON.stringify({ done: false, step: 1 }) });
		location.href = "/";
	} else if ("ownerSave" in d) {
		await api("/settings/owner", { method: "POST", body: JSON.stringify({ name: document.getElementById("owner-name").value, company: document.getElementById("owner-company").value }) });
		await loadState();
	} else if ("claudeAdd" in d) {
		await api("/accounts/claude/login", { method: "POST" });
		await loadState();
	} else if ("claudeCancel" in d) {
		await api("/accounts/claude/cancel", { method: "POST" });
		await loadState();
	} else if ("agentsRestart" in d) {
		await api("/agents/restart", { method: "POST" });
		await loadState();
	} else if (d.tabClose !== undefined) {
		const closing = tabs[Number(d.tabClose)];
		tabs = tabs.filter((_, i) => i !== Number(d.tabClose));
		store("tabs", tabs);
		if (closing && tabKey(closing) === tabKey(view) && tabs.length) go(tabs.at(-1));
		else renderHead();
	} else if (d.tab !== undefined) go(tabs[Number(d.tab)]);
	else if (d.item && bandejaDos && view.type === "bandeja") {
		openItem = d.item;
		closedItems.delete(d.item);
		renderBody();
	} else if (d.item) {
		if (isOpen(d.item)) {
			closedItems.add(d.item);
			openItem = null;
		} else {
			closedItems.delete(d.item);
			openItem = d.item;
		}
		renderBody();
	} else if (d.inbox) {
		inboxFilter = d.inbox;
		renderHead();
		renderBody();
	} else if ("readAll" in d) {
		inboxReadAt = new Date().toISOString();
		store("inboxReadAt", inboxReadAt);
		markCeoRead();
		renderSide();
		renderHead();
		renderBody();
	} else if ("sideToggle" in d) {
		document.querySelector(".app").classList.toggle("nosid");
		hideTip();
	} else if ("menu" in d) {
		menuOpen = !menuOpen;
		hideTip();
		renderSide();
	} else if (d.section) go({ type: "ajustes", section: d.section });
	else if (d.zoom) {
		applyZoom(Number(d.zoom));
		lastBody = "";
		renderBody();
	} else if ("offToggle" in d) {
		state.settings.offTime.on = !state.settings.offTime.on;
		lastBody = "";
		renderBody();
	} else if ("offSave" in d) {
		await api("/settings/off-time", { method: "POST", body: JSON.stringify({ on: state.settings.offTime.on, from: Number(document.getElementById("off-from").value), to: Number(document.getElementById("off-to").value) }) });
		await loadState();
	} else if ("blockAdd" in d) {
		const res = await api("/settings/blocked", { method: "POST", body: JSON.stringify({ name: document.getElementById("block-name").value, ids: document.getElementById("block-ids").value }) });
		if (res.ok) {
			document.getElementById("block-name").value = "";
			document.getElementById("block-ids").value = "";
		}
		await loadState();
	} else if (d.blockDel) {
		await api(`/settings/blocked/${d.blockDel}`, { method: "DELETE" });
		await loadState();
	} else if ("redesMas" in d) {
		redesMas = !redesMas;
		lastBody = "";
		renderBody();
		document.getElementById("neg-redes")?.focus();
	} else if ("redesSave" in d) {
		const res = await api(`/clientes/${carpeta}/redes`, { method: "POST", body: JSON.stringify({ redes: document.getElementById("neg-redes")?.value ?? "" }) });
		const body = await res.json().catch(() => ({}));
		if (!res.ok) {
			document.getElementById("neg-redes-error").textContent = body.error ?? "No se pudo guardar";
			return;
		}
		await loadExtra();
	} else if (d.skillBase) {
		if (skillBase === d.skillBase) {
			await api(`/skills/${d.skillBase}/base`, { method: "POST" });
			skillBase = "";
			await loadExtra();
		} else {
			skillBase = d.skillBase;
			renderBody();
		}
	} else if (d.skillDel) {
		await api(`/skills/${d.skillDel}`, { method: "DELETE" });
		await loadExtra();
	} else if ("carpOpen" in d) {
		carpetasOpen = !carpetasOpen;
		renderSide();
	} else if ("carp" in d) {
		await abrirCarpeta(d.carp);
	} else if ("cliNew" in d) {
		nuevoCliente();
	} else if (d.cliTeam) {
		await api(`/clientes/${carpeta}/equipo`, { method: "POST", body: JSON.stringify({ area: d.cliTeam }) });
		await loadState();
		await loadExtra();
	} else if ("negSave" in d) {
		await api(`/clientes/${carpeta}/negocio`, { method: "POST", body: JSON.stringify({ vende: document.getElementById("neg-vende").value, web: document.getElementById("neg-web").value }) });
		await loadExtra();
	} else if (d.wfToggle) {
		await api(`/embudos/workflows/${d.wfToggle}`, { method: "PATCH", body: JSON.stringify({ activo: !d.on }) });
		await loadExtra();
	} else if (d.wfDel) {
		await api(`/embudos/workflows/${d.wfDel}`, { method: "DELETE" });
		await loadExtra();
	} else if (d.libTab) {
		libTab = d.libTab;
		renderBody();
		if (libTab === "swipes") await loadSwipes();
	} else if ("swipeF" in d) {
		swipeFilter = { texto: document.getElementById("swipe-q")?.value.trim() ?? "", formato: d.swipeF };
		await loadSwipes();
	} else if (d.provSave) {
		const [, name, , host, type, field] = PROVEEDORES.find(p => p[0] === d.provSave);
		const input = document.getElementById(`prov-${d.provSave}`);
		const res = await api("/connections/keys", { method: "POST", body: JSON.stringify({ name, host, type, field, value: input.value }) });
		provError[d.provSave] = res.ok ? "" : ((await res.json().catch(() => ({}))).error ?? "No se pudo guardar");
		if (res.ok) changingKeys.delete(`prov-${d.provSave}`);
		await loadExtra();
	} else if ("cupoSave" in d) {
		await api("/gasto/cupo", { method: "POST", body: JSON.stringify({ usd: Number(document.getElementById("gasto-cupo").value) }) });
		await loadExtra();
	} else if (d.decDel) {
		await api(`/decisiones/${d.decDel}`, { method: "DELETE" });
		await loadExtra();
	} else if ("libForm" in d) {
		libForm = !libForm;
		libError = "";
		renderBody();
	} else if ("libAdd" in d) {
		const value = id => document.getElementById(id).value;
		const res = await api("/library/items", { method: "POST", body: JSON.stringify({ kind: value("lib-kind"), title: value("lib-title"), url: value("lib-url"), note: value("lib-note") }) });
		libError = res.ok ? "" : (await res.json()).error ?? "No se pudo guardar";
		if (res.ok) libForm = false;
		renderBody();
		await loadExtra();
	} else if (d.libDel) {
		await api(`/library/items/${d.libDel}`, { method: "DELETE" });
		await (view.type === "onboarding" ? loadOnbData() : loadExtra());
	} else if (d.keyEdit) {
		changingKeys.has(d.keyEdit) ? changingKeys.delete(d.keyEdit) : changingKeys.add(d.keyEdit);
		lastBody = "";
		renderBody();
	} else if ("ownOpen" in d) {
		ownOpen = !ownOpen;
		ownError = "";
		renderBody();
	} else if ("mcpOpen" in d) {
		mcpOpen = !mcpOpen;
		mcpError = "";
		renderBody();
	} else if (d.acctOff) {
		await api(`/connections/composio/${d.acctOff}`, { method: "DELETE" });
		await loadExtra();
	} else if ("cpSave" in d) {
		const res = await api("/connections/composio/key", { method: "POST", body: JSON.stringify({ key: document.getElementById("cp-key").value }) });
		cpError = res.ok ? "" : (await res.json()).error ?? "No se pudo guardar";
		if (res.ok) {
			document.getElementById("cp-key").value = "";
			changingKeys.delete("cp-key");
		}
		renderBody();
		await loadExtra();
	} else if ("keyAdd" in d) {
		const value = id => document.getElementById(id).value;
		const res = await api("/connections/keys", { method: "POST", body: JSON.stringify({ name: value("key-name"), host: value("key-host"), type: value("key-type"), field: value("key-field"), value: value("key-value") }) });
		ownError = res.ok ? "" : (await res.json()).error ?? "No se pudo guardar";
		if (res.ok) ownOpen = false;
		renderBody();
		await loadExtra();
	} else if (d.keyDel) {
		await api(`/connections/keys/${d.keyDel}`, { method: "DELETE" });
		await loadExtra();
	} else if ("mcpAdd" in d) {
		const value = id => document.getElementById(id).value;
		const res = await api("/connections/mcp", { method: "POST", body: JSON.stringify({ name: value("mcp-name"), url: value("mcp-url"), token: value("mcp-token") }) });
		mcpError = res.ok ? "" : (await res.json()).error ?? "No se pudo conectar";
		if (res.ok) mcpOpen = false;
		renderBody();
		await loadExtra();
	} else if (d.mcpDel) {
		await api(`/connections/mcp/${d.mcpDel}`, { method: "DELETE" });
		await loadExtra();
	} else if ("vcSave" in d) {
		const res = await api("/hosting", { method: "POST", body: JSON.stringify({ token: document.getElementById("vc-token")?.value ?? "", equipo: document.getElementById("vc-equipo")?.value ?? "" }) });
		vcError = res.ok ? "" : ((await res.json().catch(() => ({}))).error ?? "No se pudo guardar");
		if (res.ok) {
			document.getElementById("vc-token").value = "";
			changingKeys.delete("vc-token");
			const c = await api("/connections");
			if (c.ok) extra.connections = await c.json();
		}
		lastBody = "";
		renderBody();
	} else if ("igSave" in d) {
		const res = await api("/connections/instagram", { method: "POST", body: JSON.stringify({ key: document.getElementById("ig-key").value }) });
		keyError = res.ok ? "" : (await res.json()).error ?? "No se pudo guardar";
		if (res.ok) {
			document.getElementById("ig-key").value = "";
			changingKeys.delete("ig-key");
		}
		await loadState();
		renderBody();
	} else if ("igSync" in d) {
		await api("/connections/instagram/sync", { method: "POST" });
		await loadState();
	} else if ("igOff" in d) {
		await api("/connections/instagram", { method: "DELETE" });
		await loadState();
	} else if (d.histPeriodo) {
		histPeriodo = d.histPeriodo;
		histAbiertos.clear();
		renderBody();
	} else if (d.histMas) {
		if (histAbiertos.has(d.histMas)) histAbiertos.delete(d.histMas);
		else histAbiertos.add(d.histMas);
		renderBody();
	} else if (d.histFiltro) {
		histFiltro = d.histFiltro;
		renderBody();
	} else if ("ceoLeido" in d) {
		markCeoRead();
		renderSide();
		renderHead();
		renderBody();
	} else if (d.bwChat) {
		bandejaChat = d.bwChat;
		store("bandejaChat", bandejaChat);
		marcarChatLeido(bandejaChat);
		bwAbierto = true;
		bwFoco = null;
		renderBody();
		void cargarHiloBandeja();
	} else if (d.bwFiltro) {
		bwFiltro = d.bwFiltro;
		renderBody();
	} else if ("bwVolver" in d) {
		bwAbierto = false;
		renderBody();
	} else if (d.verPedido) {
		const r = state.requests.find(x => x.id === d.verPedido) ?? state.kpis.find(x => x.id === d.verPedido);
		// Una respuesta para un cliente del classroom se ve donde se edita y se manda: Classroom, Responder.
		const cliente = r?.classroom?.cliente ?? /^(?:Para vos: )?Contestarle a (.+) en el classroom$/.exec(r?.title ?? "")?.[1];
		if (cliente) return abrirRespuestaCls(cliente);
		if (r?.agentId) {
			bandejaChat = r.agentId;
			store("bandejaChat", bandejaChat);
		}
		bwAbierto = true;
		bwFoco = d.verPedido;
		openItem = d.verPedido;
		go({ type: "bandeja" });
		void cargarHiloBandeja();
	} else if (d.agent) go({ type: "agent", id: d.agent });
	else if (d.view) go({ type: d.view });
	else if (d.approve) await decide(d.approve, "aprobar");
	else if (d.changes) {
		changing.set(d.changes, d.mode ?? "cambios");
		renderBody();
		document.getElementById(`nota-${d.changes}`)?.focus();
	} else if (d.cancel) {
		changing.delete(d.cancel);
		renderBody();
	} else if (d.sendChanges) await decide(d.sendChanges, changing.get(d.sendChanges) ?? "cambios", document.getElementById(`nota-${d.sendChanges}`)?.value ?? "");
	else if (d.file) await showFile(d.file);
	else if ("closeFile" in d) document.getElementById("file").innerHTML = "";
	else if (d.kpiOk) {
		await api(`/kpis/${d.kpiOk}/aprobar`, { method: "POST" });
		await loadState();
	} else if (d.kpiNo) {
		await api(`/kpis/${d.kpiNo}/rechazar`, { method: "POST" });
		await loadState();
	}
});

async function searchApps(q) {
	if (!q) {
		extra.catalog = null;
		renderBody();
		return;
	}
	const res = await api(`/connections/catalog?q=${encodeURIComponent(q)}`);
	const data = await res.json();
	connError = res.ok ? "" : data.error === "Falta la clave de Composio" ? "" : data.error ?? "No se pudo buscar";
	extra.catalog = res.ok ? data : null;
	renderBody();
}

/** Un solo cartelito para toda la app. Se ubica una vez y lo anima el CSS: nada corre por cuadro. */
const tip = document.createElement("div");
tip.className = "tip";
tip.setAttribute("role", "tooltip");
document.body.append(tip);
let tipFor = null;
let tipTimer;
let tipClosedAt = 0;

function showTip(el) {
	if (!el.isConnected || (menuOpen && "menu" in el.dataset)) return;
	tip.textContent = el.dataset.tip;
	const r = el.getBoundingClientRect();
	const w = tip.offsetWidth;
	const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8));
	tip.style.left = `${left}px`;
	tip.style.top = `${r.bottom + 12}px`;
	tip.style.setProperty("--arrow", `${r.left + r.width / 2 - left}px`);
	tip.classList.add("on");
}

function hideTip() {
	clearTimeout(tipTimer);
	if (tip.classList.contains("on")) tipClosedAt = Date.now();
	tip.classList.remove("on");
	tipFor = null;
}

document.addEventListener("pointerover", e => {
	const el = e.target.closest?.("[data-tip]") ?? null;
	if (el === tipFor) return;
	hideTip();
	if (!el) return;
	tipFor = el;
	tipTimer = setTimeout(() => showTip(el), Date.now() - tipClosedAt < 400 ? 0 : 350);
});
document.addEventListener("pointerdown", hideTip);
new ResizeObserver(() => view.type === "equipo" && drawOrg()).observe(document.getElementById("main"));

document.addEventListener("submit", e => {
	e.preventDefault();
	void send();
});

document.addEventListener("keydown", e => {
	if (e.key === "Escape" && agentEdit) {
		agentEdit = null;
		renderBody();
	}
	if (e.target.id === "onb-material" && e.key === "Enter") void addMaterialFrom();
	if (e.target.id === "agent-name" && e.key === "Enter") document.querySelector("[data-agent-save]")?.click();
	if (e.target.id === "app-q" && e.key === "Enter") void searchApps(e.target.value.trim());
	if (e.target.id === "swipe-q" && e.key === "Enter") {
		swipeFilter.texto = e.target.value.trim();
		void loadSwipes();
		return;
	}
	if (e.target.id === "input" && e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		void send();
	}
});

document.addEventListener("change", e => {
	if ("onbFile" in (e.target.dataset ?? {})) void uploadMaterial([...e.target.files]);
});

for (const type of ["dragover", "dragleave", "drop"]) {
	document.addEventListener(type, e => {
		const zone = e.target.closest?.("#onb-drop");
		if (!zone) return;
		e.preventDefault();
		zone.classList.toggle("over", type === "dragover");
		if (type === "drop" && e.dataTransfer.files.length) void uploadMaterial([...e.dataTransfer.files]);
	});
}

function grow(el) {
	el.style.height = "auto";
	el.style.height = `${el.scrollHeight + 2}px`;
}

document.addEventListener("input", e => {
	if (e.target.id !== "input" && e.target.id !== "onb-pitch" && e.target.id !== "juan-input") return;
	grow(e.target);
	if (e.target.id !== "onb-pitch") guardarEscrito(e.target.id, e.target.value);
});

