// ---------- Ventas · Oportunidades: el centro de operaciones comerciales (estilos .op en atv.css) ----------
// Cada chat de Instagram es una oportunidad de venta: se junta con su contacto (etapa, de dónde vino, notas) y con
// el resultado de su llamada. Arriba, el resumen (que filtra al tocarlo); en el medio, el pipeline por etapa (o una
// lista compacta); a la derecha, el detalle de la oportunidad elegida, donde se cambia la etapa, se marca la llamada,
// se anota y, si hace falta, se mira la charla. Los filtros de siempre (Calificados, Sin leer…) van en un solo botón.
const op = { vista: stored("opVista", "pipeline"), kpi: null, canal: new Set(), filtrosAbiertos: false, verChat: false, nota: "", aviso: "", guardando: false };

const ETAPAS_OP = [
	["nuevo", "Nuevos", "Escribieron y todavía no se habló"],
	["conversando", "Conversando", "Hay charla: se califica"],
	["propuesta", "Propuesta", "Se ofreció la llamada"],
	["llamada", "Llamada", "Agendaron, vinieron o no"],
	["cliente", "Clientes", "Compraron"],
	["perdido", "Descartados", "No siguen"],
];
const PASO_DE_ETAPA = { nuevo: "chat", conversando: "conversacion", propuesta: "pitch", llamada: "agenda", cliente: "cierre", perdido: "perdido" };
const CANAL_OP = { historia: ["Historia", "Respondió una historia"], reel: ["Reel", "Comentó un reel"], anuncio: ["Anuncio", "Vino de un anuncio"], otros: ["Directo", "Escribió directo"] };
const LLAMADA_OP = [["", "Sin llamada"], ["agendo", "Agendó"], ["vino", "Asistió"], ["no_vino", "No asistió"], ["cerro", "Cerró"]];

function etapaOp(paso, llamada) {
	if (paso === "perdido") return "perdido";
	if (llamada === "cerro" || paso === "cierre") return "cliente";
	if (llamada || paso === "agenda" || paso === "show") return "llamada";
	return { chat: "nuevo", conversacion: "conversando", pitch: "propuesta" }[paso] ?? "nuevo";
}

/** Todas las oportunidades, con lo que hace falta para decidir: etapa, canal, llamada, última interacción, próxima acción y si pide atención. */
function oportunidades() {
	const cts = ctos.datos?.contactos ?? [];
	return dms.lista.map(c => {
		const ct = cts.find(x => x.conversacion === c.id || x.usuario === c.usuario);
		const llamada = dms.llamadas[c.id] ?? (ct?.no_vino ? "no_vino" : "");
		const etapa = etapaOp(ct?.paso, llamada);
		const cal = fila(c).calificacion ?? ct?.calificacion;
		const canal = ct?.entradas?.[0]?.origen ?? (c.vino_de_un_anuncio ? "anuncio" : "otros");
		const ultimo = ct?.ultimo ?? { fecha: c.actualizado, de: "lead" };
		const sinLeer = sinLeerDm(c);
		const escribio = ultimo.de === "lead" && !["cliente", "perdido"].includes(etapa);
		const atencion = sinLeer ? "Mensaje sin leer" : llamada === "no_vino" ? "No vino: reagendar" : escribio ? "Espera respuesta" : llamada === "agendo" ? "Confirmar la llamada" : "";
		const accion = {
			nuevo: cal?.veredicto === "pendiente" || !cal ? "Responder y calificar" : "Responder y llevarlo a la charla",
			conversando: cal?.veredicto === "calificado" ? "Ofrecerle la llamada" : cal?.veredicto === "no" ? "Cerrar con amabilidad o descartar" : "Calificar antes de ofrecer",
			propuesta: "Mandar el link para agendar",
			llamada: llamada === "no_vino" ? "Reagendar la llamada" : llamada === "vino" ? "Cerrar la venta o hacer seguimiento" : "Confirmar el día y la hora",
			cliente: "Darle la bienvenida al programa",
			perdido: "Nada por ahora",
		}[etapa];
		return { c, ct, id: c.id, usuario: c.usuario, nombre: c.nombre || c.usuario || "Usuario de Instagram", etapa, llamada, cal, canal, ultimo, sinLeer, atencion, accion };
	});
}

