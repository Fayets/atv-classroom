// La barra lateral, con el diseño del Classroom de ATV (atv.css): arriba la credencial (Leverage y tu empresa) y
// "Tu espacio" (la carpeta abierta: tu empresa o un cliente); en el medio las secciones en bandejas con pestaña y
// la píldora de tinta que se desliza a la activa. La barra es solo para navegar: el piloto automático, el modo
// claro/oscuro y tu perfil (cuenta, configuración, navegador y sesión) van arriba a la derecha, como en el Classroom.
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
	const empresa = state.settings?.owner?.company || "Tu empresa";
	setHtml("side", `
	<div class="sb-cab">
		<button class="sb-cred" data-view="tablero" aria-label="Ir al tablero"><span class="sb-cred__logo">${document.getElementById("logo").innerHTML}</span><span class="sb-cred__txt"><b>Leverage</b><small>${esc(empresa)}</small></span></button>
		<button class="sb-plegar" data-sb-riel aria-label="${sbRiel ? "Mostrar la barra" : "Plegar la barra"}" title="${sbRiel ? "Mostrar la barra" : "Plegar la barra"}">${ic("panel-left")}</button>
	</div>
	<div class="sb-espacio"><span class="sb-etq">Tu espacio</span>${carpetaSelector()}</div>
	${avisos ? `<div class="sb-avisos">${avisos}</div>` : ""}
	<nav class="sb-nav" aria-label="Principal"><span class="sb-pildora" aria-hidden="true"></span>${SB_SECCIONES().map(([titulo, items]) => `<div class="sb-grupo"><span class="sb-etq">${titulo}</span>${items.map(item).join("")}</div>`).join("")}</nav>`);
	const side = document.getElementById("side");
	side.classList.add("sb");
	const riel = sbRiel && !sbCelular.matches;
	side.classList.toggle("is-riel", riel);
	side.classList.toggle("is-cajon", sbCajon);
	document.getElementById("sb-fondo")?.classList.toggle("is-abierto", sbCajon);
	document.body.classList.toggle("sb-riel", riel);
	moverPildora();
	renderBarraMovil(count);
	renderArriba();
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

/** En el celular: la barra de arriba con el menú (abre el cajón), el logo, lo que espera tu OK y tu perfil. */
function renderBarraMovil(count) {
	setHtml("sb-movil", `<button class="sb-movil__menu" data-sb-cajon aria-label="Abrir el menú"><svg class="i" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10"/></svg></button><button class="sb-movil__logo" data-view="tablero" aria-label="Ir al tablero">${document.getElementById("logo").innerHTML}<span>Leverage</span></button><span class="sp"></span>${count ? `<button class="sb-movil__cuenta" data-view="bandeja" aria-label="Bandeja: ${count} sin ver">${ic("inbox")}<span>${count}</span></button>` : ""}${sbCelular.matches ? perfilHtml(true) : ""}`);
}

/** Arriba de todo, como en el Classroom: a la izquierda dónde estás (migas) y a la derecha el piloto automático,
 * el modo claro/oscuro y tu perfil. El perfil abre un menú con tu cuenta, la configuración, el navegador y la sesión. */
