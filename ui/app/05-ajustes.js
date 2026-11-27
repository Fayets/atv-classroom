// ---------- Monitor de memoria en vivo ----------
// Mientras Ajustes > General está abierto se pide una foto cada 2 segundos y se actualiza en el lugar:
// la barra se mueve con transform (sin repintar la pantalla) y los números cambian de texto.
const ESTADO_MEMORIA = { normal: ["Normal", "ok"], alta: ["Alta", "alta"], critica: ["Al límite", "critica"] };
const gb = b => `${(b / 1024 ** 3).toFixed(1).replace(".", ",")} GB`;
const mb = b => (b >= 1024 ** 3 ? gb(b) : `${Math.round(b / 1024 ** 2)} MB`);
let memFoto = null;

function filasMemoria(f) {
	// De todas las carpetas: un agente de un cliente también ocupa memoria de esta compu.
	const filas = (f.lista ?? []).slice(0, 10);
	if (!filas.length) return `<div class="muted">Ningún agente despierto ahora.</div>`;
	const tope = filas[0].bytes;
	const deQuien = c => (c ? ` · ${esc((state.clientes ?? []).find(x => x.id === c)?.nombre ?? c)}` : "");
	return filas.map(a => `<div class="mfila" data-mem-agente="${a.id}">${avatar(a)}<span class="mnom">${esc(a.name)}<small>${deQuien(a.cliente)}</small></span><span class="mpista"><i style="transform:scaleX(${(a.bytes / tope).toFixed(3)})"></i></span><span class="mval">${mb(a.bytes)}</span></div>`).join("");
}

function monitorMemoriaHtml() {
	const f = memFoto;
	if (!f) return `<div class="mmon"><div class="muted">Midiendo la memoria…</div></div>`;
	const [nombre, clase] = ESTADO_MEMORIA[f.presion] ?? ESTADO_MEMORIA.normal;
	const parte = f.usada ? Math.min(1, f.usada / f.total) : 0;
	const totalAgentes = (f.lista ?? []).reduce((t, a) => t + a.bytes, 0);
	return `<div class="mmon" id="mmon"><div class="mcab"><b>Memoria de la compu</b><span class="mestado ${clase}" id="mmon-estado"><i></i>${nombre}</span></div>
	<div class="mnum"><b id="mmon-usada">${f.usada ? gb(f.usada) : "—"}</b><span> de ${gb(f.total)}</span><span class="sp"></span><small id="mmon-agentes">Agentes: ${mb(totalAgentes)}</small></div>
	<div class="mbarra ${clase}" id="mmon-barra" role="meter" aria-label="Memoria usada" aria-valuemin="0" aria-valuemax="${f.total}" aria-valuenow="${f.usada ?? 0}"><i style="transform:scaleX(${parte.toFixed(3)})"></i></div>
	<small class="muted" id="mmon-swap">${f.swap > 0.05 * 1024 ** 3 ? `Además, ${gb(f.swap)} pasaron al disco (swap): la compu ya está corta de memoria.` : "Sin usar el disco como memoria (swap)."}</small>
	<div class="mlista" id="mmon-lista">${filasMemoria(f)}</div></div>`;
}

/** Actualiza el monitor en el lugar. Si cambió la cantidad de filas, lo repinta entero. */
function pintarMonitor() {
	const caja = document.getElementById("mmon");
	if (!caja || !memFoto) return;
	const f = memFoto;
	const [nombre, clase] = ESTADO_MEMORIA[f.presion] ?? ESTADO_MEMORIA.normal;
	const barra = document.getElementById("mmon-barra");
	barra.className = `mbarra ${clase}`;
	barra.setAttribute("aria-valuenow", String(f.usada ?? 0));
	barra.firstElementChild.style.transform = `scaleX(${(f.usada ? Math.min(1, f.usada / f.total) : 0).toFixed(3)})`;
	document.getElementById("mmon-usada").textContent = f.usada ? gb(f.usada) : "—";
	const estado = document.getElementById("mmon-estado");
	estado.className = `mestado ${clase}`;
	estado.lastChild.textContent = nombre;
	document.getElementById("mmon-agentes").textContent = `Agentes: ${mb((f.lista ?? []).reduce((t, a) => t + a.bytes, 0))}`;
	document.getElementById("mmon-swap").textContent = f.swap > 0.05 * 1024 ** 3 ? `Además, ${gb(f.swap)} pasaron al disco (swap): la compu ya está corta de memoria.` : "Sin usar el disco como memoria (swap).";
	const lista = document.getElementById("mmon-lista");
	const nueva = filasMemoria(f);
	const ids = [...lista.querySelectorAll("[data-mem-agente]")].map(n => n.dataset.memAgente).join();
	const plantilla = document.createElement("div");
	plantilla.innerHTML = nueva;
	const nuevosIds = [...plantilla.querySelectorAll("[data-mem-agente]")].map(n => n.dataset.memAgente).join();
	if (ids !== nuevosIds) return void (lista.innerHTML = nueva);
	for (const fila of plantilla.querySelectorAll("[data-mem-agente]")) {
		const vieja = lista.querySelector(`[data-mem-agente="${fila.dataset.memAgente}"]`);
		vieja.querySelector(".mpista i").style.transform = fila.querySelector(".mpista i").style.transform;
		vieja.querySelector(".mval").textContent = fila.querySelector(".mval").textContent;
	}
}

let memReloj = null;
async function medirMemoria() {
	const abierto = view.type === "ajustes" && (view.section ?? "general") === "general";
	if (!abierto) {
		clearInterval(memReloj);
		memReloj = null;
		return;
	}
	const r = await api("/memoria").catch(() => null);
	if (!r?.ok) return;
	const primera = !memFoto;
	memFoto = await r.json();
	if (primera || !document.getElementById("mmon")) {
		lastBody = "";
		renderBody();
	} else pintarMonitor();
}
function arrancarMonitor() {
	if (memReloj) return;
	void medirMemoria();
	memReloj = setInterval(() => void medirMemoria(), 2000);
}

// Cuántos agentes trabajan a la vez: lo recomendado por la RAM, lo que eligió el dueño y si la memoria está frenando.
function agentesALaVezHtml() {
	const m = state.memoria;
	if (!m) return "";
	const ahora = `Ahora: ${m.despiertos} ${m.despiertos === 1 ? "despierto" : "despiertos"}${m.enFila ? ` y ${m.enFila} en fila` : ""}.`;
	const freno = m.frenado ? ` La memoria de la compu ${m.presion === "critica" ? "está al límite" : "todavía no se liberó"}: por ahora trabajan ${m.tope} a la vez.` : m.presion === "critica" ? " La memoria de la compu está al límite: si sigue así, se duerme a uno quieto." : "";
	const sub = `Tu compu tiene ${m.gb} GB de memoria: recomendamos ${m.recomendado}. ${ahora}${freno}`;
	const opciones = [`<option value="" ${m.elegido === null ? "selected" : ""}>Recomendado (${m.recomendado})</option>`, ...Array.from({ length: 11 }, (_, i) => i + 2).map(n => `<option value="${n}" ${m.elegido === n ? "selected" : ""}>${n}${n > m.recomendado ? " · más de lo recomendado" : ""}</option>`)];
	return row("Agentes a la vez", sub, `<select id="agentes-a-la-vez" aria-label="Agentes a la vez">${opciones.join("")}</select>`);
}
document.addEventListener("change", async e => {
	if (e.target.id !== "agentes-a-la-vez") return;
	await api("/settings/agentes", { method: "POST", body: JSON.stringify({ cantidad: e.target.value ? Number(e.target.value) : null }) });
	await loadState();
	lastBody = "";
	renderBody();
});

function generalHtml() {
	const update = state.update;
	const z = loadZoom();
	const o = state.settings?.owner ?? {};
	return `<section class="ajcard">${pilotoHtml()}</section><section class="ajcard"><h3 class="clabel">Vos y tu empresa</h3><div class="sform two nob"><label>Tu nombre<input id="owner-name" value="${esc(o.name)}" autocomplete="off"></label><label>Tu empresa<input id="owner-company" value="${esc(o.company)}" autocomplete="off"></label><div class="wide"><button class="b p" data-owner-save>Guardar</button></div></div></section><section class="ajcard"><h3 class="clabel">Esta compu</h3>` + row("Tamaño de texto", "", `<div class="seg">${ZOOMS.map(n => `<button class="${n === z ? "on" : ""}" data-zoom="${n}">${n}%</button>`).join("")}</div>`) + row("Apariencia", "", `<div class="seg">${[["light", "Claro"], ["dark", "Oscuro"], ["system", "Sistema"]].map(([k, l]) => `<button class="${k === themePref ? "on" : ""}" data-theme-pick="${k}">${l}</button>`).join("")}</div>`) + row("Avisos del sistema", "Muestra en los chats lo que Leverage le avisa a cada agente.", `<button class="sw ${noticesOn ? "on" : ""}" role="switch" aria-checked="${noticesOn}" aria-label="Avisos del sistema" data-notices><i></i></button>`) + row("Sonidos", "Cuando un agente despierta, termina o te pide algo.", `<button class="sw ${soundsOn ? "on" : ""}" role="switch" aria-checked="${soundsOn}" aria-label="Sonidos" data-sounds><i></i></button>`) + agentesALaVezHtml() + monitorMemoriaHtml() + `</section><section class="ajcard"><h3 class="clabel">Versión</h3>` + row("Versión", versionTexto(update), update ? `<button class="b go" data-update ${updating && !faseActualizacion().reintentar ? "disabled" : ""}>${!updating ? "Actualizar" : faseActualizacion().reintentar ? "Reintentar" : "Actualizando…"}</button>` : `<span class="vbus"><span class="muted">${esc(state.settings?.version)}</span><button class="b" data-update-buscar ${buscando ? "disabled" : ""}>${buscando ? "Buscando…" : "Buscar ahora"}</button></span>`) + row("Onboarding", "Volvé a cargar los datos de tu negocio.", `<button class="b" data-onb-redo>Repetir</button>`) + `</section>${usoDeHoyHtml()}`;
}