function filtradasOp(lista) {
	const busca = dms.busca.trim().toLowerCase();
	return lista.filter(o => {
		const c = o.c;
		if (busca.length >= 2 && !`${o.nombre} ${o.usuario}`.toLowerCase().includes(busca)) return false;
		if (dms.pestana === "calificados" && o.cal?.veredicto !== "calificado") return false;
		if (dms.pestana === "sin-leer" && !o.sinLeer) return false;
		if (dms.pestana === "solicitudes" && c.solicitud !== true) return false;
		if (dms.pestana === "anuncios" && !c.vino_de_un_anuncio) return false;
		if (op.canal.size && !op.canal.has(o.canal)) return false;
		if (op.kpi === "activas" && ["cliente", "perdido"].includes(o.etapa)) return false;
		if (op.kpi === "seguir" && !o.atencion) return false;
		if (op.kpi === "agendadas" && o.llamada !== "agendo") return false;
		if (op.kpi === "asistieron" && !["vino", "cerro"].includes(o.llamada)) return false;
		if (op.kpi === "ventas" && o.etapa !== "cliente") return false;
		return true;
	});
}

const cuandoOp = iso => (iso ? haceDm(iso) : "—");
const canalOp = o => `<span class="op-canal is-${o.canal}" title="${esc(CANAL_OP[o.canal]?.[1] ?? "")}">${esc(CANAL_OP[o.canal]?.[0] ?? "Directo")}</span>`;
const llamadaOp = o => (o.llamada ? `<span class="op-llam is-${o.llamada}">${ic("clock")}${esc(LLAMADA_OP.find(([v]) => v === o.llamada)?.[1] ?? "")}</span>` : "");
const calOp = o => (o.cal?.veredicto === "calificado" ? `<span class="op-cal si" title="${esc(o.cal.razon ?? "")}">${puntajeTexto(o.cal.puntaje)}</span>` : o.cal?.veredicto === "no" ? `<span class="op-cal" title="${esc(o.cal.razon ?? "")}">No califica</span>` : "");

function tarjetaOp(o) {
	return `<button class="op-tarj ${dms.abierto === o.id ? "on" : ""} ${o.atencion ? "atencion" : ""}" data-op="${esc(o.id)}">
		<span class="op-tarj__cab">${caraDm(o.c, "chica")}<span class="op-tarj__q"><b>${esc(o.nombre)}</b><small>${canalOp(o)}${calOp(o)}</small></span>${o.atencion ? `<i class="op-punto" title="${esc(o.atencion)}"></i>` : ""}</span>
		<span class="op-tarj__acc">${esc(o.accion)}</span>
		<span class="op-tarj__pie">${llamadaOp(o)}<span class="op-hace">${o.ultimo.de === "lead" ? "Escribió" : "Le escribiste"} ${esc(cuandoOp(o.ultimo.fecha))}</span></span>
	</button>`;
}

function resumenOp(todas) {
	const n = f => todas.filter(f).length;
	const ventasN = n(o => o.etapa === "cliente");
	const conv = todas.length ? Math.round((ventasN / todas.length) * 100) : 0;
	const kpis = [
		["activas", n(o => !["cliente", "perdido"].includes(o.etapa)), "Oportunidades activas"],
		["seguir", n(o => o.atencion), "Para seguir hoy", "rojo"],
		["agendadas", n(o => o.llamada === "agendo"), "Llamadas agendadas"],
		["asistieron", n(o => ["vino", "cerro"].includes(o.llamada)), "Asistieron"],
		["ventas", ventasN, "Ventas"],
	];
	return `<div class="op-resumen" role="group" aria-label="Resumen comercial">${kpis.map(([id, v, t, cls = ""]) => `<button class="op-kpi ${cls} ${op.kpi === id ? "on" : ""}" data-op-kpi="${id}" aria-pressed="${op.kpi === id}"><b>${v}</b><small>${t}</small></button>`).join("")}<div class="op-kpi conv" title="Ventas sobre todas las oportunidades"><b>${conv}<i>%</i></b><small>Conversión</small></div></div>`;
}