let perfilAbierto = false;
const SALIR = '<svg class="i" viewBox="0 0 24 24"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4"/></svg>';
function migasHtml() {
	const activa = ([id, , , activas = [id]]) => activas.includes(view.type);
	const grupo = SB_SECCIONES().find(([, items]) => items.some(activa));
	const item = grupo?.[1].find(activa);
	const niveles = [grupo?.[0], item?.[2]];
	if (view.type === "agent") niveles.push(activeAgent()?.name);
	if (view.type === "ceo") niveles.push("#ceo");
	if (view.type === "historial") niveles.push(histTab === "hist" ? "Historial" : "Programados");
	if (view.type === "bandeja" && bwAbierto && bandejaChat) niveles.push(bandejaChat === "ceo" ? "#ceo" : state.agents.find(a => a.id === bandejaChat)?.name);
	const lista = niveles.filter(Boolean);
	return `<nav class="lv-migas" aria-label="Estás en">${lista.map((n, i) => (i === 1 && item && lista.length > 2 ? `<button data-view="${item[0]}">${esc(n)}</button>` : `<span ${i === lista.length - 1 ? 'aria-current="page"' : ""}>${esc(n)}</span>`)).join('<i aria-hidden="true">›</i>')}</nav>`;
}
function perfilHtml(movil = false) {
	const { name = "", company = "" } = state.settings?.owner ?? {};
	const modo = state.settings?.autopiloto?.modo ?? "apagado";
	const piloto = { apagado: "Apagado", interno: "Aprueba lo interno", todo: "Aprueba todo" }[modo];
	const conectado = state.login !== false;
	const temaMenu = `<button role="menuitem" data-lev-tema>${temaOscuro() ? SOL : ic("moon")}<span>${temaOscuro() ? "Modo claro" : "Modo oscuro"}</span></button>`;
	const menu = perfilAbierto ? `<div class="lv-menu" role="menu" aria-label="Tu perfil">
		<div class="lv-menu__yo"><span class="lv-ava lg">${esc(initials(name || "Vos"))}</span><span><b>${esc(name || "Vos")}</b><small>${esc(company || "Tu empresa")}</small></span></div>
		<button role="menuitem" data-section="cuentas">${ic("user-round")}<span>Mi cuenta<small>${conectado ? "Sesión de Claude conectada" : "Falta iniciar sesión"}</small></span></button>
		<button role="menuitem" data-section="general">${ic("settings")}<span>Configuración</span></button>
		${movil ? `<button role="menuitem" data-section="general">${ic("plane")}<span>Piloto automático<small>${piloto}</small></span></button>${temaMenu}` : ""}
		<button role="menuitem" data-dock>${ic("globe")}<span>Tu navegador</span></button>
		<hr>
		${conectado ? `<button role="menuitem" class="lv-menu__salir" data-lv-salir>${SALIR}<span>Cerrar sesión de Claude</span></button>` : `<button role="menuitem" class="lv-menu__entrar" data-section="cuentas">${SALIR}<span>Iniciar sesión con Claude</span></button>`}
	</div>` : "";
	const tema = `<div class="lv-tema" role="group" aria-label="Modo de color"><button data-lev-tema="light" aria-pressed="${!temaOscuro()}" aria-label="Modo claro" title="Modo claro">${SOL}</button><button data-lev-tema="dark" aria-pressed="${temaOscuro()}" aria-label="Modo oscuro" title="Modo oscuro">${ic("moon")}</button></div>`;
	const pilotoBtn = `<button class="lv-piloto ${modo === "apagado" ? "" : "is-on"}" data-section="general" title="Piloto automático: ${piloto}" aria-label="Piloto automático: ${piloto}">${ic("plane")}<span>${modo === "apagado" ? "Piloto apagado" : `Piloto · ${piloto.toLowerCase()}`}</span></button>`;
	return `<div class="lv-der ${movil ? "is-movil" : ""}">${movil ? "" : pilotoBtn + tema}<div class="lv-perfil"><button class="lv-ava" data-lv-perfil aria-haspopup="menu" aria-expanded="${perfilAbierto}" aria-label="Tu perfil">${esc(initials(name || "Vos"))}</button>${menu}</div></div>`;
}
function renderArriba() {
	setHtml("lv-top", sbCelular.matches ? "" : migasHtml() + perfilHtml());
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
	if (e.target.closest("[data-lv-perfil]")) {
		perfilAbierto = !perfilAbierto;
		renderSide();
		return;
	}
	// Cualquier opción del menú (o tocar afuera) lo cierra.
	if (perfilAbierto && !e.target.closest(".lv-menu__yo")) {
		perfilAbierto = false;
		setTimeout(renderSide);
	}
	if (e.target.closest("[data-lv-salir]")) {
		if (!confirm("¿Cerrás la sesión de Claude? Tus agentes dejan de trabajar hasta que vuelvas a entrar.")) return;
		void (async () => {
			const res = await api("/claude/salir", { method: "POST" });
			if (!res.ok) avisoDeVoz("No se pudo cerrar la sesión desde acá: quitá la cuenta en Mi cuenta.");
			await loadState();
			renderSide();
		})();
		return;
	}
	const tema = e.target.closest("[data-lev-tema]");
	if (tema) {
		const pedido = tema.dataset.levTema;
		themePref = pedido === "light" || pedido === "dark" ? pedido : temaOscuro() ? "light" : "dark";
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
	if (e.key === "Escape" && perfilAbierto) {
		perfilAbierto = false;
		renderSide();
	}
	if (e.key === "Escape" && sbCajon) {
		sbCajon = false;
		renderSide();
	}
});

/** Al costado del chat con un agente, solo cuando lo pedís con los íconos de arriba del chat (Archivos, Actividad y
 * Ficha): un panel que se suma al lado de la charla sin cerrarla. En el celular sube como una hoja desde abajo y la
 * charla sigue atrás. Es el único lugar con esa información: el panel fijo de antes ("Último pedido", "Archivos") ya no está. */
let agInfo = null;
let agArchivos = { id: "", firma: "", lista: null };
let fiBorrador = null;
const AG_INFO = [["archivos", "folder", "Archivos"], ["actividad", "clock", "Actividad"], ["ficha", "user-round", "Ficha"]];
/** El agente del chat abierto: el del chat de trabajo o el de la Bandeja. */
const agInfoAgente = () => (view.type === "agent" ? activeAgent() : view.type === "bandeja" && bwAbierto && bandejaChat && bandejaChat !== "ceo" ? state.agents.find(a => a.id === bandejaChat) : null);
const agInfoBotones = () => AG_INFO.map(([id, icono, texto]) => `<button class="ic ag-info-btn ${agInfo === id ? "on" : ""}" data-ag-info="${id}" data-tip="${texto}" aria-label="${texto}" aria-pressed="${agInfo === id}">${ic(icono)}</button>`).join("");
function agEstado(a) {
	const piden = pending().filter(r => r.agentId === a.id).length;
	if (a.busy) return ["trabaja", "Trabajando"];
	if (piden) return ["pide", "Te necesita"];
	if (a.queued) return ["fila", "En fila"];
	if (a.asleep) return ["duerme", "Dormido"];
	return ["libre", "Disponible"];
}

function renderPanel() {
	const a = agInfo ? agInfoAgente() : null;
	document.querySelector(".app")?.classList.toggle("conpanel", Boolean(a));
	if (!a) {
		fiBorrador = null;
		return setHtml("panel", "");
	}
	const panel = document.getElementById("panel");
	if (!panel.querySelector(".ag-info")) setHtml("panel", `<div class="ag-info" role="complementary"><div id="ag-info-cab"></div><div class="ag-info__cuerpo" id="ag-info-cuerpo"></div></div>`);
	const [clase, texto] = agEstado(a);
	setHtml("ag-info-cab", `<header class="ag-info__cab">${avatar(a, "sm")}<span class="ag-info__quien"><b>${esc(a.name)}</b><span class="tb2-ag is-${clase === "trabaja" ? "trabaja" : clase === "fila" ? "fila" : clase}"><i aria-hidden="true"></i>${texto}</span></span><button class="ic" data-ag-info-cerrar aria-label="Cerrar el panel">${ic("x")}</button></header><div class="ag-info__tabs" role="tablist">${AG_INFO.map(([id, icono, t]) => `<button role="tab" aria-selected="${agInfo === id}" class="${agInfo === id ? "on" : ""}" data-ag-info="${id}">${ic(icono)}${t}</button>`).join("")}</div>`);
	setHtml("ag-info-cuerpo", agInfo === "archivos" ? agArchivosHtml(a) : agInfo === "actividad" ? agActividadHtml(a) : agFichaHtml(a));
}