/** En General: cuánto les queda a las cuentas que usan tus agentes. El detalle con costos sigue en Uso. */
function usoDeHoyHtml() {
	const u = extra.usage;
	if (!u) return "";
	const cuentas = (u.accounts ?? []).filter(a => a.limits?.length);
	if (!cuentas.length) return "";
	return `<section class="ajcard"><h3 class="clabel">Uso de hoy</h3><p class="muted">Los límites de las cuentas que usan tus agentes.</p><div class="accts">${cuentas.map(a => `<div class="acct"><div class="ah"><span class="tile">${a.provider === "anthropic" ? CLAUDE_MARK : ic("user-round")}</span><span><b>${esc(a.email || a.provider)}</b><small>${a.provider === "anthropic" ? "Claude" : esc(a.provider)}</small></span></div>${a.limits.map(limitRow).join("")}</div>`).join("")}</div><button class="tbmas" data-view="uso">Ver el detalle y los costos</button></section>`;
}

const POPULAR = [
	["metaads", "Meta Ads", "Subir y medir anuncios"],
	["gmail", "Gmail", "Leer y responder mails"],
	["googlecalendar", "Google Calendar", "Ver y crear reuniones"],
	["googledrive", "Google Drive", "Buscar y guardar archivos"],
	["googlesheets", "Google Sheets", "Leer y cargar planillas"],
	["googledocs", "Google Docs", "Leer y escribir documentos"],
	["slack", "Slack", "Leer canales y mandar mensajes"],
	["notion", "Notion", "Leer y escribir páginas"],
	["stripe", "Stripe", "Ver cobros y clientes"],
	["hubspot", "HubSpot", "Contactos y oportunidades"],
	["calendly", "Calendly", "Ver reservas"],
	["zoom", "Zoom", "Reuniones y grabaciones"],
	["fathom", "Fathom", "Transcripciones de llamadas"],
	["typeform", "Typeform", "Leer respuestas"],
	["googleads", "Google Ads", "Campañas y resultados"],
	["airtable", "Airtable", "Leer y cargar bases"],
	["miro", "Miro", "Leer y armar tableros"],
	["whatsapp", "WhatsApp", "Leer y mandar mensajes"],
	["linkedin", "LinkedIn", "Perfil y publicaciones"],
];

/** Los logos de las apps de siempre vienen con Leverage; el resto los sirve Composio. */
const LOCAL_LOGOS = new Set([...POPULAR.map(p => p[0]), "instagram", "openai", "elevenlabs", "apify", "composio", "zernio", "fal", "groq", "entregas", "meta", "classroom"]);
LOCAL_LOGOS.add("youtube");
LOCAL_LOGOS.add("vercel");
const logo = slug => `<span class="clogo"><img src="${LOCAL_LOGOS.has(slug) ? `/ui/apps/${esc(slug)}.svg` : `https://logos.composio.dev/api/${esc(slug)}`}" alt="" onerror="this.style.visibility='hidden'"></span>`;

const appName = slug => POPULAR.find(p => p[0] === slug)?.[1] ?? nombre(slug);

/** Lo que contestó la conexión al fallar, dicho para el dueño. */
const igProblema = p => (!p ? "" : /payment method/i.test(p) && /more than \d+ accounts/i.test(p) ? "Zernio pide una tarjeta para conectar más de 2 cuentas. Cargala en zernio.com, en Billing, y volvé a tocar Conectar." : p);

function connectedRows(c) {
	const ig = state.instagram ?? {};
	const rows = [];
	if (ig.connected) {
		const read = ig.lastSync ? ` · leído ${hora(ig.lastSync)}` : "";
		rows.push(`<div class="crow">${logo("instagram")}<span class="ct"><b>Instagram</b><small>@${esc(ig.username)} · ${ig.piezas} piezas${read}</small>${ig.problem ? `<small>${esc(igProblema(ig.problem))}</small>` : ""}</span><button class="lnk" data-ig-sync>Leer ahora</button><button class="lnk" data-ig-off>Desconectar</button></div>`);
	}
	for (const a of c?.composio.accounts ?? []) rows.push(`<div class="crow">${logo(a.app)}<span class="ct"><b>${esc(appName(a.app))}</b><small>Conectada</small></span><button class="lnk" data-acct-off="${esc(a.id)}">Desconectar</button></div>`);
	for (const m of c?.mcp ?? []) rows.push(`<div class="crow"><span class="clogo">${ic("plug")}</span><span class="ct"><b>${esc(m.name)}</b><small>${esc(m.url)}</small></span><button class="lnk" data-mcp-del="${m.id}">Sacar</button></div>`);
	return rows.join("");
}

function appTile(slug, name, note, ready) {
	const action = ready ? `<a class="pillb" href="${scoped(`/connect/app/${esc(slug)}`)}">Conectar</a>` : `<button class="pillb" data-section="claves">Conectar</button>`;
	const guia = GUIAS[slug] ? `<button class="pillb ghost" data-guia="${esc(slug)}">Cómo</button>` : "";
	return `<div class="ctile">${logo(slug)}<span class="ct"><b>${esc(name)}</b>${note ? `<small>${esc(note)}</small>` : ""}</span>${guia}${action}</div>`;
}

/** Las conexiones que no son un clic: el paso a paso, los links y el video, adentro de la app para cada growth y cada cliente. */
const GUIAS = {
	metaads: {
		titulo: "Conectar Meta Ads",
		para: "Para que el Trafficker lea tus campañas y las arme en pausa. Lo hacés una sola vez, a mano, y tarda unos 10 minutos.",
		video: "guias/meta-ads.mp4",
		pasos: [
			{ t: "Creá un usuario del sistema", d: "En la configuración de tu negocio de Meta: Usuarios → Usuarios del sistema → Agregar. Nombre «Leverage», rol Administrador.", link: ["Abrir usuarios del sistema", "https://business.facebook.com/settings/system-users"] },
			{ t: "Dale acceso a lo que va a usar", d: "Con ese usuario elegido → Asignar activos: la cuenta publicitaria (control total), la página de Facebook, la cuenta de Instagram y el píxel." },
			{ t: "Si no tenés una app de Meta, creala", d: "Al generar el token Meta te pide una app. Si no aparece ninguna: Crear app, tipo Business, conectada a tu negocio.", link: ["Crear una app", "https://developers.facebook.com/apps/creation/"] },
			{ t: "Generá el token", d: "En el usuario del sistema → Generar token nuevo. Elegí la app, vencimiento «Nunca» y marcá estos permisos:", permisos: ["ads_management", "ads_read", "business_management", "pages_show_list", "pages_read_engagement", "pages_manage_ads", "instagram_basic"] },
			{ t: "Pegalo en Leverage", d: "Tocá Conectar en Meta Ads y pegá el token donde dice Access Token. Meta lo muestra una sola vez: guardalo en un lugar seguro." },
		],
		cuidado: "El token da control total sobre la cuenta publicitaria. Va solo en la ventana de conexión: nunca en el chat de un agente ni por mensaje. Los agentes no entran a Meta por el navegador, todo pasa por esta conexión, y nada se prende sin tu OK.",
	},
};

let guiaVideo = {};
async function abrirGuia(slug) {
	const g = GUIAS[slug];
	if (!g) return;
	document.querySelector(".guia")?.remove();
	if (g.video && guiaVideo[slug] === undefined) guiaVideo[slug] = await fetch(`/ui/${g.video}`, { headers: { range: "bytes=0-0" } }).then(r => r.ok).catch(() => false);
	const capa = document.createElement("div");
	capa.className = "guia";
	capa.innerHTML = `<div class="guia-hoja" role="dialog" aria-modal="true" aria-label="${esc(g.titulo)}">
		<div class="guia-top"><b>${esc(g.titulo)}</b><button class="guia-x" data-guia-cerrar aria-label="Cerrar">${ic("x")}</button></div>
		<p class="guia-para">${esc(g.para)}</p>
		${guiaVideo[slug] ? `<video class="guia-video" src="/ui/${esc(g.video)}" controls preload="metadata" playsinline></video>` : ""}
		<ol class="guia-pasos">${g.pasos.map(p => `<li><b>${esc(p.t)}</b><span>${esc(p.d)}</span>${p.permisos ? `<span class="guia-perm"><code>${p.permisos.map(esc).join("</code><code>")}</code><button class="pillb ghost" data-guia-copiar="${esc(p.permisos.join(", "))}">Copiar</button></span>` : ""}${p.link ? `<a class="guia-link" href="${esc(p.link[1])}" target="_blank" rel="noreferrer">${esc(p.link[0])} ${ic("arrow-up-right")}</a>` : ""}</li>`).join("")}</ol>
		<div class="soft-note calm">${esc(g.cuidado)}</div>
	</div>`;
	document.body.append(capa);
	capa.querySelector(".guia-x")?.focus();
}