function filtrosOp() {
	const activos = [...(dms.pestana !== "todos" ? [["pestana", PESTANAS_DM.find(([id]) => id === dms.pestana)?.[1]]] : []), ...[...op.canal].map(c => ["canal:" + c, CANAL_OP[c][0]]), ...(op.kpi ? [["kpi", { activas: "Activas", seguir: "Para seguir hoy", agendadas: "Agendadas", asistieron: "Asistieron", ventas: "Ventas" }[op.kpi]]] : [])];
	const menu = op.filtrosAbiertos ? `<div class="op-menu" role="dialog" aria-label="Filtros">
		<h4>Mostrar</h4>${PESTANAS_DM.map(([id, n]) => `<label><input type="radio" name="op-pest" value="${id}" ${dms.pestana === id ? "checked" : ""} data-op-pestana="${id}">${n}</label>`).join("")}
		<h4>Canal</h4>${Object.entries(CANAL_OP).map(([id, [n]]) => `<label><input type="checkbox" ${op.canal.has(id) ? "checked" : ""} data-op-canal="${id}">${n}</label>`).join("")}
		<div class="op-menu__pie"><button class="lnk" data-op-limpiar>Limpiar filtros</button><button class="b go" data-op-filtros>Listo</button></div>
	</div>` : "";
	return `<div class="op-filtros"><button class="b op-filtros__btn ${activos.length ? "con" : ""}" data-op-filtros aria-expanded="${op.filtrosAbiertos}">${ic("sliders-horizontal")}Filtros${activos.length ? `<span>${activos.length}</span>` : ""}</button>${menu}${activos.map(([k, n]) => `<button class="op-chip" data-op-quitar="${esc(k)}" title="Quitar este filtro">${esc(n)}${ic("x")}</button>`).join("")}${activos.length ? `<button class="lnk" data-op-limpiar>Limpiar</button>` : ""}</div>`;
}

