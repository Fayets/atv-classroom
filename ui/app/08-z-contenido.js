// ---------- Contenido: cada secuencia de historias y cada reel, con qué es y lo que trajo ----------
// Los chats, pitches, agendas y cierres son los de Ventas. Las etiquetas las pone el Analista y el dueño las corrige.
const ctn = { datos: null, error: "", cargando: false, periodo: "mes", etapa: "", pedido: "", dolor: "", abierto: null, editando: false, guardando: false, aviso: "", pidio: "" };
const CTN_PERIODOS = [["mes", "Este mes"], ["pasado", "Mes pasado"], ["30", "30 días"], ["todo", "Desde el 2/11"]];
const CTN_ETAPAS = ["TOFU", "MOFU", "BOFU"];
const CTN_SIN = "(sin dolor)";

function ctnRango() {
	const hoy = new Date();
	const fin = diaRep(hoy);
	if (ctn.periodo === "mes") return [`${fin.slice(0, 8)}01`, fin];
	if (ctn.periodo === "pasado") {
		const ultimo = new Date(Date.UTC(Number(fin.slice(0, 4)), Number(fin.slice(5, 7)) - 1, 0));
		const d = ultimo.toISOString().slice(0, 10);
		return [`${d.slice(0, 8)}01`, d];
	}
	if (ctn.periodo === "30") return [diaRep(new Date(hoy.getTime() - 29 * 864e5)), fin];
	return ["2026-11-01", fin];
}

async function cargarContenido() {
	if (ctn.cargando) return;
	ctn.cargando = true;
	const de = carpeta;
	const [desde, hasta] = ctnRango();
	const r = await api(`/ig/vista?${new URLSearchParams({ desde, hasta, tz: TZ_LOCAL })}`).catch(() => null);
	const d = r ? await r.json().catch(() => ({})) : {};
	ctn.cargando = false;
	if (de !== carpeta) return;
	if (r?.ok) {
		ctn.datos = d;
		ctn.error = "";
	} else ctn.error = r?.status === 404 ? "La base del equipo todavía no tiene Contenido: hay que actualizarla." : (d.error ?? "No se pudo traer el contenido.");
	if (view.type === "contenido") renderBody();
}

function abrirContenido() {
	void cargarContenido();
	clearInterval(ctn.reloj);
	ctn.reloj = setInterval(() => {
		if (view.type !== "contenido") return clearInterval(ctn.reloj);
		if (!ctn.editando) void cargarContenido();
	}, ctn.pidio ? 30_000 : 300_000);
}