document.addEventListener("click", e => {
	const abrir = e.target.closest("[data-guia]");
	if (abrir) return void abrirGuia(abrir.dataset.guia);
	const copiar = e.target.closest("[data-guia-copiar]");
	if (copiar) {
		navigator.clipboard?.writeText(copiar.dataset.guiaCopiar).then(() => (copiar.textContent = "Copiado"), () => {});
		return;
	}
	if (e.target.closest("[data-guia-cerrar]") || e.target.classList?.contains("guia")) document.querySelector(".guia")?.remove();
});
document.addEventListener("keydown", e => {
	if (e.key === "Escape") document.querySelector(".guia")?.remove();
});

function conexionesHtml() {
	const c = extra.connections;
	const ig = state.instagram ?? {};
	const ready = Boolean(c?.composio.hasKey);
	const have = new Set(c?.composio.accounts.map(a => a.app));
	const connected = connectedRows(c);
	const found = extra.catalog;
	const tiles = found
		? found.map(t => appTile(t.slug, t.name, t.oneClick ? t.description.slice(0, 60) : "Pide una app propia", ready)).join("") || `<div class="muted">No encontré esa app.</div>`
		: POPULAR.filter(([slug]) => !have.has(slug)).map(([slug, name, note]) => appTile(slug, name, note, ready)).join("");
	const instagram = !ig.connected && !found ? `<div class="ctile">${logo("instagram")}<span class="ct"><b>Instagram</b><small>Historias, reels y métricas</small>${ig.problem ? `<small class="igprob">${esc(igProblema(ig.problem))}</small>` : ""}</span>${ig.hasKey ? `<a class="pillb" href="${scoped("/connect/instagram")}">Conectar</a>` : `<button class="pillb" data-section="claves">Conectar</button>`}</div>` : "";
	const mcp = mcpOpen
		? `<div class="sform card"><label>Nombre<input id="mcp-name" autocomplete="off"></label><label>Dirección<input id="mcp-url" placeholder="https://" autocomplete="off"></label><label>Token, si pide<input id="mcp-token" type="password" autocomplete="off"></label><div class="fa"><button class="b p" data-mcp-add>Agregar</button><button class="b ghost" data-mcp-open>Cancelar</button></div>${mcpError ? `<div class="who">${esc(mcpError)}</div>` : ""}</div>`
		: `<button class="lnk more" data-mcp-open>${ic("plus")}Agregar un servidor MCP</button>`;
	return `<div class="conn">${c?.problem ? `<div class="soft-note">No se pudo conectar ${esc(c.problem)}</div>` : ""}${claudeHtml()}
	${connected ? `<h3 class="clabel">Conectadas</h3><div class="clist">${connected}</div>` : ""}
	<div class="chead"><h3 class="clabel">Disponibles</h3><div class="csearch">${ic("search")}<input id="app-q" placeholder="Buscar apps" autocomplete="off" aria-label="Buscar apps"></div></div>
	${c && !ready ? `<div class="soft-note">Para activar estas apps falta la clave de Composio. <button data-section="claves">Ir a Tus claves</button></div>` : ""}${connError ? `<div class="who">${esc(connError)}</div>` : ""}
	<div class="cgrid">${instagram}${tiles}</div>${mcp}</div>`;
}