function detalleOp(o) {
	if (!o) return "";
	const c = o.c;
	const chat = dms.chats[c.id];
	const notas = (ctos.notas[o.usuario] ?? []);
	const fechas = o.ct?.fechas ?? {};
	const hitos = [["chat", "Escribió por primera vez"], ["conversacion", "Empezó la charla"], ["pitch", "Se le ofreció la llamada"], ["agenda", "Agendó"], ["show", "Asistió"], ["cierre", "Compró"]];
	const paso = o.ct?.paso;
	const idx = hitos.findIndex(([k]) => k === paso);
	const historial = [
		...hitos.filter(([k], i) => i <= idx && fechas[k]).map(([k, t]) => ({ at: fechas[k], texto: t })),
		...(o.ct?.historial ?? []).map(h => ({ at: h.at, texto: h.texto, tuyo: true })),
		...notas.map(n => ({ at: n.fecha, texto: `${n.rol === "closer" ? "Closer" : "Setter"} · ${n.autor}: ${n.texto}`, nota: n.id })),
	].sort((a, b) => b.at.localeCompare(a.at));
	const v = ventanaDm(chat?.mensajes);
	const charla = op.verChat
		? `<div class="op-charla"><div class="dmmsgs" id="dm-msgs">${chat?.cargando || !chat ? `<div class="dmvacio">Cargando la charla…</div>` : chat.error ? `<div class="dmvacio">${esc(chat.error)}</div>` : burbujasDm(chat.mensajes ?? []) + pendientesDm(c.id, chat.mensajes ?? [])}</div>${chat?.mensajes ? (v.puede ? `<div class="dmescribir"><textarea id="dm-escribir" rows="1" placeholder="Responder por DM…" maxlength="1000">${esc(dms.borrador[c.id] ?? "")}</textarea><button class="dmmandar" data-dm-mandar="${esc(c.id)}">Enviar</button></div>${v.nota ? `<div class="dmnota">${esc(v.nota)}</div>` : ""}` : `<div class="dmnota cerrada">${esc(v.nota)}</div>`) : ""}</div>`
		: "";
	return `<aside class="op-det" aria-label="Oportunidad: ${esc(o.nombre)}">
		<header class="op-det__cab"><button class="ic op-det__x" data-op-cerrar aria-label="Cerrar">${ic("x")}</button>${caraDm(c)}<span><b>${esc(o.nombre)}${tildeDm(fila(c))}</b><small>${[c.usuario ? `@${esc(c.usuario)}` : "", seguidoresDm(fila(c)), relacionDm(fila(c))].filter(Boolean).join(" · ")}</small></span></header>
		<div class="op-det__acc">${c.link ? `<button class="b" data-dm-web="${esc(c.link)}">${ic("instagram")}Abrir en Instagram</button>` : ""}<button class="b" data-dm-revisar="${esc(c.id)}" ${dms.revisando ? "disabled" : ""}>${dms.revisando ? "Pidiendo…" : "Revisar este seteo"}</button></div>
		${op.aviso || dms.aviso ? `<div class="dmaviso">${esc(op.aviso || dms.aviso)}</div>` : ""}
		<section class="op-sig"><small>Siguiente paso</small><b>${esc(o.accion)}</b>${o.atencion ? `<span class="op-sig__ojo">${esc(o.atencion)}</span>` : ""}</section>
		<section class="op-blq"><h4>Etapa</h4><div class="op-etapas">${ETAPAS_OP.filter(([id]) => id !== "perdido").map(([id, n]) => `<button class="${o.etapa === id ? "on" : ""}" data-op-etapa="${id}" ${op.guardando ? "disabled" : ""}>${n}</button>`).join("")}</div>${o.etapa === "perdido" ? `<button class="lnk" data-op-etapa="conversando">Reabrir la oportunidad</button>` : `<button class="lnk op-desc" data-op-etapa="perdido">Descartar</button>`}</section>
		<section class="op-blq"><h4>Llamada</h4><div class="op-llamadas">${LLAMADA_OP.map(([v, n]) => `<button class="${o.llamada === v ? "on" : ""} ${v ? `is-${v}` : ""}" data-op-llamada="${v}" ${op.guardando ? "disabled" : ""}>${n}</button>`).join("")}</div></section>
		<section class="op-blq"><h4>De dónde vino</h4><p class="op-dato">${canalOp(o)} ${esc(CANAL_OP[o.canal]?.[1] ?? "")}${o.ct?.entradas?.[0]?.fecha ? ` · ${diaCto(o.ct.entradas[0].fecha)}` : ""}</p></section>
		<section class="op-blq">${calificacionHtml(fila(c))}</section>
		<section class="op-blq"><h4>Historial</h4><ol class="op-hist">${historial.map(h => `<li class="${h.tuyo ? "tuyo" : ""}"><time>${diaCto(h.at)} ${hora(h.at)}</time><span>${esc(h.texto)}</span>${h.nota ? `<button class="lnk" data-op-borrar="${esc(h.nota)}">Borrar</button>` : ""}</li>`).join("") || `<li><span>Todavía no hay movimientos.</span></li>`}</ol>
			<div class="op-nota"><textarea id="op-nota" rows="2" maxlength="2000" placeholder="Anotar algo de esta persona…">${esc(op.nota)}</textarea><button class="b go" data-op-anotar ${op.guardando ? "disabled" : ""}>Anotar</button></div></section>
		<section class="op-blq"><button class="op-verchat" data-op-chat aria-expanded="${op.verChat}">${ic("instagram")}${op.verChat ? "Ocultar la conversación" : "Ver la conversación"}${ic(op.verChat ? "chevron-up" : "chevron-down")}</button>${charla}</section>
	</aside>`;
}