// Siempre lo más nuevo primero: una idea con varias versiones cuenta por la última que salió.
const ctnFecha = x => (x.k === "s" ? x.fecha : x.versiones.reduce((f, v) => (v.fecha > f ? v.fecha : f), x.fecha));
const ctnNuevas = l => [...l].sort((a, b) => ctnFecha(b).localeCompare(ctnFecha(a)));
const ctnTodo = () => ctnNuevas([...(ctn.datos?.secuencias ?? []), ...(ctn.datos?.ideas ?? [])]);
const ctnDolor = x => x.etiqueta?.dolor || CTN_SIN;
const ctnTitulo = x => x.etiqueta?.titulo || (x.k === "s" ? `Secuencia del ${ctnDia(x.fecha)}` : x.versiones[0].gancho);
const ctnDia = iso => new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short" }).replace(".", "");
const ctnHora = iso => new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
const ctnMil = v => (v >= 10_000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1).replace(".", ",")}k` : `${v}`);
const ctnPl = (n, uno, varios) => `${num(n)} ${n === 1 ? uno : varios}`;
const ctnPasa = x => (!ctn.etapa || x.etiqueta?.etapa === ctn.etapa) && (!ctn.dolor || (x.etiqueta?.etapa && ctnDolor(x).toLowerCase() === ctn.dolor)) && (!ctn.pedido || (x.etiqueta?.etapa && (ctn.pedido === "si") === Boolean(x.etiqueta.pedido)));
const ctnImg = f => (f ? scoped(`/media/historias/${f}`) : "");
const ctnEmbudo = e => `<svg class="ctn-eg" viewBox="0 0 14 12" aria-hidden="true"><path class="${e === "TOFU" ? "x" : ""}" d="M0 0h14l-1.6 3.2H1.6z"/><path class="${e === "MOFU" ? "x" : ""}" d="M2.2 4.4h9.6l-1.4 3.2H3.6z"/><path class="${e === "BOFU" ? "x" : ""}" d="M4.2 8.8h5.6L8.6 12H5.4z"/></svg>`;
const ctnPastilla = x => `<span class="ctn-pill ${x.lectura.tono}">${esc(x.lectura.texto)}</span>`;

function ctnEtiquetas(x) {
	const e = x.etiqueta;
	if (!e?.etapa) return `<span class="ctn-ets"><span class="ctn-et">Sin leer</span></span>`;
	return `<span class="ctn-ets"><span class="ctn-et">${ctnEmbudo(e.etapa)}${e.etapa}</span>${e.dolor ? `<span class="ctn-et">${esc(e.dolor)}</span>` : ""}${e.angulo ? `<span class="ctn-et">${esc(e.angulo)}</span>` : ""}<span class="ctn-et ${e.pedido ? "p" : ""}">${esc(e.pedido || "Sin pedido")}</span></span>`;
}

function ctnFicha(x, i = 0) {
	if (x.k === "s") {
		const h = x.historias[(x.etiqueta?.pedido && x.etiqueta.pedido_en ? Math.min(x.etiqueta.pedido_en, x.historias.length) : 1) - 1];
		return `<button class="ctn-tl ${x.etiqueta?.pedido ? "ped" : ""}" data-ctn-abrir="${esc(x.id)}" aria-label="${esc(ctnTitulo(x))}" title="${esc(ctnTitulo(x))}">${h.imagen ? `<img src="${esc(ctnImg(h.imagen))}" alt="" loading="lazy">` : ""}${x.r.calificados ? `<span class="q">${x.r.calificados}</span>` : ""}</button>`;
	}
	const img = x.versiones.find(v => v.imagen)?.imagen;
	return `<button class="ctn-tl reel ${x.etiqueta?.pedido ? "ped" : ""}" data-ctn-abrir="${esc(x.id)}" aria-label="${esc(ctnTitulo(x))}" title="${esc(ctnTitulo(x))}">${img ? `<img src="${esc(ctnImg(img))}" alt="" loading="lazy">` : ""}<b>${ctnMil(x.vistas)}</b>${x.r.calificados ? `<span class="q">${x.r.calificados}</span>` : ""}</button>`;
}

function ctnMapa() {
	const leidas = ctnTodo().filter(x => x.etiqueta?.etapa);
	const d = ctn.datos;
	const filas = [...d.dolores, ...(leidas.some(x => !x.etiqueta.dolor) ? [CTN_SIN] : [])];
	if (!filas.length) return `<div class="ctn-vacio">Cuando el Analista lea el contenido, acá se ve qué dolor toca cada pieza y en qué etapa.</div>`;
	const piezas = xs => xs.reduce((t, x) => t + (x.versiones?.length ?? 1), 0);
	const califica = d.seCalifica;
	const cab = `<span></span>${CTN_ETAPAS.map(e => `<span class="ctn-gh">${ctnEmbudo(e)}<b>${e}</b>${piezas(leidas.filter(x => x.etiqueta.etapa === e))}</span>`).join("")}<span class="ctn-gh n">Chats</span><span class="ctn-gh n">${califica ? "Calif." : "Pitches"}</span>`;
	const cuerpo = filas.map(t => {
		const k = t.toLowerCase();
		const de = leidas.filter(x => ctnDolor(x).toLowerCase() === k);
		const chats = de.reduce((s, x) => s + x.r.chats, 0);
		const otro = de.reduce((s, x) => s + (califica ? x.r.calificados : x.r.pitches), 0);
		const celdas = CTN_ETAPAS.map(e => {
			const c = de.filter(x => x.etiqueta.etapa === e);
			return c.length ? `<div class="ctn-cel">${c.map(ctnFicha).join("")}</div>` : `<div class="ctn-cel vac">Nada publicado</div>`;
		}).join("");
		return `<button class="ctn-gl" data-ctn-dolor="${esc(k)}" aria-pressed="${ctn.dolor === k}">${esc(t === CTN_SIN ? "Sin dolor" : t)}<small>${ctnPl(de.filter(x => x.k === "s").length, "secuencia", "secuencias")}, ${ctnPl(piezas(de.filter(x => x.k === "r")), "reel", "reels")}</small></button>${celdas}<span class="ctn-gn ${chats ? "" : "cero"}">${num(chats)}</span><span class="ctn-gn ${otro ? (califica ? "ok" : "") : "cero"}">${num(otro)}</span>`;
	}).join("");
	return `<div class="ctn-grid">${cab}${cuerpo}</div><div class="ctn-ley"><span><i class="s"></i>Secuencia de historias</span><span><i class="r"></i>Reel, con sus vistas</span><span><i class="p"></i>Pide algo</span>${califica ? `<span><i class="c"></i>Calificados que trajo</span>` : ""}</div>`;
}

const CTN_PASOS = [["vistas", "Vistas"], ["chats", "Chats"], ["conversaciones", "Conversaciones"], ["pitches", "Pitches"], ["agendas", "Agendas"], ["shows", "Shows"], ["cierres", "Cierres"]];
function ctnVentas() {
	const v = ctn.datos.ventas;
	const o = ctn.datos.origenes ?? {};
	return `<button class="ctn-ven" data-ctn-ventas title="Ver el reporte en Ventas">${CTN_PASOS.map(([id, n]) => `<span><small>${n}</small><b class="${v[id] ? "" : "cero"}">${num(v[id])}</b>${id === "chats" ? `<em>${num(o.historias)} historias, ${num(o.reels)} reels, ${num(o.otros)} otros</em>` : id === "vistas" && v.chats ? `<em>${(v.chats / Math.max(1, v.vistas) * 1000).toFixed(1).replace(".", ",")} chats cada 1.000</em>` : ""}</span>`).join("")}</button>`;
}

function ctnTira(x, max) {
	const en = x.etiqueta?.pedido ? x.etiqueta.pedido_en : null;
	return `<span class="ctn-tira">${x.historias.map((h, i) => `<span class="ctn-fr ${i + 1 === en ? "cta" : ""}"><span class="im">${h.imagen ? `<img src="${esc(ctnImg(h.imagen))}" alt="" loading="lazy">` : ic("instagram")}</span><i style="--h:${Math.max(5, Math.round((h.vistas / max) * 100))}%"></i><em>${num(h.vistas)}</em></span>`).join("")}</span>`;
}
function ctnResultado(x) {
	const dato = (t, n, ok) => `<div><dt>${t}</dt><dd class="${n ? (ok ? "ok" : "") : "cero"}">${num(n)}</dd></div>`;
	return `<dl>${dato("Chats", x.r.chats)}${dato("Pitches", x.r.pitches)}${ctn.datos.seCalifica ? dato("Calificados", x.r.calificados, true) : ""}${x.r.agendas ? dato("Agendas", x.r.agendas) : ""}${x.r.cierres ? dato("Cierres", x.r.cierres, true) : ""}</dl>`;
}

function ctnSecuencias() {
	const todas = ctn.datos.secuencias;
	const lista = ctnNuevas(todas.filter(ctnPasa));
	const max = Math.max(1, ...todas.flatMap(x => x.historias.map(h => h.vistas)));
	const filas = lista.map(x => `<button class="ctn-fila" data-ctn-abrir="${esc(x.id)}"><span class="ctn-inf"><small>${ctnDia(x.fecha)}, ${ctnHora(x.fecha)}</small><b>${esc(ctnTitulo(x))}</b>${ctnEtiquetas(x)}</span>${ctnTira(x, max)}<span class="ctn-res">${ctnResultado(x)}${ctnPastilla(x)}<p>${esc(x.lectura.porque)}</p></span></button>`).join("");
	return `<section class="ctn-blo"><header><h2>Secuencias</h2><span>${lista.length === todas.length ? todas.length : `${lista.length} de ${todas.length}`}</span></header>${filas || `<p class="ctn-nada">${todas.length ? "Ninguna secuencia con esos filtros." : "No hay historias en este período."}</p>`}</section>`;
}

function ctnReels() {
	const todas = ctn.datos.ideas;
	const lista = ctnNuevas(todas.filter(ctnPasa));
	const chica = x => x.lectura.texto === "Casi no salió";
	const tarjeta = x => {
		const img = x.versiones.find(v => v.imagen)?.imagen;
		const m = Math.max(1, ...x.versiones.map(v => v.vistas));
		const vs = x.versiones.length > 1 ? `<span class="ctn-vs">${x.versiones.map(v => `<span><span title="${esc(v.gancho)}">${esc(v.gancho)}</span><i style="width:${Math.max(2, Math.round((v.vistas / m) * 100))}%"></i><b>${num(v.vistas)}</b></span>`).join("")}</span>` : "";
		const dato = (t, n) => `<div><dt>${t}</dt><dd>${num(n)}</dd></div>`;
		return `<button class="ctn-id" data-ctn-abrir="${esc(x.id)}"><span class="ctn-tapa">${img ? `<img src="${esc(ctnImg(img))}" alt="" loading="lazy">` : `<span>${esc(ctnTitulo(x))}</span>`}<small>${ctnMil(x.vistas)} vistas</small></span><span class="ctn-idt"><small>${ctnDia(ctnFecha(x))}${x.versiones.length > 1 ? `, la última de ${x.versiones.length} versiones` : ""}</small><b>${esc(ctnTitulo(x))}</b>${ctnEtiquetas(x)}<dl>${dato("Guardados", x.guardados)}${dato("Cada 1.000", x.vistas ? Math.round((x.guardados / x.vistas) * 1000) : 0)}${dato("Comentarios", x.comentarios)}${x.r.chats ? dato("Chats", x.r.chats) : ""}${x.r.calificados ? dato("Calificados", x.r.calificados) : ""}</dl>${vs}<span>${ctnPastilla(x)}</span><p>${esc(x.lectura.porque)}</p></span></button>`;
	};
	const grandes = lista.filter(x => !chica(x));
	const chicas = lista.filter(chica);
	const reels = lista.reduce((t, x) => t + x.versiones.length, 0);
	return `<section class="ctn-blo"><header><h2>Reels y publicaciones</h2><span>${ctnPl(lista.length, "idea", "ideas")} en ${ctnPl(reels, "pieza", "piezas")}</span></header>${grandes.length ? `<div class="ctn-ide">${grandes.map(tarjeta).join("")}</div>` : ""}${chicas.length ? `<div class="ctn-chi"><h3>Casi no salieron</h3>${chicas.map(x => `<button class="ctn-c" data-ctn-abrir="${esc(x.id)}"><b>${esc(ctnTitulo(x))}</b>${ctnEtiquetas(x)}<em>${ctnDia(ctnFecha(x))}, ${ctnPl(x.vistas, "vista", "vistas")}</em></button>`).join("")}</div>` : ""}${lista.length ? "" : `<p class="ctn-nada">${todas.length ? "Ningún reel con esos filtros." : "No hay reels en este período."}</p>`}</section>`;
}

function ctnEditar(x) {
	const e = x.etiqueta ?? {};
	const d = ctn.datos;
	const campo = (id, t, v, extra = "") => `<label><span>${t}</span><input id="ctn-${id}" value="${esc(v ?? "")}" autocomplete="off" ${extra}></label>`;
	return `<div class="ctn-form">
		${campo("titulo", "De qué trata", e.titulo || ctnTitulo(x), 'maxlength="110"')}
		<label><span>Etapa</span><select id="ctn-etapa">${["", ...CTN_ETAPAS].map(t => `<option value="${t}" ${t === (e.etapa ?? "") ? "selected" : ""}>${t || "Sin leer"}</option>`).join("")}</select></label>
		${campo("dolor", "Dolor", e.dolor, 'maxlength="48" list="ctn-dolores" placeholder="No toca ninguno"')}
		${campo("angulo", "Ángulo", e.angulo, 'maxlength="40" list="ctn-angulos"')}
		${campo("pedido", "Qué pide", e.pedido, 'maxlength="60" placeholder="No pide nada"')}
		${x.k === "s" ? campo("pedido_en", "En qué historia lo pide", e.pedido_en ?? "", `type="number" min="1" max="${x.historias.length}"`) : campo("idea", "Idea (los reels con la misma son versiones)", e.idea, 'maxlength="60"')}
		<label><span>Nota</span><textarea id="ctn-nota" rows="3" maxlength="260">${esc(e.nota ?? "")}</textarea></label>
		<datalist id="ctn-dolores">${d.dolores.map(t => `<option value="${esc(t)}">`).join("")}</datalist><datalist id="ctn-angulos">${d.angulos.map(t => `<option value="${esc(t)}">`).join("")}</datalist>
		<div class="ctn-acc"><button class="b p" data-ctn-guardar ${ctn.guardando ? "disabled" : ""}>${ctn.guardando ? "Guardando…" : "Guardar"}</button><button class="b" data-ctn-editar="">Cancelar</button></div>
	</div>`;
}

function ctnDetalle(x) {
	const s = x.k === "s";
	const e = x.etiqueta;
	const v = s ? x.historias.map(h => h.vistas) : [];
	const barra = (t, n, max, ok) => `<div><span>${t}</span><i class="${ok ? "a" : ""}" style="width:${n ? Math.max(1, Math.round((n / Math.max(1, max)) * 100)) : 0}%"></i><b>${num(n)}</b></div>`;
	const pasos = [["Chats", x.r.chats], ["Conversan", x.r.conversaciones], ["Pitches", x.r.pitches], ["Agendas", x.r.agendas], ["Shows", x.r.shows], ["Cierres", x.r.cierres]];
	const camino = x.r.chats || s ? `<section><h4>Lo que pasó con los que escribieron</h4><div class="ctn-camino">${pasos.map(([t, n]) => barra(t, n, x.r.chats)).join("")}${ctn.datos.seCalifica ? barra("Calificados", x.r.calificados, x.r.chats, true) : ""}</div></section>` : "";
	const vista = s ? "" : `<section><h4>Lo que pasó con los que lo vieron</h4><div class="ctn-camino">${barra("Vistas", x.vistas, x.vistas)}${barra("Guardados", x.guardados, x.vistas)}${barra("Compartidos", x.compartidos, x.vistas)}${barra("Comentarios", x.comentarios, x.vistas)}</div></section>`;
	const mira = !s && x.versiones.length === 1 && x.versiones[0].segundos ? `<section><h4>Cómo se mira</h4><dl class="ctn-car"><dt>Miran</dt><dd>${Math.round(x.versiones[0].segundos)} s${x.versiones[0].duracion ? ` de ${Math.round(x.versiones[0].duracion)}` : ""}</dd>${x.versiones[0].saltan === null ? "" : `<dt>Lo saltan</dt><dd>${Math.round(x.versiones[0].saltan)} % al empezar</dd>`}</dl></section>` : "";
	const versiones = !s && x.versiones.length > 1 ? `<section><h4>Las versiones</h4><div class="ctn-ver">${x.versiones.map(y => `<div><span>${esc(y.gancho)}<small>${ctnDia(y.fecha)}${y.segundos ? `, miran ${Math.round(y.segundos)} s` : ""}${y.r.chats ? `, ${ctnPl(y.r.chats, "chat", "chats")}` : ""}</small></span><b>${num(y.vistas)}</b>${y.link ? `<button class="lnk" data-dm-web="${esc(y.link)}">Ver</button>` : ""}</div>`).join("")}</div></section>` : "";
	const sub = s ? `${ctnPl(x.historias.length, "historia", "historias")}, ${ctnDia(x.fecha)} ${ctnHora(x.fecha)}` : x.versiones.length > 1 ? `${x.versiones.length} versiones, del ${ctnDia(x.fecha)} al ${ctnDia(ctnFecha(x))}` : ctnDia(x.fecha);
	const etiquetas = e?.etapa ? `<dl class="ctn-car"><dt>Etapa</dt><dd>${ctnEmbudo(e.etapa)}${e.etapa}</dd><dt>Dolor</dt><dd>${esc(e.dolor || "No toca ninguno")}</dd><dt>Ángulo</dt><dd>${esc(e.angulo || "—")}</dd><dt>Pedido</dt><dd>${esc(e.pedido || "No pide nada")}</dd></dl>` : `<div class="ctn-aviso">Todavía no la leyó el Analista.</div>`;
	return `<div class="ctn-det">
		<div class="ctn-cab"><div>${ctnPastilla(x)}<h2>${esc(ctnTitulo(x))}</h2><small>${sub}</small></div><button class="ic" data-ctn-cerrar aria-label="Cerrar">${ic("x")}</button></div>
		<p>${esc(x.lectura.porque)}</p>
		${ctn.editando ? ctnEditar(x) : etiquetas}
		${s ? `<section><h4>Las historias</h4>${ctnTira(x, Math.max(1, ...v))}${v.length > 1 && v[0] ? `<p class="ctn-sub">Vieron la primera ${num(v[0])} y la última ${num(v[v.length - 1])}: llegó el ${Math.round((v[v.length - 1] / v[0]) * 100)} %.</p>` : ""}</section>` : versiones + mira + vista}
		${camino}
		${ctn.aviso ? `<div class="ctn-aviso">${esc(ctn.aviso)}</div>` : ""}
		${ctn.editando ? "" : `<div class="ctn-acc"><button class="b p" data-ctn-versiones>Pedir 3 versiones al Guionista</button>${x.r.chats ? `<button class="b" data-ctn-chats>Ver los ${num(x.r.chats)} chats</button>` : ""}${!s && x.versiones.length === 1 && x.versiones[0].link ? `<button class="b" data-dm-web="${esc(x.versiones[0].link)}">Ver en Instagram</button>` : ""}<button class="b" data-ctn-editar="1">Corregir etiquetas</button></div>`}
	</div>`;
}

function contenidoHtml() {
	if (!state.instagram?.connected) return `<div class="empty"><b>Instagram no está conectado</b>Conectalo en Ajustes, Conexiones.</div>`;
	const d = ctn.datos;
	if (!d) return `<div class="dmvacio">${ctn.error ? esc(ctn.error) : "Cargando el contenido…"}</div>`;
	const seg = (attr, ops, actual) => ops.map(([v, t]) => `<button ${attr}="${v}" aria-pressed="${v === actual}">${t}</button>`).join("");
	const barra = `<div class="ctn-barra"><div class="ctn-seg"><small>Etapa</small>${seg("data-ctn-etapa", [["", "Todas"], ...CTN_ETAPAS.map(e => [e, `${ctnEmbudo(e)}${e}`])], ctn.etapa)}</div><div class="ctn-seg"><small>Pedido</small>${seg("data-ctn-pedido", [["", "Todos"], ["si", "Con pedido"], ["no", "Sin pedido"]], ctn.pedido)}</div>${ctn.dolor ? `<div class="ctn-seg"><button data-ctn-dolor="${esc(ctn.dolor)}" aria-pressed="true">${esc(d.dolores.find(t => t.toLowerCase() === ctn.dolor) ?? "Sin dolor")} ${ic("x")}</button></div>` : ""}<span class="sp"></span><div class="ctn-seg">${seg("data-ctn-periodo", CTN_PERIODOS, ctn.periodo)}</div></div>`;
	const falta = d.sinLeer ? `<div class="ctn-falta"><span>${ctn.pidio ? `${esc(ctn.pidio)} está leyendo ${ctnPl(d.sinLeer, "pieza", "piezas")}. Se completa solo.` : `${d.sinLeer === 1 ? "Falta leer 1 pieza" : `Faltan leer ${num(d.sinLeer)} piezas`} para saber qué dolor, ángulo y pedido tienen.`}</span>${ctn.pidio ? "" : `<button class="b p" data-ctn-leer>Pedírselo al Analista</button>`}</div>` : "";
	const ve = d.seVe.length ? `<aside class="ctn-ve"><h2>Lo que se ve</h2>${d.seVe.map(v => `<div><b>${esc(v.numero)}</b><p>${esc(v.texto)}<small>${esc(v.detalle)}</small></p></div>`).join("")}</aside>` : "";
	const abierto = ctnTodo().find(x => x.id === ctn.abierto);
	return `<div class="ctn"><div class="ctn-todo"><header class="vt-cab ctn-cabeza"><span class="vt-tit"><b>Contenido</b><small>@${esc(state.instagram?.username ?? "")} · lo que trajo cada historia y cada reel</small></span></header>${barra}${ctn.error ? `<div class="ctn-aviso fila">${esc(ctn.error)}</div>` : ""}<section class="ctn-n ctn-res2" aria-label="Resumen"><header class="ctn-n__cab"><h2>Resumen</h2><small>Lo que trajo tu contenido en el período. Tocalo para verlo en Ventas.</small></header>${ctnVentas()}${falta}${ve}</section>${ctnEmbudoEstrategia()}${ctnSecuencias2()}${ctnReels()}</div><div class="ctn-velo ${abierto ? "on" : ""}" data-ctn-cerrar></div><aside class="ctn-drawer ${abierto ? "on" : ""}" ${abierto ? `role="dialog" aria-label="${esc(ctnTitulo(abierto))}"` : ""}>${abierto ? ctnDetalle(abierto) : ""}</aside></div>`;
}

/** Abre la ficha de una pieza desde otra vista (por ejemplo, "Qué lo trajo" en un contacto). */
async function verPiezaCtn(id) {
	ctn.abierto = null;
	ctn.editando = false;
	ctn.etapa = ctn.pedido = ctn.dolor = "";
	ctn.periodo = "todo";
	ctn.datos = null;
	go({ type: "contenido" });
	for (let i = 0; i < 100 && (ctn.cargando || (!ctn.datos && !ctn.error)); i++) await new Promise(ok => setTimeout(ok, 100));
	const x = ctnTodo().find(y => (y.k === "s" ? y.historias.some(h => h.id === id) : y.versiones.some(v => v.media === id || v.id === id)));
	if (x) ctn.abierto = x.id;
	else ctn.error = "Esa pieza no está guardada.";
	renderBody();
}

document.addEventListener("click", async e => {
	const t = e.target.closest("[data-ctn-abrir],[data-ctn-cerrar],[data-ctn-dolor],[data-ctn-etapa],[data-ctn-pedido],[data-ctn-periodo],[data-ctn-ventas],[data-ctn-leer],[data-ctn-versiones],[data-ctn-chats],[data-ctn-editar],[data-ctn-guardar],[data-ctn-ver]");
	if (!t) return;
	const d = t.dataset;
	const x = ctnTodo().find(y => y.id === ctn.abierto);
	const mostrar = () => renderBody();
	if (d.ctnVer) return void verPiezaCtn(d.ctnVer);
	if (d.ctnAbrir) {
		Object.assign(ctn, { abierto: d.ctnAbrir, editando: false, aviso: "" });
		return mostrar();
	}
	if ("ctnCerrar" in d) {
		Object.assign(ctn, { abierto: null, editando: false, aviso: "" });
		return mostrar();
	}
	if ("ctnDolor" in d) ctn.dolor = ctn.dolor === d.ctnDolor ? "" : d.ctnDolor;
	if ("ctnEtapa" in d) ctn.etapa = d.ctnEtapa;
	if ("ctnPedido" in d) ctn.pedido = d.ctnPedido;
	if (d.ctnPeriodo) {
		Object.assign(ctn, { periodo: d.ctnPeriodo, abierto: null });
		mostrar();
		return void cargarContenido();
	}
	if ("ctnVentas" in d) {
		const [desde, hasta] = ctnRango();
		Object.assign(dms, { modo: "reporte", reporte: null, periodo: ctn.periodo === "mes" || ctn.periodo === "todo" ? ctn.periodo : "rango", rango: [desde, hasta] });
		go({ type: "dms" });
		return void cargarReporte();
	}
	if ("ctnEditar" in d) Object.assign(ctn, { editando: Boolean(d.ctnEditar), aviso: "" });
	if ("ctnChats" in d && x) {
		ctos.pieza = { titulo: ctnTitulo(x), ids: x.k === "s" ? x.historias.map(h => h.id) : x.versiones.map(v => v.media).filter(Boolean), palabra: x.k === "r" ? (/([A-ZÁÉÍÓÚÑ0-9]{2,20})\s*$/.exec(x.etiqueta?.pedido ?? "")?.[1] ?? "").toLowerCase() : "" };
		Object.assign(ctos, { origen: "todos", paso: "todos", busca: "", abierto: null, mostrar: 100 });
		dms.modo = "contactos";
		go({ type: "dms" });
		return void cargarContactos();
	}
	if ("ctnLeer" in d || ("ctnVersiones" in d && x)) {
		t.disabled = true;
		const leer = "ctnLeer" in d;
		const cuerpo = leer ? {} : { tipo: x.k === "s" ? "secuencia" : "reel", titulo: ctnTitulo(x), fecha: ctnDia(x.fecha), que: [x.etiqueta?.etapa, x.etiqueta?.dolor, x.etiqueta?.angulo, x.etiqueta?.pedido].filter(Boolean).join(", "), resultado: x.k === "s" ? `${num(x.historias[0].vistas)} vistas, ${ctnPl(x.r.chats, "chat", "chats")}, ${ctnPl(x.r.pitches, "pitch", "pitches")}` : `${num(x.vistas)} vistas, ${num(x.guardados)} guardados`, link: x.k === "r" ? x.versiones[0].link : "" };
		const r = await api(`/contenido/${leer ? "leer" : "versiones"}`, { method: "POST", body: JSON.stringify(cuerpo) }).catch(() => null);
		const p = r ? await r.json().catch(() => ({})) : {};
		if (leer && r?.ok) {
			ctn.pidio = p.nombre ?? "El Analista";
			abrirContenido();
		} else if (leer) ctn.error = p.error ?? "No se pudo pedir.";
		else ctn.aviso = r?.ok ? `Se lo pedí a ${p.nombre}. Te lo entrega en la Bandeja.` : (p.error ?? "No se pudo pedir.");
		return mostrar();
	}
	if ("ctnGuardar" in d && x && !ctn.guardando) {
		const val = id => document.getElementById(`ctn-${id}`)?.value.trim() ?? "";
		const comun = { etapa: val("etapa"), dolor: val("dolor"), angulo: val("angulo"), pedido: val("pedido"), nota: val("nota") };
		const piezas = x.k === "s" ? [{ id: x.id, ...comun, titulo: val("titulo"), pedido_en: val("pedido_en") || null }] : x.versiones.map((v, i) => ({ id: v.id, ...comun, idea: val("idea"), ...(x.versiones.length === 1 || v.id === x.etiqueta?.id ? { titulo: val("titulo") } : {}) }));
		ctn.guardando = true;
		mostrar();
		const r = await api("/ig/etiqueta", { method: "POST", body: JSON.stringify({ piezas }) }).catch(() => null);
		const p = r ? await r.json().catch(() => ({})) : {};
		ctn.guardando = false;
		if (r?.ok) {
			ctn.editando = false;
			ctn.aviso = "Guardado.";
			await cargarContenido();
		} else ctn.aviso = p.error ?? "No se pudo guardar.";
		return mostrar();
	}
	mostrar();
});
document.addEventListener("keydown", e => {
	if (e.key === "Escape" && view.type === "contenido" && ctn.abierto && !document.querySelector(".dmvisor")) {
		Object.assign(ctn, { abierto: null, editando: false, aviso: "" });
		renderBody();
	}
});

// ---------- Contenido en tres niveles: resumen → embudo de contenido (TOFU, MOFU, BOFU) → secuencias ----------
// Lo de arriba se entiende en segundos; cada etapa del embudo se toca para ver sus piezas, y cada secuencia se abre
// para ver sus pasos en orden (con su estado: pendiente, en preparación, programada o publicada) y lo que se puede hacer.
const CTN_NOMBRE = {
	TOFU: ["Atracción y descubrimiento", "Que te conozca gente nueva: llega lejos, todavía no vende."],
	MOFU: ["Consideración y confianza", "Que te crean: casos, errores comunes y cómo trabajás."],
	BOFU: ["Conversión y venta", "Que te escriban: pide la llamada o la compra."],
};
let ctnSecAbierta = stored("ctnSec", null);
const ctnPiezas = x => x.versiones?.length ?? 1;
const ctnVistas = x => (x.k === "s" ? x.historias.reduce((t, h) => t + (h.vistas || 0), 0) : x.vistas);

function ctnEmbudoEstrategia() {
	const leidas = ctnTodo().filter(x => x.etiqueta?.etapa);
	const total = leidas.reduce((t, x) => t + ctnPiezas(x), 0) || 1;
	const etapas = CTN_ETAPAS.map(e => {
		const xs = leidas.filter(x => x.etiqueta.etapa === e);
		const suma = k => xs.reduce((t, x) => t + (x.r?.[k] ?? 0), 0);
		return { e, xs, piezas: xs.reduce((t, x) => t + ctnPiezas(x), 0), vistas: xs.reduce((t, x) => t + ctnVistas(x), 0), chats: suma("chats"), calif: suma("calificados"), cierres: suma("cierres") };
	});
	// Desequilibrios: una etapa con muy poco contenido, o un dolor que no tiene nada que venda.
	const avisos = etapas.filter(x => x.piezas / total < 0.2).map(x => `Hay poco contenido de <b>${CTN_NOMBRE[x.e][0].toLowerCase()}</b> (${x.e}): ${x.piezas ? `${Math.round((x.piezas / total) * 100)} %` : "nada"} de lo publicado.`);
	for (const dolor of ctn.datos.dolores ?? []) if (!leidas.some(x => x.etiqueta.etapa === "BOFU" && ctnDolor(x).toLowerCase() === dolor.toLowerCase())) avisos.push(`«${esc(dolor)}» no tiene contenido que pida la llamada (BOFU).`);
	const filas = etapas.map((x, i) => {
		const on = ctn.etapa === x.e;
		return `<button class="ctn-et2 n${i} ${on ? "on" : ""} ${ctn.etapa && !on ? "tenue" : ""}" data-ctn-etapa="${on ? "" : x.e}" aria-pressed="${on}">
			<span class="ctn-et2__q"><span class="ctn-et2__cod">${ctnEmbudo(x.e)}${x.e}</span><b>${CTN_NOMBRE[x.e][0]}</b><small>${CTN_NOMBRE[x.e][1]}</small></span>
			<span class="ctn-et2__num"><span><b>${x.piezas}</b><small>${Math.round((x.piezas / total) * 100)} % de las piezas</small></span><span><b>${ctnMil(x.vistas)}</b><small>vistas</small></span><span><b>${num(x.chats)}</b><small>chats</small></span><span><b>${num(x.calif)}</b><small>${ctn.datos.seCalifica ? "calificados" : "pitches"}</small></span></span>
		</button>`;
	}).join(`<span class="ctn-et2__flecha" aria-hidden="true"></span>`);
	const sel = etapas.find(x => x.e === ctn.etapa);
	const detalle = sel ? `<div class="ctn-et2__det"><header><b>${CTN_NOMBRE[sel.e][0]}</b><small>${ctnPl(sel.xs.length, "pieza", "piezas")} · ${sel.chats ? `${(sel.chats / Math.max(1, sel.piezas)).toFixed(1).replace(".", ",")} chats por pieza` : "todavía sin chats"}${sel.cierres ? ` · ${ctnPl(sel.cierres, "cierre", "cierres")}` : ""}</small><button class="lnk" data-ctn-etapa="">Ver todas las etapas</button></header>${sel.xs.length ? `<div class="ctn-cel">${sel.xs.map(ctnFicha).join("")}</div>` : `<p class="ctn-nada">Todavía no hay piezas en esta etapa.</p>`}</div>` : "";
	return `<section class="ctn-n ctn-embudo2" aria-label="Distribución del contenido">
		<header class="ctn-n__cab"><h2>Tu embudo de contenido</h2><small>Una sola estrategia en tres etapas: atraer, generar confianza y vender. Tocá una para ver sus piezas.</small></header>
		<div class="ctn-reparto" aria-hidden="true">${etapas.map((x, i) => `<i class="n${i}" style="flex:${Math.max(x.piezas, 0.15)}"><span>${x.e} ${Math.round((x.piezas / total) * 100)} %</span></i>`).join("")}</div>
		<div class="ctn-et2s">${filas}</div>
		${avisos.length ? `<ul class="ctn-desq">${avisos.map(a => `<li>${a}</li>`).join("")}</ul>` : ""}
		${detalle}
		<details class="ctn-pordolor"><summary>Ver el contenido por dolor y etapa</summary><div class="ctn-mapa">${ctnMapa()}</div></details>
	</section>`;
}

const CTN_ESTADO = { pendiente: ["Pendiente", ""], en_preparacion: ["En preparación", "prep"], programada: ["Programada", "prog"], publicada: ["Publicada", "pub"] };
function ctnProximo(x) {
	const h = x.historias;
	const i = h.findIndex(y => y.estado === "pendiente");
	if (i >= 0) return `Armar la historia ${i + 1}${h[i].texto ? `: «${h[i].texto}»` : ""}`;
	const j = h.findIndex(y => y.estado === "en_preparacion");
	if (j >= 0) return `El Guionista arma la historia ${j + 1}; después, programarla`;
	const k = h.find(y => y.estado === "programada");
	if (k) return `Sale ${k.fecha ? `el ${ctnDia(k.fecha)} a las ${ctnHora(k.fecha)}` : "pronto"}`;
	if (!x.etiqueta?.pedido) return "Sumarle un pedido al final";
	return x.lectura.tono === "ok" ? "Repetirla con otro caso" : x.lectura.tono === "mal" ? "Cambiar el gancho de la primera historia" : "Probar otro gancho";
}
function ctnSecuencias2() {
	const todas = ctn.datos.secuencias;
	const lista = ctnNuevas(todas.filter(ctnPasa));
	const fila = x => {
		const h = x.historias;
		const pub = h.filter(y => y.estado === "publicada").length;
		const abierta = ctnSecAbierta === x.id;
		const e = x.etiqueta ?? {};
		const pasos = abierta ? `<ol class="ctn-pasos">${h.map((y, i) => {
			const [nombre, cls] = CTN_ESTADO[y.estado] ?? CTN_ESTADO.publicada;
			const clave = `${x.id}:${i}`;
			const acc = { pendiente: `<button class="b" data-ctn-paso="${clave}:pedir">Pedírsela al Guionista</button><button class="b" data-ctn-paso="${clave}:programar">Programar</button>`, en_preparacion: `<button class="b" data-ctn-paso="${clave}:programar">Programar</button>`, programada: `<button class="b go" data-ctn-paso="${clave}:publicar">Publicar ahora</button><button class="lnk" data-ctn-paso="${clave}:pendiente">Volver a pendiente</button>`, publicada: "" }[y.estado ?? "publicada"];
			return `<li class="is-${cls || "pend"}"><span class="ctn-paso__n">${i + 1}</span><span class="ctn-paso__im">${y.estado === "publicada" && y.imagen ? `<img src="${esc(ctnImg(y.imagen))}" alt="" loading="lazy">` : ""}</span><span class="ctn-paso__q"><b>${esc(y.texto || `Historia ${i + 1}`)}</b><small><span class="ctn-est ${cls}">${nombre}</span>${y.estado === "publicada" ? ` · ${num(y.vistas)} vistas` : y.estado === "programada" && y.fecha ? ` · ${ctnDia(y.fecha)} ${ctnHora(y.fecha)}` : ""}${e.pedido && e.pedido_en === i + 1 ? ` · <em>acá pide «${esc(e.pedido)}»</em>` : ""}</small></span><span class="ctn-paso__acc">${acc}</span></li>`;
		}).join("")}</ol><div class="ctn-sq__pie">${ctnResultado(x)}<p>${esc(x.lectura.porque)}</p><button class="b" data-ctn-abrir="${esc(x.id)}">Ver el detalle completo</button></div>` : "";
		return `<article class="ctn-sq ${abierta ? "on" : ""}"><button class="ctn-sq__cab" data-ctn-sec="${esc(x.id)}" aria-expanded="${abierta}">
			<span class="ctn-sq__q"><b>${esc(ctnTitulo(x))}</b><small>${e.etapa ? `${CTN_NOMBRE[e.etapa][0]}${e.dolor ? ` · ${esc(e.dolor)}` : ""}` : "Sin leer todavía"}</small></span>
			<span class="ctn-sq__est">${ctnPastilla(x)}</span>
			<span class="ctn-sq__prog"><span class="ctn-sq__barra"><i style="width:${(pub / h.length) * 100}%"></i></span><small>${pub} de ${h.length} publicadas</small></span>
			<span class="ctn-sq__sig"><small>Próximo</small>${esc(ctnProximo(x))}</span>
			${ic(abierta ? "chevron-up" : "chevron-down")}
		</button>${pasos}</article>`;
	};
	return `<section class="ctn-n ctn-secs" aria-label="Secuencias"><header class="ctn-n__cab"><h2>Secuencias</h2><small>${lista.length === todas.length ? ctnPl(todas.length, "secuencia", "secuencias") : `${lista.length} de ${todas.length}`} · tocá una para ver sus pasos</small></header>${lista.map(fila).join("") || `<p class="ctn-nada">${todas.length ? "Ninguna secuencia con esos filtros." : "No hay historias en este período."}</p>`}</section>`;
}

document.addEventListener("click", async e => {
	if (view.type !== "contenido") return;
	const sec = e.target.closest("[data-ctn-sec]");
	if (sec) {
		ctnSecAbierta = ctnSecAbierta === sec.dataset.ctnSec ? null : sec.dataset.ctnSec;
		store("ctnSec", ctnSecAbierta);
		lastBody = "";
		return renderBody();
	}
	const paso = e.target.closest("[data-ctn-paso]");
	if (!paso) return;
	const [secuencia, i, accion] = paso.dataset.ctnPaso.split(":");
	paso.disabled = true;
	const r = await api("/ig/contenido/paso", { method: "POST", body: JSON.stringify({ secuencia, paso: Number(i), accion }) }).catch(() => null);
	const d = r ? await r.json().catch(() => ({})) : {};
	ctn.aviso = r?.ok ? "" : (d.error ?? "No se pudo hacer.");
	if (!r?.ok) avisoDeVoz(ctn.aviso);
	else if (accion === "pedir") avisoDeVoz("Listo: se la pediste al Guionista. Te avisa en la Bandeja.");
	await cargarContenido();
	lastBody = "";
	renderBody();
});