function horarioHtml() {
	const off = state.settings?.offTime ?? { on: true, from: 23, to: 8 };
	const hours = sel => Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === sel ? "selected" : ""}>${String(h).padStart(2, "0")}:00</option>`).join("");
	return `${row("Horario libre", "Sin rutinas ni avisos en estas horas. Tus mensajes se responden igual.", `<button class="sw ${off.on ? "on" : ""}" role="switch" aria-checked="${off.on}" aria-label="Horario libre" data-off-toggle><i></i></button>`)}
	${row("Desde", "", `<select id="off-from" aria-label="Desde">${hours(off.from)}</select>`)}${row("Hasta", "", `<select id="off-to" aria-label="Hasta">${hours(off.to)}</select>`)}
	<div class="sfoot"><button class="b p" data-off-save>Guardar</button></div>`;
}

/** La edición para clientes (la que pide licencia) no tiene classroom: es del equipo de ATV. */
const sinClassroom = () => state.conJeremy === false;
/** Claves que son del equipo de ATV: un cliente no las tiene ni las necesita. */
const SOLO_EQUIPO = new Set(["classroom", "entregas"]);

const PROVEEDORES = [
	["openai", "OpenAI", "Imágenes y transcripción", "api.openai.com", "bearer", ""],
	["elevenlabs", "ElevenLabs", "Voz", "api.elevenlabs.io", "header", "xi-api-key"],
	["apify", "Apify", "Instagram de otras cuentas", "api.apify.com", "bearer", ""],
	["fal", "fal", "Clips de video generados", "queue.fal.run", "key", ""],
	["groq", "Groq", "Transcripción en compus sin whisper", "api.groq.com", "bearer", ""],
	["meta", "Meta", "Subir anuncios, siempre en pausa", "graph.facebook.com", "bearer", ""],
	["entregas", "Entregas", "Links para clientes", "sops.atvos.io", "bearer", ""],
	["classroom", "Classroom", "Piloto y llamadas de Fathom", "classroom.atvos.io", "header", "X-Agente-Key"],
];

const NIVELES = { lectura: "Solo ver", con_ok: "Ver y cambiar con mi OK", total: "Control total" };
const NOTA_NIVEL = { lectura: "Los agentes leen, pero no cambian nada.", con_ok: "Los agentes leen solos. Cada cambio te pide OK.", total: "Los agentes cambian lo que haga falta sin preguntar. Borrar siempre pide OK, y cada cambio queda anotado." };

/** Conectar un sistema propio: lo mismo en el onboarding y en Conexiones. */
function softwareHtml() {
	const lista = extra.connections?.software ?? [];
	const cambios = extra.connections?.softwareCambios ?? [];
	const filas = lista.map(s => `<div class="crow"><span class="clogo">${ic("plug")}</span><span class="ct"><b>${esc(s.nombre)}</b><small>${esc(s.url)} · ${s.rutas_conocidas ? `${s.rutas_conocidas} rutas` : "sin documentación"}</small></span><select aria-label="Permiso de ${esc(s.nombre)}" data-sw-permiso="${esc(s.id)}">${Object.entries(NIVELES).map(([k, v]) => `<option value="${k}" ${k === s.permiso ? "selected" : ""}>${v}</option>`).join("")}</select><button class="ic" aria-label="Quitar ${esc(s.nombre)}" data-sw-quitar="${esc(s.id)}">${ic("trash-2")}</button></div>`).join("");
	const registro = cambios.length ? `<div class="muted swlog">${cambios.slice(0, 5).map(c => `${esc(c.agente)}: ${esc(c.metodo)} ${esc(c.ruta)} en ${esc(c.software)}`).join("<br>")}</div>` : "";
	return `<h3 class="clabel">Tu software</h3>${filas ? `<div class="clist">${filas}</div>` : ""}${registro}
	<div class="sform card two"><label>Nombre<input id="sw-nombre" placeholder="Mi CRM" autocomplete="off"></label><label>Dirección<input id="sw-url" placeholder="https://app.tuempresa.com" autocomplete="off"></label><label>Clave<input id="sw-clave" type="password" autocomplete="off"></label><label>Campo de la clave (opcional)<input id="sw-campo" placeholder="X-Api-Key" autocomplete="off"></label><label>Qué hace<input id="sw-desc" placeholder="Clases, clientes y mensajes" autocomplete="off"></label><label>Hasta dónde llega Leverage<select id="sw-permiso">${Object.entries(NIVELES).map(([k, v]) => `<option value="${k}" ${k === "con_ok" ? "selected" : ""}>${v}</option>`).join("")}</select></label><div class="fa"><button class="b p" data-sw-conectar>Conectar</button></div><small class="muted">${Object.values(NOTA_NIVEL).join(" ")}</small></div>`;
}

/** Los dos triggers de Jeremy en utari: la lectura del alta y las revisiones del chat. */
const JEREMYS = { jeremy: ["Jeremy", "Lectura del negocio"], "jeremy-rev": ["Jeremy revisiones", "Revisa con @jeremy"] };

function jeremyCard(k, id = "jeremy") {
	const [nombre, sub] = JEREMYS[id];
	const cambiando = changingKeys.has(id);
	// Con la licencia de equipo, la base pone Jeremy: no hay que cargar nada.
	if (!k && !cambiando && (state.incluidas ?? []).includes(id === "jeremy" ? "jeremy" : "jeremyRevision"))
		return `<div class="card req"><div class="ch"><span class="clogo">${ic("activity")}</span><span class="ct"><b>${nombre}</b><small>${sub}</small></span><span class="sp"></span><span class="state">Incluida por ATV</span></div><div class="body2 keybox"><div class="maskrow"><span class="muted">Ya está lista: la pone tu licencia de equipo.</span></div></div></div>`;
	const cuerpo = !k || cambiando
		? `<input id="${id}-url" placeholder="URL del trigger" autocomplete="off"><input type="password" id="${id}-clave" placeholder="Secreto del trigger" autocomplete="off"><div class="fa"><button class="b p" data-jeremy-save="${id}">Guardar</button>${k ? `<button class="b ghost" data-key-edit="${id}">Cancelar</button>` : ""}</div>`
		: `<div class="maskrow"><code>${esc(k.masked)}</code><button class="b" data-key-edit="${id}">Cambiar</button></div>`;
	return `<div class="card req"><div class="ch"><span class="clogo">${ic("activity")}</span><span class="ct"><b>${nombre}</b><small>${sub}</small></span><span class="sp"></span><span class="state ${k ? "" : "pend"}">${k ? "Guardada" : "Falta"}</span></div><div class="body2 keybox">${cuerpo}${provError[id] ? `<div class="who">${esc(provError[id])}</div>` : ""}</div></div>`;
}

/** La licencia de equipo: se pega una vez y Leverage queda con la base del equipo y todas las claves de ATV, sin verlas. */
function licenciaEquipoCard() {
	const l = state.licenciaEquipo;
	if (!l) return "";
	const n = l.servicios?.length ?? 0;
	const cuerpo = l.activa
		? `<div class="maskrow"><span class="muted">${n ? `ATV pone ${n} ${n === 1 ? "clave" : "claves"}: no tenés que cargar nada.` : "Activa. ATV todavía no cargó claves para el equipo."}${l.sinConexion ? " Sin conexión con ATV: vale lo último que dijo." : ""}</span><button class="b ghost" data-lic-equipo-off>Quitar</button></div>`
		: `<input id="lic-equipo-codigo" placeholder="LEV-XXXX-XXXX" autocomplete="off" spellcheck="false"><div class="fa"><button class="b p" data-lic-equipo>Activar</button></div><small class="muted">${!l.falta && l.motivo === "cortada" ? "Tu licencia de equipo está cortada. Pedile a ATV que la reactive." : "Pegá el código que te pasó ATV. Trae la base del equipo, Jeremy, Entregas, Classroom y las herramientas pagas."}</small>`;
	return `<div class="card req"><div class="ch"><span class="clogo">${ic("key-round")}</span><span class="ct"><b>Licencia de equipo</b><small>Todas las claves de ATV, sin pasarlas a mano</small></span><span class="sp"></span><span class="state ${l.activa ? "" : "pend"}">${l.activa ? "Activa" : "Falta"}</span></div><div class="body2 keybox">${cuerpo}${provError.licEquipo ? `<div class="who">${esc(provError.licEquipo)}</div>` : ""}</div></div>`;
}
document.addEventListener("click", async e => {
	const t = e.target.closest("[data-lic-equipo],[data-lic-equipo-off]");
	if (!t) return;
	t.disabled = true;
	const res = "licEquipoOff" in t.dataset
		? await api("/licencia-equipo", { method: "DELETE" })
		: await api("/licencia-equipo", { method: "POST", body: JSON.stringify({ codigo: document.getElementById("lic-equipo-codigo")?.value.trim() ?? "" }) });
	provError.licEquipo = res.ok ? "" : ((await res.json().catch(() => ({}))).error ?? "No se pudo activar.");
	await loadExtra();
	await loadState();
	lastBody = "";
	renderBody();
});

// La base del equipo: el Instagram de ATV (automatizaciones, embudo, llamadas, calificaciones) igual para todos.
/** La cuenta de Vercel donde se publican las landings. Se carga acá, pero el token va directo a la base de ATV. */
let vcError = "";
function vercelCard() {
	const h = extra.connections?.hosting;
	if (!h) return "";
	const editando = !h.conectada || changingKeys.has("vc-token");
	const campo = editando
		? `<input type="password" id="vc-token" placeholder="Pegá el token de Vercel" autocomplete="off"><input id="vc-equipo" placeholder="Team ID (empieza con team_)" autocomplete="off" spellcheck="false" value="${esc(h.equipo ?? "")}"><div class="fa"><button class="b p" data-vc-save>Guardar</button>${h.conectada ? `<button class="b ghost" data-key-edit="vc-token">Cancelar</button>` : ""}</div>`
		: `<div class="maskrow"><code>••••••••${esc(h.termina ?? "")}${h.equipo ? ` · ${esc(h.equipo)}` : ""}</code><button class="b" data-key-edit="vc-token">Cambiar</button></div>`;
	return `<div class="card req"><div class="ch">${logo("vercel")}<span class="ct"><b>Vercel</b><small>Landings · se guarda en el servidor de ATV</small></span><span class="sp"></span><span class="state ${h.conectada ? "" : "pend"}">${h.conectada ? "Conectada" : "Falta"}</span></div><div class="body2 keybox">${campo}${vcError ? `<div class="who">${esc(vcError)}</div>` : ""}</div></div>`;
}

function equipoCard() {
	const e = extra.connections?.equipo;
	const cambiando = changingKeys.has("equipo");
	if (e?.licencia && !cambiando)
		return `<div class="card req"><div class="ch"><span class="clogo">${ic("users")}</span><span class="ct"><b>Base del equipo</b><small>Automatizaciones y embudo de setting compartidos</small></span><span class="sp"></span><span class="state">Conectada</span></div><div class="body2 keybox"><div class="maskrow"><span class="muted">Entra con tu licencia de equipo.</span></div></div></div>`;
	const cuerpo = !e || cambiando
		? `<input id="equipo-url" placeholder="https://leverage.atvos.io/equipo" value="${esc(e?.url ?? "")}" autocomplete="off"><input type="password" id="equipo-clave" placeholder="Tu clave del equipo" autocomplete="off"><label class="chk"><input type="checkbox" id="equipo-califica" ${e?.califica ? "checked" : ""}>El Setter de esta Mac califica a la gente nueva</label><div class="fa"><button class="b p" data-equipo-save>Guardar</button>${e ? `<button class="b ghost" data-key-edit="equipo">Cancelar</button>` : ""}</div>`
		: `<div class="maskrow"><code>${esc(e.mascara)}</code><button class="b" data-key-edit="equipo">Cambiar</button><button class="b ghost" data-equipo-off>Sacar</button></div><small class="muted">${esc(e.url)}${e.califica ? " · esta Mac califica" : ""}</small>`;
	return `<div class="card req"><div class="ch"><span class="clogo">${ic("users")}</span><span class="ct"><b>Base del equipo</b><small>Automatizaciones y embudo de setting compartidos</small></span><span class="sp"></span><span class="state ${e ? "" : "pend"}">${e ? "Conectada" : "Falta"}</span></div><div class="body2 keybox">${cuerpo}${provError.equipo ? `<div class="who">${esc(provError.equipo)}</div>` : ""}</div></div>`;
}
document.addEventListener("click", async e => {
	const t = e.target.closest("[data-equipo-save],[data-equipo-off]");
	if (!t) return;
	t.disabled = true;
	const res = "equipoOff" in t.dataset
		? await api("/connections/equipo", { method: "DELETE" })
		: await api("/connections/equipo", { method: "POST", body: JSON.stringify({ url: document.getElementById("equipo-url").value.trim(), clave: document.getElementById("equipo-clave").value.trim(), califica: document.getElementById("equipo-califica").checked }) });
	provError.equipo = res.ok ? "" : (await res.json().catch(() => ({}))).error ?? "No se pudo guardar";
	if (res.ok) changingKeys.delete("equipo");
	await loadExtra();
	await loadState();
	lastBody = "";
	renderBody();
});

// "Entrar con el classroom": Leverage queda con la clave personal de quien entra y sabe quién es.
let conectandoClassroom = false;
function classroomCard() {
	const p = extra.connections?.classroom;
	const cuerpo = p
		? `<div class="maskrow"><span>Conectado como <b>${esc(p.nombre)}</b>${p.area ? ` · ${esc(p.area)}` : ""}</span><button class="b ghost" data-classroom-off>Desconectar</button></div><small class="muted">Tus pendientes, tu voz y tu nombre en lo que editás salen de tu cuenta.</small>`
		: `<div class="fa"><button class="b p" data-classroom-entrar ${conectandoClassroom ? "disabled" : ""}>${conectandoClassroom ? "Esperando que aceptes en el classroom…" : "Entrar con el classroom"}</button></div><small class="muted">Se abre el classroom: aceptás y Leverage queda con tu cuenta.</small>`;
	return `<div class="card req"><div class="ch">${logo("classroom")}<span class="ct"><b>Classroom</b><small>Tu cuenta del equipo</small></span><span class="sp"></span><span class="state ${p ? "" : "pend"}">${p ? "Conectada" : "Falta"}</span></div><div class="body2 keybox">${cuerpo}${provError.classroomLogin ? `<div class="who">${esc(provError.classroomLogin)}</div>` : ""}</div></div>`;
}
document.addEventListener("click", async e => {
	const t = e.target.closest("[data-classroom-entrar],[data-classroom-off]");
	if (!t) return;
	t.disabled = true;
	provError.classroomLogin = "";
	if ("classroomOff" in t.dataset) {
		const r = await api("/classroom/conexion", { method: "DELETE" });
		if (!r.ok) provError.classroomLogin = "No se pudo desconectar. Probá de nuevo.";
	} else {
		const r = await api("/classroom/conectar", { method: "POST" });
		const d = await r.json().catch(() => ({}));
		if (!r.ok || !d.url) provError.classroomLogin = "No se pudo abrir el classroom. Probá de nuevo.";
		else {
			window.open(d.url, "_blank");
			conectandoClassroom = true;
			lastBody = "";
			renderBody();
			// Se mira cada 3 segundos si ya volvió, durante 15 minutos (lo que vale el pedido).
			for (let vuelta = 0; vuelta < 300 && conectandoClassroom; vuelta++) {
				await new Promise(x => setTimeout(x, 3000));
				await loadExtra();
				// Desde Ajustes se ve en connections; desde la vista Classroom, en que el classroom ya responde.
				if (extra.connections?.classroom || (view.type === "classroom" && extra.classroom?.conectado)) break;
			}
			conectandoClassroom = false;
		}
	}
	await loadExtra();
	await loadState();
	lastBody = "";
	renderBody();
});

function clavesHtml() {
	const saved = extra.connections?.keys ?? [];
	const mine = saved.filter(k => !PROVEEDORES.some(p => p[1] === k.name) && !k.name.startsWith("software-") && !Object.values(JEREMYS).some(([n]) => n === k.name));
	const card = (title, sub, masked, id, save, error, marca) => {
		// En la edición para clientes, OpenAI, Groq, Apify y Composio vienen con la clave de ATV: no hay que cargar nada.
		const deAtv = !masked && (state.incluidas ?? []).includes(marca) && !changingKeys.has(id);
		if (deAtv) return `<div class="card req"><div class="ch">${logo(marca)}<span class="ct"><b>${title}</b><small>${sub}</small></span><span class="sp"></span><span class="state">Incluida por ATV</span></div><div class="body2 keybox"><div class="maskrow"><span class="muted">Ya está lista: la pone ATV, no tenés que cargar nada.</span><button class="b ghost" data-key-edit="${id}">Usar la mía</button></div></div></div>`;
		const field = !masked || changingKeys.has(id)
			? `<input type="password" id="${id}" placeholder="Pegá la clave de ${title}" autocomplete="off"><div class="fa"><button class="b p" ${save}>Guardar</button>${masked ? `<button class="b ghost" data-key-edit="${id}">Cancelar</button>` : ""}</div>`
			: `<div class="maskrow"><code>${esc(masked)}</code><button class="b" data-key-edit="${id}">Cambiar</button></div>`;
		return `<div class="card req"><div class="ch">${logo(marca)}<span class="ct"><b>${title}</b><small>${sub}</small></span><span class="sp"></span><span class="state ${masked ? "" : "pend"}">${masked ? "Guardada" : "Falta"}</span></div><div class="body2 keybox">${field}${error ? `<div class="who">${esc(error)}</div>` : ""}</div></div>`;
	};
	const own = `<h3 class="clabel">Claves propias</h3>${mine.length ? `<div class="clist">${mine.map(k => `<div class="crow"><span class="clogo">${ic("key-round")}</span><span class="ct"><b>${esc(k.name)}</b><small>${esc(k.host)} · ${esc(k.masked)}</small></span><button class="lnk" data-key-del="${k.id}">Sacar</button></div>`).join("")}</div>` : ""}
	${ownOpen ? `<div class="sform card two"><label>Nombre<input id="key-name" placeholder="hotmart" autocomplete="off"></label><label>Dominio de la API<input id="key-host" placeholder="api.ejemplo.com" autocomplete="off"></label><label>Cómo se manda<select id="key-type"><option value="bearer">Bearer</option><option value="header">Encabezado</option><option value="query">En la dirección</option><option value="basic">Usuario:clave</option></select></label><label>Campo, si es encabezado o dirección<input id="key-field" autocomplete="off"></label><label class="wide">Clave<input id="key-value" type="password" autocomplete="off"></label><div class="fa wide"><button class="b p" data-key-add>Guardar</button><button class="b ghost" data-own-open>Cancelar</button></div>${ownError ? `<div class="who wide">${esc(ownError)}</div>` : ""}</div>` : `<button class="lnk more" data-own-open>${ic("plus")}Agregar una clave propia</button>`}`;
	if (carpeta) return `<div class="conn"><div class="soft-note calm">Las herramientas pagas usan las claves de tu empresa y el gasto se anota en este cliente.</div>${softwareHtml()}${own}</div>`;
	return `<div class="conn"><div class="keys">${sinClassroom() ? "" : `${licenciaEquipoCard()}${classroomCard()}${equipoCard()}`}${vercelCard()}${card("Composio", "Gmail, Calendar, Slack, Stripe y más", extra.connections?.composio.masked, "cp-key", "data-cp-save", cpError, "composio")}${card("Zernio", "Instagram", state.instagram?.keyMask, "ig-key", "data-ig-save", keyError, "zernio")}${PROVEEDORES.filter(([id]) => !(SOLO_EQUIPO.has(id) && sinClassroom()) && !(id === "classroom" && extra.connections?.classroom)).map(([id, name, sub]) => card(name, sub, saved.find(k => k.name === name)?.masked, `prov-${id}`, `data-prov-save="${id}"`, provError[id], id)).join("")}${state.conJeremy === false ? "" : `${jeremyCard(saved.find(k => k.name === "Jeremy"))}${jeremyCard(saved.find(k => k.name === "Jeremy revisiones"), "jeremy-rev")}`}</div>
	${softwareHtml()}${own}</div>`;
}

function gastoHtml() {
	const g = extra.gasto;
	if (!g) return `<div class="muted">Cargando…</div>`;
	const usado = g.cupo ? Math.min(100, Math.round((g.gastado / g.cupo) * 100)) : 100;
	const usd = n => `US$ ${n.toFixed(2)}`;
	const lista = rows => rows.map(r => row(esc(r.nombre), "", `<span class="muted">${usd(r.usd)}</span>`)).join("");
	const ultimos = g.ultimos.map(u => `<tr><td>${hora(u.at)}</td><td>${esc(u.agente)}</td><td>${esc(u.servicio)}<br><small class="muted">${esc(u.detalle)}</small></td><td>${usd(u.usd)}</td></tr>`).join("");
	return `<div class="gasto"><div class="gnum"><b>${usd(g.gastado)}</b><span class="muted">de ${usd(g.cupo)} este mes</span></div><div class="bar"><i class="${usado >= 100 ? "hot" : usado >= 80 ? "warm" : ""}" style="width:${usado}%"></i></div>
	<div class="sform"><label>Cupo mensual en dólares<input id="gasto-cupo" type="number" min="0" step="5" value="${g.cupo}"></label><div class="fa"><button class="b p" data-cupo-save>Guardar</button></div></div></div>
	${g.porServicio.length ? `<h3 class="clabel">Por herramienta</h3>${lista(g.porServicio)}<h3 class="clabel">Por agente</h3>${lista(g.porAgente)}<h3 class="clabel">Últimos usos</h3><div class="kt" style="margin:0;max-width:none"><table><thead><tr><th>Cuándo</th><th>Quién</th><th>Qué</th><th>Costo</th></tr></thead><tbody>${ultimos}</tbody></table></div>` : `<div class="muted spad">Todavía no se gastó nada este mes.</div>`}`;
}

function aprendidoHtml() {
	const list = extra.aprendido;
	if (!list) return `<div class="muted">Cargando…</div>`;
	const skills = extra.skills ?? [];
	const skill = s => `<div class="dec"><div class="dech"><b>${esc(s.nombre.replace(/^propia-/, ""))}</b>${s.origen === "base" ? `<span class="pill idle">Base</span>` : ""}<span class="sp"></span>${s.origen === "base" ? "" : `<button class="lnk" data-skill-base="${esc(s.nombre)}">${skillBase === s.nombre ? "Confirmar: la ven todos tus clientes" : "Pasar a la base"}</button> <button class="lnk" data-skill-del="${esc(s.nombre)}">Sacar</button>`}</div><p>${esc(s.descripcion)}</p><details><summary class="muted">Ver pasos</summary><div class="docview">${md(s.pasos)}</div></details></div>`;
	const seccionSkills = `<h3 class="clabel">Skills</h3>${skills.length ? `<div class="decs">${skills.map(skill).join("")}</div>` : `<div class="muted spad">Todavía no hay. Pedile a un agente que guarde un trabajo como skill.</div>`}<h3 class="clabel">Reglas y decisiones</h3>`;
	if (!list.length) return `${seccionSkills}<div class="muted spad">Todavía nada. Lo que corrijas en la Bandeja o en el chat aparece acá.</div>`;
	const item = d => `<div class="dec"><div class="dech"><b>${esc(d.id)}</b><span class="pill ${d.origen === "dueno" ? "" : "idle"}">${d.origen === "dueno" ? "Tuya" : esc(d.agente)}</span><small class="muted">${esc(d.tema)} · ${hora(d.at)}</small><span class="sp"></span><button class="lnk" data-dec-del="${esc(d.id)}">Sacar</button></div><p>${esc(d.regla || d.eleccion)}</p><small class="muted">${esc(d.situacion)}</small></div>`;
	return `${seccionSkills}<div class="decs">${list.map(item).join("")}</div>`;
}

function claudeHtml() {
	const accounts = extra.connections?.claude ?? [];
	const l = state.claudeLogin ?? { state: "idle" };
	const rows = accounts.map(a => `<div class="crow"><span class="clogo">${CLAUDE_MARK}</span><span class="ct"><b>${esc(a.email || "Claude")}</b><small>${a.limits.filter(x => !x.label.includes("Fable")).map(x => `${esc(x.label)}: ${x.used} %`).join(" · ")}</small></span></div>`).join("");
	const flow = {
		idle: "",
		waiting: `<div class="soft-note calm">Autorizá la cuenta en el navegador que se abrió.${l.url ? ` <a href="${esc(l.url)}" target="_blank" rel="noreferrer">Abrirlo de nuevo</a>` : ""} <button data-claude-cancel>Cancelar</button></div>`,
		done: l.repetida ? `<div class="soft-note">Esa cuenta ya estaba conectada (${esc(l.who)}): la página de Claude usó la sesión que tenías abierta en el navegador. Para sumar otra, entrá a claude.ai con la otra cuenta, o cerrá sesión ahí, y tocá Agregar cuenta de nuevo.</div>` : `<div class="soft-note calm">Listo, sumaste ${esc(l.who)}. Cuando una cuenta se quede sin cupo, tus agentes pasan a la otra. <button data-agents-restart>Reiniciar agentes</button></div>`,
		failed: `<div class="soft-note">${esc(l.error)}</div>`,
	}[l.state];
	const empty = !accounts.length && !state.login ? `<div class="soft-note">Falta iniciar sesión con una cuenta de Claude.</div>` : "";
	return `<div class="chead"><h3 class="clabel">Cuentas de Claude</h3>${l.state === "waiting" ? "" : `<button class="pillb" data-claude-add>Agregar cuenta</button>`}</div>${state.outOfQuota ? `<div class="soft-note">Tus cuentas se quedaron sin cupo. Agregá otra para que tu equipo siga trabajando.</div>` : ""}${empty}${flow}${rows ? `<div class="clist">${rows}</div>` : ""}`;
}

function cuentasHtml() {
	return `<div class="conn">${claudeHtml()}</div>`;
}

function objetivoHtml() {
	const o = (carpeta ? state.carpeta?.onboarding : state.settings?.onboarding)?.objetivo;
	const j = state.jeremy ?? {};
	const pedir = j.conectado ? `<button class="b ghost" data-jeremy-pedir ${j.estado === "esperando" ? "disabled" : ""}>${j.estado === "esperando" ? "Esperando a Jeremy…" : "Pedir lectura a Jeremy"}</button>` : "";
	return `<div class="onb sobj">${objetivoForm(o)}<div class="ofoot">${pedir}<span class="sp"></span><button class="b go" data-obj-guardar>Guardar</button></div></div>${j.lectura ? `<section class="ojeremy"><h3>Lectura de Jeremy</h3>${md(j.lectura)}</section>` : ""}`;
}

function clientesHtml() {
	const lista = state.clientes ?? [];
	if (!lista.length) return `<div class="muted">Todavía no hay clientes.</div>`;
	return lista.map(c => row(esc(c.nombre), `${c.agentes ?? 0} agentes · ${c.pendientes} pendientes`, `<button class="b danger" data-cliente-borrar="${esc(c.id)}">Borrar</button>`)).join("");
}

function noContactarHtml() {
	const list = state.settings?.blocked ?? [];
	return `${list.length ? list.map(b => row(esc(b.name), esc(b.ids), `<button class="b ghost" data-block-del="${b.id}">Sacar</button>`)).join("") : `<div class="muted spad">Nadie todavía.</div>`}
	<div class="sform"><label>Nombre<input id="block-name" autocomplete="off"></label><label>Dónde se lo encuentra<input id="block-ids" placeholder="Mail, teléfono o usuario" autocomplete="off"></label><div><button class="b p" data-block-add>Agregar</button></div></div>`;
}

const SECTION_DESC = {
	clientes: "Los clientes de esta cuenta.",
	objetivo: "La meta de cash y la cuenta hacia atrás. Los agentes trabajan con esto.",
	general: "Cómo se ve Leverage en esta Mac.",
	conexiones: "Lo que tus agentes pueden leer y usar.",
	pixel: "Qué le cuentan tus landings a Meta. Las campañas de conversión usan solo este píxel, y solo si pasó la prueba.",
	horario: "Las horas en que tu equipo no te interrumpe.",
	claves: "Se guardan en esta Mac y no se vuelven a mostrar.",
	gasto: "Lo que gastan tus agentes en herramientas pagas. Al llegar al cupo, se frenan.",
	aprendido: "Tus correcciones y las decisiones del equipo. Los agentes las buscan antes de decidir.",
	cuentas: "Con qué cuenta trabajan tus agentes.",
	"no-contactar": "Tus agentes nunca le escriben a estas personas.",
	importar: "Traé lo que ya armaste en Claude Code y Codex.",
	telefono: "Usá Leverage desde el celular, por tu red privada.",
	navegador: "Un Chrome aparte donde iniciás sesión una vez. Los agentes que elijas leen en otro Chrome sin tus sesiones; este lo usan solo cuando aprobás su pedido en la Bandeja, por unos minutos.",
	computer: "Agentes que pueden pedir manejar las apps de esta compu. Recién la manejan cuando aprobás su pedido en la Bandeja, por unos minutos, y se apaga sola.",
	soporte: "Contá qué pasa. Primero te responde la IA; si no lo resuelve, te pasamos con ATV por WhatsApp.",
};

const SECTION_HTML = { general: generalHtml, conexiones: conexionesHtml, pixel: pixelHtml, clientes: clientesHtml, objetivo: objetivoHtml, horario: horarioHtml, claves: clavesHtml, gasto: gastoHtml, aprendido: aprendidoHtml, cuentas: cuentasHtml, importar: importarHtml, telefono: telefonoHtml, navegador: navegadorHtml, computer: computerHtml, "no-contactar": noContactarHtml, soporte: soporteHtml };

// Soporte: la IA de la base de ATV responde con la guía de Leverage; si no lo resuelve, WhatsApp de ATV.
const SOPORTE_WHATSAPP = "5493804219551";
const soporte = { mensajes: [], esperando: false, derivar: false, resuelto: false, diagnostico: null };

function soporteWhatsapp() {
	const d = soporte.diagnostico ?? {};
	const quien = [state.settings?.owner?.name, state.settings?.owner?.company].filter(Boolean).join(", ");
	const pregunta = soporte.mensajes.filter(m => m.de === "persona").map(m => m.texto).join(" / ");
	const texto = [`Hola, soy ${quien || "un cliente"} y uso ATV Leverage ${d.version ?? state.version ?? ""}${d.sistema ? ` (${d.sistema.startsWith("darwin") ? "Mac" : d.sistema.startsWith("win") ? "Windows" : d.sistema})` : ""}.`, pregunta ? `Me pasa esto: ${pregunta}` : "", "La IA de soporte no lo resolvió."].filter(Boolean).join("\n");
	return `https://wa.me/${SOPORTE_WHATSAPP}?text=${encodeURIComponent(texto.slice(0, 1500))}`;
}