function oportunidadesHtml() {
	const todas = oportunidades();
	const lista = filtradasOp(todas);
	const abierta = todas.find(o => o.id === dms.abierto);
	if (dms.abierto && !abierta) dms.abierto = null;
	const cargando = !dms.lista.length && dms.cargando;
	const etapasVisibles = ETAPAS_OP.filter(([id]) => id !== "perdido" || lista.some(o => o.etapa === "perdido"));
	const pipeline = `<div class="op-pipe">${etapasVisibles.map(([id, n, sub]) => {
		const suyas = lista.filter(o => o.etapa === id).sort((a, b) => Number(Boolean(b.atencion)) - Number(Boolean(a.atencion)) || (b.ultimo.fecha ?? "").localeCompare(a.ultimo.fecha ?? ""));
		return `<section class="op-col is-${id}"><header><b>${n}</b><span>${suyas.length}</span><small>${sub}</small></header><div class="op-col__lista">${suyas.map(tarjetaOp).join("") || `<p class="op-vacio">Nadie en esta etapa.</p>`}</div></section>`;
	}).join("")}</div>`;
	const filas = `<div class="op-tabla" role="table"><div class="op-fila cab" role="row"><span>Persona</span><span>Etapa</span><span>Llamada</span><span>Última interacción</span><span>Próxima acción</span></div>${lista.map(o => `<button class="op-fila ${dms.abierto === o.id ? "on" : ""}" role="row" data-op="${esc(o.id)}"><span class="op-fila__q">${o.atencion ? `<i class="op-punto" title="${esc(o.atencion)}"></i>` : ""}${caraDm(o.c, "chica")}<b>${esc(o.nombre)}</b>${canalOp(o)}</span><span>${esc(ETAPAS_OP.find(([id]) => id === o.etapa)?.[1] ?? "")}</span><span>${llamadaOp(o) || "—"}</span><span>${esc(cuandoOp(o.ultimo.fecha))}</span><span class="op-fila__acc">${esc(o.accion)}</span></button>`).join("") || `<p class="op-vacio">No hay oportunidades con estos filtros.</p>`}</div>`;
	return `<div class="op ${abierta ? "con-det" : ""}">
		${resumenOp(todas)}
		<div class="op-barra"><label class="dmbusca op-busca">${ic("search")}<input id="dm-busca" type="search" placeholder="Buscar por nombre o @" value="${esc(dms.busca)}" autocomplete="off" spellcheck="false"></label>${filtrosOp()}<span class="sp"></span><span class="op-cuenta">${lista.length} de ${todas.length}</span><div class="op-vista" role="group" aria-label="Vista"><button class="${op.vista === "pipeline" ? "on" : ""}" data-op-vista="pipeline">Pipeline</button><button class="${op.vista === "lista" ? "on" : ""}" data-op-vista="lista">Lista</button></div></div>
		<div class="op-cuerpo">${cargando ? `<p class="op-vacio">Cargando oportunidades…</p>` : dms.error ? `<p class="op-vacio">${esc(dms.error)}</p>` : op.vista === "lista" ? filas : pipeline}${detalleOp(abierta)}</div>
	</div>`;
}

/** Guardar un cambio (etapa o llamada), recargar lo que depende de eso y repintar: el resumen y el pipeline se mueven solos. */
async function guardarOp(pedido, datos) {
	op.guardando = true;
	op.aviso = "";
	renderBody();
	const r = await api(pedido, { method: "POST", body: JSON.stringify(datos) }).catch(() => null);
	const d = r ? await r.json().catch(() => ({})) : {};
	op.guardando = false;
	if (!r?.ok) op.aviso = d.error ?? "No se pudo guardar. Probá de nuevo.";
	await Promise.all([traerLlamadasDm(), cargarContactos()]);
	lastBody = "";
	renderBody();
}