function agArchivosHtml(a) {
	const firma = state.requests.filter(r => r.agentId === a.id && r.file).map(r => r.id).join();
	if (agArchivos.id !== a.id || agArchivos.firma !== firma) {
		agArchivos = { id: a.id, firma, lista: agArchivos.id === a.id ? agArchivos.lista : null };
		void (async () => {
			const res = await api(`/agents/${a.id}/files`).catch(() => null);
			if (agArchivos.id !== a.id) return;
			agArchivos.lista = res?.ok ? await res.json() : [];
			renderPanel();
		})();
	}
	if (!agArchivos.lista) return `<p class="ag-info__vacio">Buscando sus archivos…</p>`;
	if (!agArchivos.lista.length) return `<div class="ag-info__vacio"><b>Todavía no guardó archivos</b>Lo que entregue va a aparecer acá.</div>`;
	const ext = p => (/\.([a-z0-9]+)$/i.exec(p ?? "")?.[1] ?? "doc").toUpperCase();
	const estado = { pendiente: ["Espera tu OK", "rojo"], aprobado: ["Aprobado", "ok"], cambios: ["Con cambios", ""], rechazado: ["Rechazado", ""], reemplazado: ["Versión vieja", ""] };
	return `<ul class="ag-arch">${agArchivos.lista.map(f => {
		const e = estado[f.state];
		return `<li><button data-file="${esc(f.path)}"><span class="tb2-hoja" aria-hidden="true"><i>${esc(ext(f.path))}</i></span><span class="ag-arch__txt"><b>${esc(f.title ?? f.name)}</b><small>${esc(f.name)}${f.at ? ` · ${ago(f.at).toLowerCase()}` : ""}</small></span>${e ? `<span class="btag ${e[1]}">${e[0]}</span>` : ""}</button></li>`;
	}).join("")}</ul>`;
}

function agActividadHtml(a) {
	const orden = ordenDe(a);
	const [, texto] = agEstado(a);
	const paso = a.busy ? (a.ahora ? pasoLegible(a.ahora) : "Trabajando") : a.queued ? "Arranca cuando se libere" : a.asleep ? "Dormido hasta que lo llamen" : "Libre para lo que le pidas";
	const piden = pending().filter(r => r.agentId === a.id);
	const anota = state.beats?.[a.id]?.checks ?? [];
	const tickets = (state.tickets ?? []).filter(t => t.owner === a.id);
	const charlas = (state.comms ?? []).filter(c => c.from === a.id || c.to === a.id).slice(-12).reverse();
	const quien = id => (id === "dueno" ? "Vos" : who(id));
	const bloque = (titulo, n, cuerpo) => `<section class="ag-blq"><h3>${titulo}${n ? `<span>${n}</span>` : ""}</h3>${cuerpo}</section>`;
	return `${bloque("Ahora", 0, `<div class="ag-ahora"><p>${esc(texto)} · ${esc(paso)}</p>${orden ? `<blockquote>“${esc(orden.text.split(/\n/)[0].trim().slice(0, 160))}”<cite>${esc(orden.from === "dueno" ? "Se lo pediste vos" : `Se lo pidió ${who(orden.from)}`)} · hace ${lasted(orden.at, new Date())}</cite></blockquote>` : `<p class="ag-info__vacio">Todavía no recibió pedidos.</p>`}</div>`)}
	${piden.length ? bloque("Espera tu OK", piden.length, piden.map(r => `<div class="ag-pide"><b>${esc(actionOf(r)?.title ?? r.title)}</b><small>${({ ok: "Pide tu OK", accion: "Quiere hacer esto", entrega: "Entrega" })[r.kind] ?? "Pide tu OK"} · ${ago(r.at).toLowerCase()}</small><div><button class="b go" data-approve="${r.id}">Aprobar</button><button class="b" data-ver-pedido="${r.id}">Ver</button></div></div>`).join("")) : ""}
	${anota.length ? bloque("Se anotó para revisar", anota.length, `<ul class="ag-lista">${anota.map(c => `<li>${esc(c)}</li>`).join("")}</ul>`) : ""}
	${tickets.length ? bloque("Tickets", tickets.length, `<ul class="ag-lista">${tickets.map(t => `<li><b>${esc(t.id)}</b> ${esc(t.title)}<small>${esc(t.state)}</small></li>`).join("")}</ul>`) : ""}
	${bloque("Charlas con el equipo", charlas.length, charlas.length ? `<ol class="ag-charlas">${charlas.map(c => `<li><span><b>${esc(quien(c.from))}</b> → <b>${esc(quien(c.to))}</b><time>${ago(c.at)}</time></span><p>${esc(String(c.text).split("\n")[0].slice(0, 140))}</p></li>`).join("")}</ol>` : `<p class="ag-info__vacio">No habló con nadie esta semana.</p>`)}`;
}

/** La ficha se edita acá mismo y se guarda sin salir del chat. Lo que escribís queda en un borrador:
 * los repintados (el estado se actualiza cada pocos segundos) no lo borran. */