function soporteHtml() {
	const burbujas = soporte.mensajes.map(m => `<div class="sop-msg ${m.de}">${m.de === "soporte" ? inline(m.texto).replace(/\n/g, "<br>") : esc(m.texto)}</div>`).join("");
	const ultima = soporte.mensajes.at(-1);
	const pregunta = ultima?.de === "soporte" && !soporte.esperando && !soporte.resuelto;
	const acciones = soporte.resuelto
		? `<div class="sop-acc"><span>Listo. Si vuelve a pasar, escribí acá.</span></div>`
		: pregunta
			? `<div class="sop-acc"><span>¿Se resolvió?</span><button class="b" data-sop-ok>Sí</button><a class="b ${soporte.derivar ? "p" : ""}" href="${esc(soporteWhatsapp())}" target="_blank" rel="noreferrer">No, escribir a ATV por WhatsApp</a></div>`
			: "";
	const chat = soporte.mensajes.length ? `<div class="sop-chat">${burbujas}${soporte.esperando ? `<div class="sop-msg soporte pensando">Pensando…</div>` : ""}</div>` : "";
	return `<section class="ajcard sop">${chat}${acciones}<form class="sop-caja" id="sop-form"><textarea id="sop-input" rows="3" placeholder="${soporte.mensajes.length ? "Contá algo más…" : "Ej: mis agentes no responden"}"></textarea><button class="b p" type="submit" ${soporte.esperando ? "disabled" : ""}>Enviar</button></form></section>`;
}