document.addEventListener("click", async e => {
	if (view.type !== "dms" || dms.modo !== "bandeja") return;
	const t = e.target.closest("[data-op],[data-op-kpi],[data-op-vista],[data-op-filtros],[data-op-limpiar],[data-op-quitar],[data-op-cerrar],[data-op-etapa],[data-op-llamada],[data-op-anotar],[data-op-chat],[data-op-borrar]");
	if (!t) {
		if (op.filtrosAbiertos && !e.target.closest(".op-menu")) {
			op.filtrosAbiertos = false;
			renderBody();
		}
		return;
	}
	const d = t.dataset;
	const o = oportunidades().find(x => x.id === dms.abierto);
	if (d.op) {
		dms.abierto = d.op;
		op.verChat = false;
		op.nota = "";
		op.aviso = "";
		dms.aviso = "";
		marcarVistoDm(d.op);
		if (o?.id !== d.op) {
			const nueva = oportunidades().find(x => x.id === d.op);
			if (nueva?.usuario) {
				void traerNotasCto(nueva.usuario).then(() => renderBody());
				void traerCalificacion(nueva.usuario);
			}
		}
		renderBody();
		if (matchMedia("(max-width:1100px)").matches) document.querySelector(".op-det")?.scrollIntoView({ block: "start" });
		return;
	}
	if (d.opKpi) op.kpi = op.kpi === d.opKpi ? null : d.opKpi;
	else if (d.opVista) store("opVista", (op.vista = d.opVista));
	else if ("opFiltros" in d) op.filtrosAbiertos = !op.filtrosAbiertos;
	else if ("opLimpiar" in d) {
		dms.pestana = "todos";
		op.canal.clear();
		op.kpi = null;
		dms.busca = "";
		op.filtrosAbiertos = false;
	} else if (d.opQuitar) {
		if (d.opQuitar === "pestana") dms.pestana = "todos";
		else if (d.opQuitar === "kpi") op.kpi = null;
		else op.canal.delete(d.opQuitar.slice(6));
	} else if ("opCerrar" in d) dms.abierto = null;
	else if (d.opEtapa && o) return void guardarOp("/ig/etapa", { usuario: o.usuario, conversacion: o.id, paso: PASO_DE_ETAPA[d.opEtapa] });
	else if ("opLlamada" in d && o) return void guardarOp(`/ig/llamada/${encodeURIComponent(o.id)}`, { estado: d.opLlamada || null });
	else if ("opAnotar" in d && o) {
		const texto = document.getElementById("op-nota")?.value.trim();
		if (!texto) {
			op.aviso = "Escribí la nota antes de anotarla.";
			return renderBody();
		}
		op.guardando = true;
		const r = await api("/ig/notas", { method: "POST", body: JSON.stringify({ usuario: o.usuario, rol: "setter", texto }) }).catch(() => null);
		op.guardando = false;
		op.nota = r?.ok ? "" : texto;
		op.aviso = r?.ok ? "" : "No se pudo guardar la nota.";
		await Promise.all([traerNotasCto(o.usuario), cargarContactos()]);
	} else if (d.opBorrar && o) {
		if (!confirm("¿Borrás esta nota?")) return;
		const r = await api(`/ig/notas/${encodeURIComponent(d.opBorrar)}`, { method: "DELETE" }).catch(() => null);
		op.aviso = r?.ok ? "" : "No se pudo borrar la nota.";
		await Promise.all([traerNotasCto(o.usuario), cargarContactos()]);
	} else if ("opChat" in d && o) {
		op.verChat = !op.verChat;
		if (op.verChat) void abrirChatDm(o.id);
	}
	lastBody = "";
	renderBody();
});
document.addEventListener("change", e => {
	if (view.type !== "dms" || dms.modo !== "bandeja") return;
	const t = e.target;
	if (t.dataset?.opPestana) {
		dms.pestana = t.dataset.opPestana;
		if (dms.pestana === "calificados") void cargarCalificadosDms();
	} else if (t.dataset?.opCanal) {
		if (t.checked) op.canal.add(t.dataset.opCanal);
		else op.canal.delete(t.dataset.opCanal);
	} else return;
	lastBody = "";
	renderBody();
});
document.addEventListener("input", e => {
	if (e.target.id === "op-nota") op.nota = e.target.value;
});