function agFichaHtml(a) {
	if (fiBorrador?.id !== a.id) fiBorrador = { id: a.id, name: a.name, title: a.title ?? "", boss: bossId(a) ?? "", error: "", guardado: false };
	const f = fiBorrador;
	const modelo = MODELOS.find(([id]) => id === (a.modelo ?? (typeof a.model === "string" ? a.model : "")))?.[1];
	return `<div class="ag-ficha">
		<dl class="ag-datos"><div><dt>Área</dt><dd>${esc(a.department ? nombre(a.department) : "Mano derecha")}</dd></div><div><dt>Modelo</dt><dd>${esc(modelo ?? "—")}</dd></div><div><dt>Reporta a</dt><dd>${esc(bossId(a) ? who(bossId(a)) : "Vos")}</dd></div><div><dt>Entregas</dt><dd>${state.requests.filter(r => r.agentId === a.id && r.kind === "entrega").length}</dd></div></dl>
		<form class="ag-form" id="ag-ficha-form">
			<label>Nombre<input id="fi-name" value="${esc(f.name)}" maxlength="40" autocomplete="off" required></label>
			<label>Cargo<input id="fi-title" value="${esc(f.title)}" placeholder="${esc(ROLE_NAMES[a.role] ?? "Agente")}" autocomplete="off"></label>
			${modeloHtml(a)}
			${a.role === "asistente" ? "" : `<label>Reporta a<select id="fi-boss">${state.agents.filter(x => x.id !== a.id).map(x => `<option value="${x.id}" ${x.id === f.boss ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>`}
			${f.error ? `<div class="soft-note">${esc(f.error)}</div>` : ""}
			<div class="ag-form__pie">${f.guardado ? `<span class="ag-ok">${ic("check")}Guardado</span>` : ""}<span class="sp"></span><button class="b go" type="submit">Guardar</button></div>
		</form>
	</div>`;
}

document.addEventListener("input", e => {
	if (!fiBorrador || !e.target.closest?.("#ag-ficha-form")) return;
	if (e.target.id === "fi-name") fiBorrador.name = e.target.value;
	if (e.target.id === "fi-title") fiBorrador.title = e.target.value;
	if (e.target.id === "fi-boss") fiBorrador.boss = e.target.value;
	fiBorrador.guardado = false;
});
document.addEventListener("change", e => {
	if (fiBorrador && e.target.id === "fi-boss") fiBorrador.boss = e.target.value;
});
document.addEventListener("submit", async e => {
	if (e.target.id !== "ag-ficha-form") return;
	e.preventDefault();
	const a = agInfoAgente();
	if (!a || !fiBorrador) return;
	const modelo = e.target.querySelector("input[name=agent-model]:checked")?.value;
	const res = await api(`/agents/${a.id}`, { method: "PATCH", body: JSON.stringify({ name: fiBorrador.name.trim(), title: fiBorrador.title.trim(), ...(a.role === "asistente" ? {} : { managerId: fiBorrador.boss }), ...(modelo ? { model: modelo } : {}) }) });
	const cuerpo = res.ok ? {} : await res.json().catch(() => ({}));
	await loadState();
	fiBorrador = { ...fiBorrador, name: res.ok ? (agInfoAgente()?.name ?? fiBorrador.name) : fiBorrador.name, error: res.ok ? "" : (cuerpo.error ?? "No se pudo guardar"), guardado: res.ok };
	modeloEnFicha = null;
	renderSide();
	renderHead();
	lastBody = "";
	renderBody();
});
document.addEventListener("click", e => {
	const t = e.target.closest("[data-ag-info]");
	if (t) {
		agInfo = agInfo === t.dataset.agInfo && t.classList.contains("ag-info-btn") ? null : t.dataset.agInfo;
		if (agInfo !== "ficha") fiBorrador = null;
		renderPanel();
		renderHead();
		lastBody = "";
		if (view.type === "bandeja") renderBody();
		return;
	}
	if (e.target.closest("[data-ag-info-cerrar]")) {
		agInfo = null;
		renderPanel();
		renderHead();
		lastBody = "";
		if (view.type === "bandeja") renderBody();
	}
});
addEventListener("keydown", e => {
	if (e.key === "Escape" && agInfo && !document.querySelector(".omodal")) {
		agInfo = null;
		renderPanel();
		renderHead();
		lastBody = "";
		if (view.type === "bandeja") renderBody();
	}
});

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

/** La cápsula de arriba del Tablero: lo de hoy, lo que viene (Programados) y lo que ya pasó (Historial). */
let histTab = stored("histTab", "prog");
let histRango = "hoy";
let histCuantos = 60;
const tbCapsula = () => `<div class="seg tbseg" role="tablist">${[["tablero", "", "Hoy"], ["historial", "prog", "Programados"], ["historial", "hist", "Historial"]].map(([v, tab, texto]) => {
	const on = view.type === v && (!tab || histTab === tab);
	return `<button role="tab" aria-selected="${on}" class="${on ? "on" : ""}" data-view="${v}" ${tab ? `data-hist-tab="${tab}"` : ""}>${texto}</button>`;
}).join("")}</div>`;
const fechaLarga = d => {
	const f = d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
	return f[0].toUpperCase() + f.slice(1);
};
const diaClave = d => new Date(d).toDateString();
function diaNombre(d) {
	const dias = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
	if (dias === 0) return "Hoy";
	if (dias === 1) return "Mañana";
	if (dias === -1) return "Ayer";
	return fechaLarga(new Date(d));
}

/** Programados: solo lo que va a pasar. Cada vez que corre una rutina en los próximos 7 días, por día; hoy, primero y marcado. */
function programadosHtml() {
	const ahora = new Date();
	const rutinas = extra.routines ?? [];
	const veces = [];
	for (const r of rutinas.filter(r => r.prendida)) {
		for (let d = 0; d < 7; d++) {
			const cuando = new Date(ahora);
			cuando.setDate(ahora.getDate() + d);
			cuando.setHours(r.hora, 0, 0, 0);
			if (r.dias.includes(cuando.getDay()) && cuando > ahora) veces.push({ r, cuando });
		}
	}
	veces.sort((a, b) => a.cuando - b.cuando);
	const dias = Map.groupBy ? Map.groupBy(veces, v => diaClave(v.cuando)) : new Map(veces.reduce((m, v) => m.set(diaClave(v.cuando), [...(m.get(diaClave(v.cuando)) ?? []), v]), new Map()));
	const hoyClave = diaClave(ahora);
	if (!dias.has(hoyClave)) dias.set(hoyClave, []);
	const orden = [...dias.keys()].sort((a, b) => new Date(a) - new Date(b));
	const quien = r => state.agents.find(a => a.department === r.departamento && a.role === r.rol);
	const fila = ({ r, cuando }) => {
		const ag = quien(r);
		return `<li class="hs2-fila"><time>${hora(cuando.toISOString())}</time><span class="hs2-que">${ag ? avatar(ag, "xs") : ""}<span><b>${esc(rutinaNombre(r))}</b><small>${esc(rutinaQuien(r))} · ${DIAS_CORTOS(r.dias)}</small></span></span><span class="hs2-acc"><button class="b" data-rut-pausa="${esc(r.id)}" data-dep="${esc(r.departamento)}">Pausar</button></span></li>`;
	};
	const instagram = state.instagram?.connected ? `<li class="hs2-fila is-siempre"><time>Cada hora</time><span class="hs2-que"><span class="hs2-ico">${ic("instagram")}</span><span><b>Guardar las historias de Instagram</b><small>Leverage${state.instagram.lastSync ? ` · la última, ${hora(state.instagram.lastSync)}` : ""}</small></span></span><span class="hs2-acc"></span></li>` : "";
	const grupos = orden.map(clave => {
		const lista = dias.get(clave);
		const esHoy = clave === hoyClave;
		return `<section class="hs2-dia ${esHoy ? "is-hoy" : ""}"><h3>${diaNombre(clave)}<small>${esHoy ? fechaLarga(ahora) : `${lista.length} ${lista.length === 1 ? "cosa" : "cosas"}`}</small></h3><ol>${esHoy ? instagram : ""}${lista.map(fila).join("") || (esHoy && !instagram ? `<li class="hs2-nada">No queda nada programado para hoy.</li>` : "")}</ol></section>`;
	}).join("");
	const pausadas = rutinas.filter(r => !r.prendida);
	const latidos = Object.entries(state.beats ?? {}).filter(([, b]) => b.checks.length);
	const aside = `<aside class="hs2-lado">
		<section class="hs2-caja"><h3>En pausa<span>${pausadas.length}</span></h3>${pausadas.length ? `<ul>${pausadas.map(r => `<li><span><b>${esc(rutinaNombre(r))}</b><small>${esc(rutinaQuien(r))} · ${DIAS_CORTOS(r.dias)} a las ${r.hora}</small></span><button class="b" data-rut-sigue="${esc(r.id)}" data-dep="${esc(r.departamento)}">Reanudar</button></li>`).join("")}</ul>` : `<p class="hs2-vacio">Ninguna rutina está en pausa.</p>`}</section>
		${latidos.length ? `<section class="hs2-caja"><h3>Para revisar<span>${latidos.reduce((n, [, b]) => n + b.checks.length, 0)}</span></h3><ul>${latidos.map(([id, b]) => b.checks.map(c => `<li><span>${avatar({ id }, "xs")}<span><b>${esc(c)}</b><small>Se lo anotó ${esc(who(id))}</small></span></span></li>`).join("")).join("")}</ul></section>` : ""}
		<button class="tb2-link" data-view="rutinas">Todas las rutinas ${ic("chevron-right")}</button>
	</aside>`;
	return `<div class="hs2-cuerpo"><div class="hs2-agenda">${grupos}</div>${aside}</div>`;
}

/** Historial: solo lo que ya pasó, del más nuevo al más viejo, por día. Se arma con lo mismo que ves en el resto de la app. */
const HIST_RANGOS = [["hoy", "Hoy"], ["ayer", "Ayer"], ["7", "Últimos 7 días"], ["30", "Últimos 30 días"], ["todo", "Todo el historial"]];
function eventosHistorial() {
	const ahora = Date.now();
	const nombreDe = id => (id === "dueno" ? "Vos" : who(id));
	const titulo = r => (actionOf(r)?.title ?? r.title).replace(/^Crear tablero en Miro: /, "");
	const ev = [];
	for (const r of state.requests) {
		if (r.at) ev.push({ at: r.at, id: r.agentId, texto: `<b>${esc(r.author)}</b> ${r.kind === "entrega" ? "entregó" : r.kind === "accion" ? "pidió permiso para" : "te propuso"} «${esc(titulo(r))}»`, file: r.file, pide: r.state === "pendiente" ? r.id : null, tag: r.state === "pendiente" ? ["Espera tu OK", "rojo"] : null });
		const decision = { aprobado: r.porPiloto ? "El piloto aprobó" : "Aprobaste", cambios: "Pediste cambios en", rechazado: "Rechazaste", reemplazado: "Pediste cambios en" }[r.state];
		if (r.decididoAt && decision) ev.push({ at: r.decididoAt, id: r.porPiloto ? "piloto" : "dueno", texto: `${decision} «${esc(titulo(r))}»${r.nota ? `<small>“${esc(r.nota)}”</small>` : ""}`, file: r.state === "aprobado" ? r.file : null, tag: r.state === "aprobado" ? ["Aprobado", "ok"] : r.state === "rechazado" ? ["Rechazado", ""] : ["Cambios", ""] });
	}
	for (const p of state.ceo) if (p.at && !["Te necesito"].includes(p.story?.tag ?? "")) ev.push({ at: p.at, id: p.agentId, texto: p.agentId === "dueno" ? `Escribiste en #ceo: ${esc(String(p.text).split("\n")[0].slice(0, 90))}` : `<b>${esc(p.author)}</b> reportó en #ceo: ${esc((p.story?.title || String(p.text ?? "").replace(/\*\*/g, "").split("\n")[0]).slice(0, 90))}`, ceo: true });
	for (const k of state.kpis) {
		if (k.at) ev.push({ at: k.at, id: k.agentId, texto: `<b>${esc(k.proposedBy)}</b> propuso medir «${esc(k.name)}»`, tag: k.state === "propuesta" ? ["Espera tu OK", "rojo"] : null });
		if (k.decididoAt) ev.push({ at: k.decididoAt, id: "dueno", texto: `${k.state === "aprobada" ? "Sumaste la métrica" : "Descartaste la métrica"} «${esc(k.name)}»`, tag: k.state === "aprobada" ? ["Aprobado", "ok"] : null });
	}
	for (const c of state.comms ?? []) if (c.at && c.from === "dueno") ev.push({ at: c.at, id: "dueno", texto: `Le pediste a <b>${esc(nombreDe(c.to))}</b>: ${esc(String(c.text).split("\n")[0].slice(0, 90))}` });
	for (const c of state.corridas ?? []) {
		const r = (extra.routines ?? []).find(x => x.id === c.rutina && x.departamento === c.departamento) ?? { id: c.rutina, departamento: c.departamento, rol: c.rol };
		const ag = state.agents.find(a => a.department === c.departamento && a.role === c.rol);
		ev.push({ at: c.at, id: ag?.id, texto: `Corrió la rutina «${esc(rutinaNombre(r))}»`, rutina: true });
	}
	return ev.filter(e => e.at && Date.parse(e.at) <= ahora + 60_000).sort((a, b) => b.at.localeCompare(a.at));
}
function historialListaHtml() {
	const hoy = new Date();
	hoy.setHours(0, 0, 0, 0);
	const desde = { hoy: hoy.getTime(), ayer: hoy.getTime() - 86_400_000, 7: hoy.getTime() - 6 * 86_400_000, 30: hoy.getTime() - 29 * 86_400_000, todo: 0 }[histRango];
	const hasta = histRango === "ayer" ? hoy.getTime() : Number.POSITIVE_INFINITY;
	const todos = eventosHistorial();
	const lista = todos.filter(e => Date.parse(e.at) >= desde && Date.parse(e.at) < hasta);
	const cuenta = id => todos.filter(e => Date.parse(e.at) >= { hoy: hoy.getTime(), ayer: hoy.getTime() - 86_400_000, 7: hoy.getTime() - 6 * 86_400_000, 30: hoy.getTime() - 29 * 86_400_000, todo: 0 }[id] && Date.parse(e.at) < (id === "ayer" ? hoy.getTime() : Infinity)).length;
	const filtros = `<div class="hs2-filtros" role="group" aria-label="Período">${HIST_RANGOS.map(([id, txt]) => `<button class="${histRango === id ? "on" : ""}" aria-pressed="${histRango === id}" data-hist-rango="${id}">${txt}<span>${cuenta(id)}</span></button>`).join("")}</div>`;
	if (!lista.length) return `${filtros}<div class="tb2-vacio hs2-vacio-g"><b>${histRango === "hoy" ? "Hoy todavía no pasó nada" : "No pasó nada en esos días"}</b><span>Lo que haga tu equipo y lo que decidas vos queda acá.</span></div>`;
	const ver = lista.slice(0, histCuantos);
	const dias = Map.groupBy ? Map.groupBy(ver, e => diaClave(e.at)) : new Map(ver.reduce((m, e) => m.set(diaClave(e.at), [...(m.get(diaClave(e.at)) ?? []), e]), new Map()));
	const cara = e => (e.id === "dueno" ? `<span class="lv-ava xs">${esc(initials(state.settings?.owner?.name || "Vos"))}</span>` : e.id === "piloto" ? `<span class="hs2-ico">${ic("plane")}</span>` : e.rutina && !e.id ? `<span class="hs2-ico">${ic("clock")}</span>` : avatar({ id: e.id }, "xs"));
	const fila = e => `<li class="hs2-fila ${e.rutina ? "is-rutina" : ""}"><time>${hora(e.at)}</time><span class="hs2-que">${cara(e)}<span class="hs2-txt">${e.texto}</span></span><span class="hs2-acc">${e.tag ? `<span class="btag ${e.tag[1]}">${e.tag[0]}</span>` : ""}${e.pide ? `<button class="b go" data-approve="${e.pide}">Aprobar</button><button class="b" data-ver-pedido="${e.pide}">Ver</button>` : e.file ? `<button class="b" data-file="${esc(e.file)}">Abrir</button>` : e.ceo ? `<button class="b" data-view="ceo">Ver</button>` : ""}</span></li>`;
	const grupos = [...dias].map(([clave, l]) => `<section class="hs2-dia ${diaNombre(clave) === "Hoy" ? "is-hoy" : ""}"><h3>${diaNombre(clave)}<small>${diaNombre(clave) === "Hoy" ? fechaLarga(new Date()) : `${l.length} ${l.length === 1 ? "cosa" : "cosas"}`}</small></h3><ol>${l.map(fila).join("")}</ol></section>`).join("");
	return `${filtros}<div class="hs2-agenda">${grupos}</div>${lista.length > histCuantos ? `<button class="tbmas hs2-mas" data-hist-mas-todo>Ver ${Math.min(60, lista.length - histCuantos)} más (quedan ${lista.length - histCuantos})</button>` : ""}`;
}

function historialHtml() {
	const prog = histTab !== "hist";
	return `<div class="tablero tb2 hs2">
	<header class="tb2-cab">
		<div class="tb2-titulo"><p class="tb2-ojo">${fechaLarga(new Date())}</p><h1>${prog ? `Lo que tu equipo <em>tiene agendado.</em>` : `Lo que ya <em>pasó.</em>`}</h1></div>
		${tbCapsula()}
	</header>
	${prog ? programadosHtml() : historialListaHtml()}
</div>`;
}

document.addEventListener("click", async e => {
	const tab = e.target.closest("[data-hist-tab]");
	if (tab) {
		histTab = tab.dataset.histTab;
		store("histTab", histTab);
		lastBody = "";
		if (view.type === "historial") renderBody();
		renderArriba();
		return;
	}
	const rango = e.target.closest("[data-hist-rango]");
	if (rango) {
		histRango = rango.dataset.histRango;
		histCuantos = 60;
		lastBody = "";
		return renderBody();
	}
	if (e.target.closest("[data-hist-mas-todo]")) {
		histCuantos += 60;
		lastBody = "";
		return renderBody();
	}
	const pausa = e.target.closest("[data-rut-pausa],[data-rut-sigue]");
	if (pausa) {
		const prendida = "rutSigue" in pausa.dataset;
		pausa.disabled = true;
		const res = await api("/routines", { method: "POST", body: JSON.stringify({ departamento: pausa.dataset.dep, id: pausa.dataset.rutPausa ?? pausa.dataset.rutSigue, prendida }) });
		if (res.ok) extra.routines = await res.json();
		lastBody = "";
		renderBody();
	}
});

/** A quién le escribís desde el Tablero: el Asistente por defecto, o cualquiera del equipo. */
let tbPara = stored("tbPara", "");
let tbParaAbierto = false;
const tbDestino = () => state.agents.find(a => a.id === tbPara) ?? state.agents.find(a => a.role === "asistente") ?? state.agents[0];
function tbParaHtml() {
	const d = tbDestino();
	if (!d) return "";
	const lista = tbParaAbierto ? `<div class="tb2-para__lista" role="listbox" aria-label="A quién le escribís">${state.agents.map(a => `<button type="button" role="option" aria-selected="${a.id === d.id}" data-tb-para-elegir="${a.id}">${avatar(a, "xs")}<span><b>${esc(a.name)}</b><small>${esc(a.department ? nombre(a.department) : "Tu mano derecha")}</small></span>${a.id === d.id ? ic("check") : ""}</button>`).join("")}</div>` : "";
	return `<div class="tb2-para"><button type="button" class="tb2-para__btn" data-tb-para aria-haspopup="listbox" aria-expanded="${tbParaAbierto}" title="Cambiar a quién le escribís">${avatar(d, "xs")}<b>${esc(d.name)}</b>${ic("chevron-down")}</button><span class="tb2-coma" aria-hidden="true">,</span>${lista}</div>`;
}
document.addEventListener("click", e => {
	if (e.target.closest("[data-tb-para]")) {
		tbParaAbierto = !tbParaAbierto;
		lastBody = "";
		return renderBody();
	}
	const elegido = e.target.closest("[data-tb-para-elegir]");
	if (elegido) {
		tbPara = elegido.dataset.tbParaElegir;
		store("tbPara", tbPara);
		tbParaAbierto = false;
		lastBody = "";
		renderBody();
		document.getElementById("tb-input")?.focus();
		return;
	}
	if (tbParaAbierto && !e.target.closest(".tb2-para")) {
		tbParaAbierto = false;
		lastBody = "";
		renderBody();
	}
});

/** El inicio, con el diseño del Classroom (estilos .tb2 en atv.css): el saludo, el marcador del día y los bloques.
 * Lo que espera tu OK va primero y más grande; al lado, quién está trabajando ahora y las métricas que te proponen
 * (otro tipo de pedido, con otro diseño); abajo, lo que se entregó hoy y lo que viene. Al pie, el pedido al equipo.
 * No tiene animaciones de entrada: el tablero se vuelve a pintar entero cada pocos segundos. */
function tableroHtml() {
	const okReq = [...pending()].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
	const okKpi = proposed();
	const enCurso = state.agents.filter(a => a.busy || a.queued).sort((a, b) => Number(Boolean(b.busy)) - Number(Boolean(a.busy)));
	const entregas = state.requests.filter(r => r.kind === "entrega" && hoyEs(r.at) && r.state !== "reemplazado").sort((a, b) => b.at.localeCompare(a.at));
	const rutinas = (extra.routines ?? []).filter(r => r.prendida).map(r => ({ r, cuando: proximaVez(r) })).filter(x => x.cuando).sort((a, b) => a.cuando - b.cuando);
	const ahora = new Date();
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
	// Una métrica propuesta no es un pedido de trabajo: se ve como una ficha de número, con la meta en grande.
	const kpiCard = k => `<article class="tb2-kpi"><div class="tb2-kpi__meta"><small>Meta</small><b>${esc(k.target)}</b></div><div class="tb2-kpi__txt"><b>${esc(k.name)}</b><small>La propone ${esc(k.proposedBy)}${k.command ? ` · se mide: ${esc(k.command)}` : ""}</small><div class="tb2-kpi__bots"><button class="b go" data-kpi-ok="${k.id}">Sumar la métrica</button><button class="b" data-kpi-no="${k.id}">Descartar</button></div></div></article>`;
	const cursoCard = a => {
		const orden = ordenDe(a);
		const paso = a.busy ? (a.ahora ? pasoLegible(a.ahora) : "Trabajando") : "Arranca cuando se libere";
		const area = a.department ? nombre(a.department) : ROLE_NAMES[a.role] ?? "";
		return `<button class="tb2-curso ${a.busy ? "is-trabaja" : "is-fila"}" data-agent="${a.id}">
			${avatar(a, "sm")}
			<span class="tb2-curso__txt"><span class="tb2-curso__cab"><b>${esc(a.name)}<small>${esc(area)}</small></b><span class="tb2-ag ${a.busy ? "is-trabaja" : "is-fila"}"><i aria-hidden="true"></i>${a.busy ? "Trabajando" : "En fila"}${a.busy && orden ? ` · ${lasted(orden.at, ahora)}` : ""}</span></span>${orden ? `<span class="tb2-curso__tarea">${esc(orden.text.split(/\n/)[0].trim().slice(0, 110))}</span>` : ""}<span class="tb2-curso__paso">${esc(paso)}</span></span>
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
	const d = tbDestino();
	return `<div class="tablero tb2">
	<header class="tb2-cab">
		<div class="tb2-titulo"><p class="tb2-ojo">${fechaLarga(ahora)}${empresa ? `<span class="tb2-ojo__emp"> · ${esc(empresa)}</span>` : ""}</p><h1>${saludo}${primerNombre ? `, ${esc(primerNombre)}` : ""}.<br><em>Esto es lo de tu equipo hoy.</em></h1></div>
		${tbCapsula()}
	</header>
	<div class="tb2-marcador" role="list">
		${cifra(okReq.length, okReq.length === 1 ? "espera tu OK" : "esperan tu OK", okReq.length ? "is-pide" : "")}
		${cifra(enCurso.filter(a => a.busy).length, "trabajando ahora", enCurso.some(a => a.busy) ? "is-vivo" : "")}
		${cifra(entregas.length, entregas.length === 1 ? "entrega hoy" : "entregas hoy")}
		${cifra(agenda.length, "en la agenda")}
	</div>
	<div class="tb2-grilla">
		<div class="tb2-col">
		${sec("ok", "Esperan tu OK", okReq.length, okReq.length ? `<div class="tb2-lista">${okReq.map(okCard).join("")}</div>` : vacio("Nada espera tu OK", "Cuando alguien del equipo te pida algo, aparece acá."), okReq.length ? `<button class="tb2-link" data-view="bandeja">Ir a la Bandeja ${ic("chevron-right")}</button>` : "")}
		${sec("hecho", "Entregado hoy", entregas.length, entregas.length ? `<div class="tb2-entregas">${entregas.slice(0, 6).map(entregaCard).join("")}</div>${entregas.length > 6 ? `<button class="tb2-link" data-view="historial" data-hist-tab="hist">Ver las otras ${entregas.length - 6} ${ic("chevron-right")}</button>` : ""}` : vacio("Todavía no hay entregas hoy", "Lo que el equipo termine va a quedar acá, listo para abrir."))}
		</div><div class="tb2-col">
		${sec("vivo", "Trabajando ahora", enCurso.length, enCurso.length ? `<div class="tb2-lista">${enCurso.map(cursoCard).join("")}</div>` : vacio("Nadie está trabajando", `Escribile a ${esc(d?.name ?? "tu equipo")} arriba y lo pone en marcha.`))}
		${okKpi.length ? sec("kpis", "Métricas propuestas", okKpi.length, `<p class="tb2-sec__nota">Tu equipo quiere medir esto todos los días. No es trabajo para aprobar: es un número para seguir.</p><div class="tb2-lista">${okKpi.map(kpiCard).join("")}</div>`) : ""}
		${sec("prog", "Lo que viene", agenda.length, agenda.length ? `<ol class="tb2-agenda">${agenda.slice(0, 6).map(x => `<li><span class="tb2-agenda__cuando">${esc(x.cuando)}</span><span class="tb2-agenda__txt"><b>${esc(x.nombre)}</b><small>${esc(x.quien)}</small></span></li>`).join("")}</ol>` : vacio("No hay nada programado", "Las rutinas se prenden en Rutinas."), `<button class="tb2-link" data-view="historial" data-hist-tab="prog">Ver todo ${ic("chevron-right")}</button>`)}
		</div>
	</div>
	<form class="tbpedido tb2-pedido" id="tb-form">${tbParaHtml()}<label class="tbcampo"><span class="tbvh">Pedido para ${esc(d?.name ?? "tu equipo")}</span><textarea id="tb-input" rows="1" autocomplete="off" placeholder="${d?.role === "asistente" && !sbCelular.matches ? "armame el reporte de la semana para mañana…" : "¿qué necesitás?"}"></textarea></label>${botonVoz("tb-input")}<button class="send" aria-label="Enviar">${ic("arrow-up")}</button></form>
</div>`;
}

function headerFor(a) {
	const asks = pending().some(r => r.agentId === a.id);
	const pill = a.busy ? `<span class="pill">Trabajando</span>` : asks ? `<span class="pill wait">Espera tu OK</span>` : `<span class="pill idle">${a.queued ? "En fila" : a.asleep ? "Dormido" : "Disponible"}</span>`;
	return `<div class="head">${avatar(a, "hd")}<h1>${esc(a.name)}</h1><span class="sp"></span>${pill}${agInfoBotones()}</div>`;
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