async function preguntarSoporte(texto) {
	soporte.mensajes.push({ de: "persona", texto });
	soporte.esperando = true;
	soporte.resuelto = false;
	renderBody();
	const r = await api("/soporte", { method: "POST", body: JSON.stringify({ mensajes: soporte.mensajes }) }).catch(() => null);
	const d = r ? await r.json().catch(() => ({})) : {};
	soporte.esperando = false;
	soporte.diagnostico = d.diagnostico ?? soporte.diagnostico;
	soporte.derivar = d.derivar !== false;
	soporte.mensajes.push({ de: "soporte", texto: d.respuesta || "Ahora no puedo responder. Escribile a ATV y lo vemos." });
	renderBody();
}

document.addEventListener("submit", e => {
	if (e.target.id !== "sop-form") return;
	e.preventDefault();
	const input = document.getElementById("sop-input");
	const texto = input.value.trim();
	if (!texto || soporte.esperando) return;
	input.value = "";
	void preguntarSoporte(texto);
});
document.addEventListener("keydown", e => {
	if (e.target.id !== "sop-input" || e.key !== "Enter" || e.shiftKey) return;
	e.preventDefault();
	e.target.form.requestSubmit();
});
document.addEventListener("click", e => {
	if (!e.target.closest("[data-sop-ok]")) return;
	soporte.resuelto = true;
	renderBody();
});

const licFecha = d => new Date(`${d}T12:00:00`).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });

// La licencia de esta Mac (edición para clientes): pedir el código, avisar antes de vencer y frenar si está cortada.
let licLocalMsg = "";
let licLocalEnviando = false;
const LIC_AVISO_KEY = "licencia-aviso-visto";
/** En la del equipo: una instalación nueva pide la licencia de equipo al abrir, igual que la de clientes pide la suya. */
function licenciaEquipoCapa() {
	const l = state.licenciaEquipo;
	let capa = document.getElementById("licencia-capa");
	if (!l?.pedir) return void (state.licencia ? null : capa?.remove());
	if (!capa) {
		capa = document.createElement("div");
		capa.id = "licencia-capa";
		document.body.append(capa);
	}
	const html = `<div class="lic-caja"><b>Activá tu Leverage del equipo</b><p>Pegá el código de licencia de equipo que te pasó ATV. Se hace una sola vez y trae todo: la base del equipo, Jeremy, Entregas, Classroom y las herramientas pagas.</p><input id="lic-equipo-capa" placeholder="LEV-XXXX-XXXX" autocomplete="off" spellcheck="false"><button class="b p" data-lic-equipo-capa ${licLocalEnviando ? "disabled" : ""}>${licLocalEnviando ? "Activando…" : "Activar"}</button>${licLocalMsg ? `<div class="lic-error">${esc(licLocalMsg)}</div>` : ""}</div>`;
	const viejo = document.getElementById("lic-equipo-capa")?.value;
	if (capa.dataset.html !== html) {
		capa.innerHTML = html;
		capa.dataset.html = html;
		const input = document.getElementById("lic-equipo-capa");
		if (input && viejo) input.value = viejo;
	}
}
document.addEventListener("click", async e => {
	if (!e.target.closest("[data-lic-equipo-capa]") || licLocalEnviando) return;
	licLocalEnviando = true;
	licLocalMsg = "";
	licenciaEquipoCapa();
	const r = await api("/licencia-equipo", { method: "POST", body: JSON.stringify({ codigo: document.getElementById("lic-equipo-capa")?.value ?? "" }) });
	const d = await r.json().catch(() => ({}));
	licLocalEnviando = false;
	if (!r.ok) licLocalMsg = d.error ?? "No se pudo activar.";
	else state.licenciaEquipo = d;
	licenciaEquipoCapa();
	if (r.ok) {
		await loadState();
		lastBody = "";
		renderBody();
	}
});

function licenciaLocal() {
	if (!state.licencia) return licenciaEquipoCapa();
	const l = state.licencia;
	let capa = document.getElementById("licencia-capa");
	let aviso = document.getElementById("licencia-aviso");
	if (!l || (l.activa && !l.aviso)) {
		capa?.remove();
		aviso?.remove();
		return;
	}
	if (l.activa) {
		capa?.remove();
		let visto = "";
		try {
			visto = localStorage.getItem(LIC_AVISO_KEY) ?? "";
		} catch {}
		if (visto === new Date().toDateString()) return aviso?.remove();
		if (!aviso) {
			aviso = document.createElement("div");
			aviso.id = "licencia-aviso";
			aviso.setAttribute("role", "status");
			document.body.append(aviso);
		}
		const html = `<div><b>${l.dias === 0 ? "Tu licencia vence hoy." : `Tu licencia vence el ${licFecha(l.hasta)}.`}</b><p>Para seguir sin cortes, escribile a ATV.</p></div><button class="b ghost" data-lic-aviso-ok>Entendido</button>`;
		if (aviso.dataset.html !== html) ((aviso.innerHTML = html), (aviso.dataset.html = html));
		return;
	}
	aviso?.remove();
	if (!capa) {
		capa = document.createElement("div");
		capa.id = "licencia-capa";
		document.body.append(capa);
	}
	const html = l.falta
		? `<div class="lic-caja"><b>Activá tu Leverage</b><p>Pegá el código de licencia que te mandó ATV. Se hace una sola vez.</p><input id="lic-local-codigo" placeholder="LEV-XXXX-XXXX" autocomplete="off" spellcheck="false"><button class="b p" data-lic-activar ${licLocalEnviando ? "disabled" : ""}>${licLocalEnviando ? "Activando…" : "Activar"}</button>${licLocalMsg ? `<small class="lic-error">${esc(licLocalMsg)}</small>` : ""}</div>`
		: `<div class="lic-caja"><b>${l.motivo === "vencida" ? "Tu licencia venció" : "Tu licencia está pausada"}</b><p>Tus agentes están frenados. Tus datos, chats y entregas siguen guardados en esta Mac.</p><p>Escribile a ATV para reactivarla. Si ya lo hiciste, tocá revisar.</p><button class="b p" data-lic-revisar ${licLocalEnviando ? "disabled" : ""}>${licLocalEnviando ? "Revisando…" : "Revisar de nuevo"}</button>${l.sinConexion ? `<small class="lic-error">No se pudo hablar con ATV. Revisá internet.</small>` : ""}</div>`;
	const viejo = document.getElementById("lic-local-codigo")?.value;
	if (capa.dataset.html !== html) {
		capa.innerHTML = html;
		capa.dataset.html = html;
		const input = document.getElementById("lic-local-codigo");
		if (input && viejo) input.value = viejo;
	}
}
document.addEventListener("click", async e => {
	if (e.target.closest("[data-lic-aviso-ok]")) {
		try {
			localStorage.setItem(LIC_AVISO_KEY, new Date().toDateString());
		} catch {}
		return document.getElementById("licencia-aviso")?.remove();
	}
	const activar = e.target.closest("[data-lic-activar]");
	const revisar = e.target.closest("[data-lic-revisar]");
	if ((!activar && !revisar) || licLocalEnviando) return;
	licLocalEnviando = true;
	licLocalMsg = "";
	licenciaLocal();
	const r = activar ? await api("/licencia/activar", { method: "POST", body: JSON.stringify({ codigo: document.getElementById("lic-local-codigo")?.value ?? "" }) }) : await api("/licencia/revisar", { method: "POST" });
	const d = await r.json().catch(() => ({}));
	licLocalEnviando = false;
	if (!r.ok) licLocalMsg = d.error ?? "No se pudo activar.";
	else state.licencia = d;
	licenciaLocal();
});


const paqueteHtml = () => `<div class="paq"><h3 class="clabel">Paquete del equipo</h3><p>Para arrancar con lo mismo que tiene otra compu de ATV: sus clientes, el equipo de agentes y lo aprendido. Lo que había acá pasa a la papelera de Leverage. Tus claves, tu cuenta de Claude y las conexiones no viajan: se cargan de nuevo.</p><div class="paq-form"><input type="file" id="paq-archivo" accept=".leverage"><input type="password" id="paq-clave" placeholder="Contraseña del paquete" autocomplete="off"><button class="b p" data-paq-importar>Importar</button></div>${paqueteEstado ? `<div class="paq-estado">${esc(paqueteEstado)}</div>` : ""}</div>`;
let paqueteEstado = "";

document.addEventListener("click", async e => {
	if (!e.target.closest("[data-paq-importar]")) return;
	const archivo = document.getElementById("paq-archivo")?.files?.[0];
	const clave = document.getElementById("paq-clave")?.value ?? "";
	if (!archivo || !clave) {
		paqueteEstado = "Elegí el archivo y escribí la contraseña.";
		lastBody = "";
		return renderBody();
	}
	const reemplazar = (state.clientes ?? []).length > 0;
	if (reemplazar && !confirm("Esta compu ya tiene clientes. Van a ir a la papelera y quedan los del paquete. ¿Seguís?")) return;
	paqueteEstado = `Subiendo ${Math.round(archivo.size / 1048576)} MB y descifrando… no cierres Leverage.`;
	lastBody = "";
	renderBody();
	const res = await api("/paquete/importar", { method: "POST", body: archivo, headers: { "content-type": "application/octet-stream", "x-clave-paquete": clave, ...(reemplazar ? { "x-reemplazar": "si" } : {}) } }).catch(() => null);
	const r = await res?.json().catch(() => ({}));
	paqueteEstado = res?.ok ? `Listo: ${r.clientes.length} ${r.clientes.length === 1 ? "cliente" : "clientes"} y ${r.agentes} agentes. Leverage se reinicia solo en unos segundos.` : (r?.error ?? "No se pudo importar.");
	lastBody = "";
	renderBody();
	if (res?.ok) setTimeout(() => location.reload(), 9000);
});

function importarHtml() {
	const f = extra.imports;
	if (!f) return paqueteHtml() + `<div class="muted">Buscando…</div>`;
	const rows = f.skills.map(s => row(esc(s.name), `Skill de ${s.from}`, s.imported ? `<span class="muted">Importada</span>` : "")).join("");
	const notes = f.instructions.map(i => row(`Instrucciones de ${i.from}`, "Tus agentes las leen cuando trabajan para vos.", "")).join("");
	if (!rows && !notes) return paqueteHtml() + `<div class="muted">No encontramos nada más para traer en esta compu.</div>`;
	return `${paqueteHtml()}${rows}${notes}<div class="sfoot"><button class="b p" data-import>Importar todo</button></div>`;
}

function loadQr() {
	if (window.qrcode) return Promise.resolve();
	return new Promise((done, fail) => {
		const tag = document.createElement("script");
		tag.src = "/ui/vendor/qrcode-1.4.4.js";
		tag.onload = done;
		tag.onerror = fail;
		document.head.append(tag);
	});
}

function telefonoHtml() {
	const host = state.privateHost;
	if (!host) {
		return `${row("1. Instalá Tailscale", "En esta compu y en tu teléfono, con la misma cuenta.", "")}${row("2. Activá la red privada", phoneError ? esc(phoneError) : "Solo entran los equipos de tu red, nunca internet.", `<button class="b go" data-phone-on>Activar</button>`)}`;
	}
	const url = `https://${host}/entrar?clave=${encodeURIComponent(TOKEN)}`;
	if (window.qrcode) {
		const qr = window.qrcode(0, "M");
		qr.addData(url);
		qr.make();
		return `<div class="pair"><div class="qr">${qr.createSvgTag({ cellSize: 5, margin: 0, scalable: true })}</div><div><b>Escaneá con la cámara del teléfono</b><p>Se abre Leverage. En el iPhone, tocá Compartir y Agregar a inicio para dejarla como app.</p><small>https://${esc(host)}</small></div></div>`;
	}
	void loadQr().then(() => {
		lastBody = "";
		renderBody();
	});
	return `<div class="muted">Preparando…</div>`;
}

