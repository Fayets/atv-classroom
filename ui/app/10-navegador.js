function webHtml() {
	if (!IN_APP) return `<div class="web"><div class="webbar"><span class="sp"></span><button class="ic" data-dock aria-label="Cerrar">${ic("x")}</button></div><div class="empty"><b>El navegador está en la app</b>Abrí ATV Leverage en tu compu para usarlo.</div></div>`;
	const start = stored("webUrl", "https://www.google.com");
	return `<div class="web"><div class="webbar"><button class="ic" data-web="back" aria-label="Atrás">${ic("chevron-left")}</button><button class="ic" data-web="forward" aria-label="Adelante">${ic("chevron-right")}</button><button class="ic" data-web="reload" aria-label="Recargar">${ic("rotate-cw")}</button><input id="web-url" value="${esc(start)}" autocomplete="off" spellcheck="false" aria-label="Dirección"><button class="ic" data-dock-full data-tip="Agrandar" aria-label="Agrandar">${ic("maximize-2")}</button><button class="ic" data-dock aria-label="Cerrar">${ic("x")}</button></div><webview id="web" src="${esc(start)}" partition="persist:navegador" allowpopups></webview></div>`;
}

// Cada pantalla se busca al abrirla: si a una le falta su archivo, las demás andan igual.
const VIEWS = { tablero: () => tableroHtml(), historial: () => historialHtml(), roadmap: () => roadmapHtml(), juan: () => juanHtml(), tickets: () => ticketsHtml(), onboarding: () => onboardingHtml(), ceo: () => ceoHtml(), bandeja: () => bandejaChatsHtml(), equipo: () => equipoHtml(), ajustes: () => ajustesHtml(), biblioteca: () => bibliotecaConDecisiones(), carpeta: () => carpetaHtml(), rutinas: () => rutinasHtml(), uso: () => usoHtml(), decisiones: () => decisionesHtml(), actividad: () => actividadHtml(), classroom: () => classroomHtml(), dms: () => dmsHtml(), auto: () => autoHtml(), contenido: () => contenidoHtml() };

async function loadExtra() {
	if (view.type === "dms") return void abrirDms();
	if (view.type === "auto") return void abrirAutomatizaciones();
	if (view.type === "contenido") return abrirContenido();
	if (view.type === "ajustes" && (view.section ?? "general") === "general") {
		arrancarMonitor();
		const u = await api("/usage");
		if (u.ok) {
			extra.usage = await u.json();
			renderBody();
		}
	}
	if (view.type === "classroom") {
		// Todo a la vez: la lista de clientes y las consultas no esperan al resumen del piloto.
		if (clsResultados === null && !clsBuscarEn) void buscarClientesCls(stored("clsBuscar", "").trim());
		void cargarConsultas();
		await cargarClassroom();
		return;
	}
	const source = { biblioteca: ["library", "/library"], uso: ["usage", "/usage"], rutinas: ["routines", "/routines"], tablero: ["routines", "/routines"], historial: ["routines", "/routines"], ajustes: ["connections", "/connections"], carpeta: ["embudos", "/embudos"] }[view.type];
	if (!source) return;
	if (view.type === "carpeta") {
		const [d, l, p] = await Promise.all([api("/departments"), api("/library"), carpeta ? api("/perfil/rapido") : null]);
		if (d.ok) extra.areas = await d.json();
		if (l.ok) extra.library = await l.json();
		if (p?.ok) extra.perfilRapido = (await p.json()).lectura;
	}
	if (view.type === "ajustes" && view.section === "pixel") {
		const r = await api("/conversiones");
		if (r.ok) extra.pixel = await r.json();
	}
	if (view.type === "ajustes" && view.section === "navegador") {
		const n = await api("/navegador");
		if (n.ok) extra.navegador = await n.json();
	}
	if (view.type === "ajustes" && view.section === "importar") {
		const scan = await api("/import");
		if (scan.ok) extra.imports = await scan.json();
	}
	if (view.type === "ajustes" && view.section === "gasto") {
		const g = await api("/gasto");
		if (g.ok) extra.gasto = await g.json();
	}
	if (view.type === "ajustes" && view.section === "aprendido") {
		const [a, sk] = await Promise.all([api("/decisiones"), api("/skills")]);
		if (a.ok) extra.aprendido = await a.json();
		if (sk.ok) extra.skills = await sk.json();
	}
	const res = await api(source[1]);
	if (!res.ok) return;
	extra[source[0]] = await res.json();
	renderBody();
}

let lastBody = "";
let chatScrolled = null;
let bodyVista = "";