const todos = cual => row("Todos los agentes", "Cada uno se reinicia para tomar el permiso.", `<button class="b" data-acceso-todos="${cual}">Activar para todos</button>`);

function computerHtml() {
	const warn = `<div class="soft-note">Dáselo solo a quien lo necesite. Un agente con este permiso maneja tu compu como vos, así que puede salir de su encierro. La primera vez, tu sistema va a pedir permiso de Accesibilidad y Grabación de pantalla: eso lo das vos.</div>`;
	const agents = state.agents.map(a => row(esc(a.name), "", `<button class="sw ${a.computer ? "on" : ""}" role="switch" aria-checked="${Boolean(a.computer)}" aria-label="Computer use para ${esc(a.name)}" data-computer-agent="${a.id}"><i></i></button>`)).join("");
	return `${warn}<h3 class="clabel">Quién puede usarlo</h3>${todos("computer")}${agents}`;
}

const PASO_AVISO = [
	["agendo", "Agendó", "Pegalo como webhook en tu agenda (Calendly, GHL, Cal.com) o en Zapier."],
	["pago", "Pagó", "Pegalo como webhook en tu pasarela (Stripe, Hotmart, Whop, Mercado Pago) o en Zapier."],
];

function pixelHtml() {
	const p = extra.pixel;
	if (!p) return `<div class="muted">Mirando…</div>`;
	const e = p.estado;
	const err = pixelError ? `<div class="soft-note">${esc(pixelError)}</div>` : "";
	if (!p.pixeles.length && !e) return `${err}${row("Falta conectar Meta", esc(p.error_meta || "No encontré píxeles en tus cuentas de Meta."), `<button class="b ghost" data-section="conexiones">Conexiones</button>`)}`;
	const dias = x => (x.dias_sin_disparar === null ? "nuevo, todavía no disparó" : x.dias_sin_disparar === 0 ? "disparó hoy" : x.dias_sin_disparar === 1 ? "disparó ayer" : `último disparo hace ${x.dias_sin_disparar} días`);
	const opciones = p.pixeles.map(x => `<option value="${esc(x.id)}" ${x.id === e?.pixel ? "selected" : ""} ${x.muerto ? "disabled" : ""}>${esc(x.nombre)} · ${esc(x.cuenta)} · ${x.muerto ? `muerto, ${dias(x)}` : dias(x)}</option>`).join("");
	const token = e?.token_cargado ? `Cargado, termina en ${esc(e.termina)}. Pegá otro solo si lo querés cambiar.` : "En Meta: Administrador de eventos, tu píxel, Configuración, API de conversiones, Generar token de acceso.";
	const elegir = `<div class="sform"><label>1. El píxel<select id="px-pixel"><option value="">Elegí uno</option>${opciones}</select></label><label>2. El token de la API de conversiones<input id="px-token" type="password" autocomplete="off" placeholder="${e?.token_cargado ? "••••" + esc(e.termina) : "Pegá el token"}"><small>${token}</small></label><div><button class="b p" data-px-guardar>Guardar</button></div></div>`;
	if (!e) return `${err}${elegir}`;
	const probado = e.probado ? `Llegó a Meta el ${esc(new Date(e.probado).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}.` : "Las campañas de conversión no se pueden armar hasta que pase.";
	const probar = `<h3 class="clabel">3. La prueba</h3>${row(e.probado ? "Probado" : "Sin probar", probado, `<input id="px-codigo" placeholder="Código TEST (opcional)" autocomplete="off" style="width:170px"><button class="b go" data-px-probar ${e.token_cargado ? "" : "disabled"}>Probar</button>`)}<small class="muted">Con el código de Probar eventos de Meta, el evento de prueba se ve ahí y no cuenta para nada.</small>`;
	const linea = `<h3 class="clabel">Landings que no publica Leverage</h3>${row("La línea del píxel", "Pegala en el encabezado de tu página (GHL, WordPress, Webflow, Shopify). Las que publica Leverage ya la llevan.", copyButton("px-linea", p.linea))}`;
	const avisos = `<h3 class="clabel">Agenda y pagos</h3>${PASO_AVISO.map(([k, t, s]) => row(t, s, copyButton(`px-${k}`, e.avisos?.[k] ?? ""))).join("")}`;
	return `${err}${elegir}${probar}${linea}${avisos}`;
}

function navegadorHtml() {
	const n = extra.navegador;
	if (!n) return `<div class="muted">Mirando…</div>`;
	if (!n.chrome) return row("Falta Chrome", "Instalalo en esta compu para usar el Navegador.", "");
	const open = row(n.abierto ? "Abierto" : "Cerrado", browserError ? esc(browserError) : "Iniciá sesión ahí en lo que quieras que usen tus agentes. Las sesiones quedan en esta compu.", n.abierto ? "" : `<button class="b go" data-browser-open>Abrir</button>`);
	const agents = state.agents.map(a => row(esc(a.name), "", `<button class="sw ${a.browser ? "on" : ""}" role="switch" aria-checked="${Boolean(a.browser)}" aria-label="Navegador para ${esc(a.name)}" data-browser-agent="${a.id}"><i></i></button>`)).join("");
	return `${open}<h3 class="clabel">Quién puede usarlo</h3>${todos("browser")}${agents}`;
}

function ajustesHtml() {
	// Los clientes se manejan desde la cuenta principal: adentro de uno no hay nada que ver.
	const secciones = (carpeta ? SECTIONS.filter(s => s[0] !== "clientes") : SECTIONS);
	const current = secciones.some(s => s[0] === view.section) ? view.section : "general";
	const [, , title] = secciones.find(x => x[0] === current);
	return `<div class="set"><nav class="smenu" aria-label="Configuración"><div class="slabel">Elegí una sección</div><button class="mi" data-view="carpeta">${ic("folder-open")}<span>${carpeta ? "Negocio" : "Embudos"}</span></button>${secciones.map(([id, icon, label]) => `<button class="mi ${id === current ? "on" : ""}" data-section="${id}">${ic(icon)}<span>${label}</span>${id === current ? ic("chevron-right") : ""}</button>`).join("")}</nav><section class="spanel"><h2>${title}</h2><p class="sdesc">${SECTION_DESC[current]}</p>${SECTION_HTML[current]()}</section></div>`;
}

const num = n => (n ?? 0).toLocaleString("es-AR");
const usd = n => `US$ ${(n ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function guideHtml(topic) {
	const g = extra.library?.guides?.find(x => x.topic === topic);
	if (!g) return "";
	return `<div class="guide">${fold(`guide:${topic}`, "Lo que aprendieron tus agentes", `<ul>${g.rules.map(r => `<li>${esc(r)}</li>`).join("")}</ul>${g.source ? `<small>${esc(g.source)}</small>` : ""}`)}</div>`;
}

/** Una captura guardada se abre; una ruta de archivo no le dice nada a nadie. */
function notaDe(m) {
	if (/\.png$/.test(m.note ?? "") && m.note.startsWith("/")) return `<small><button class="linkb" data-file="${esc(m.note)}">Ver vista</button></small>`;
	if (/\.md$/.test(m.note ?? "") && m.note.startsWith("/")) return `<small><button class="linkb" data-file="${esc(m.note.replace(/\.md$/, ".jpg"))}">Ver captura</button></small>`;
	return m.note ? `<small>${esc(m.note)}</small>` : "";
}

function shelfList(kinds) {
	const items = (extra.library?.material ?? []).filter(m => kinds.includes(m.kind));
	if (!items.length) return "";
	return items.map(m => `<div class="lrow"><span>${m.url.startsWith("http") ? `<a href="${esc(m.url)}" target="_blank" rel="noreferrer">${esc(m.title)}</a>` : /\.html$/.test(m.url) ? `<button class="linkb" data-file="${esc(m.url)}">${esc(m.title)}</button>` : esc(m.title)}${notaDe(m)}</span><button class="ic" aria-label="Sacar ${esc(m.title)}" data-lib-del="${m.id}">${ic("trash-2")}</button></div>`).join("");
}

function shelf(title, kinds, topic, missing) {
	const list = shelfList(kinds);
	return `<section class="shelf ${list ? "" : "miss"}"><h3>${title}</h3>${list || `<span>${missing}</span>`}${guideHtml(topic)}</section>`;
}

function formHtml() {
	return `<div class="sform card"><label>Tipo<select id="lib-kind">${[["landing", "Landing"], ["caso", "Caso"], ["vsl", "VSL"], ["canal", "Canal de YouTube"], ["instagram", "Cuenta de Instagram"], ["red", "TikTok u otra red"], ["marca", "Brandbook"], ["secuencia", "Destacadas o historias"], ["video", "Video crudo o editado"], ["otro", "Otro"], ["mercado", "Mercado"]].map(([v, l]) => `<option value="${v}" ${v === (libTab === "mercado" ? "mercado" : "landing") ? "selected" : ""}>${l}</option>`).join("")}</select></label><label>Nombre<input id="lib-title" autocomplete="off"></label><label>Link o ruta<input id="lib-url" autocomplete="off"></label><label>Nota<input id="lib-note" placeholder="Por qué sirve" autocomplete="off"></label><div class="fa"><button class="b p" data-lib-add>Guardar</button><button class="b ghost" data-lib-form>Cancelar</button></div>${libError ? `<div class="who">${esc(libError)}</div>` : ""}</div>`;
}

let libCarpeta = "";

