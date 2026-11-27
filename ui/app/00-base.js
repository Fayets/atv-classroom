// Interfaz de ATV Leverage: lee el estado del servidor local y le manda las decisiones del dueño.
const TOKEN = document.querySelector('meta[name="factory-token"]').content;

/** Apariencia de esta persona: se aplica antes de pintar, para que no parpadee. */
function readPref(key, fallback) {
	try {
		return JSON.parse(localStorage.getItem(key)) ?? fallback;
	} catch {
		return fallback;
	}
}
let themePref = readPref("tema", "light");
const darkQuery = matchMedia("(prefers-color-scheme: dark)");
function applyLook() {
	document.documentElement.dataset.theme = themePref === "system" ? (darkQuery.matches ? "dark" : "light") : themePref;
}
applyLook();
darkQuery.addEventListener("change", applyLook);
if (navigator.userAgent.includes("Electron") && navigator.platform.startsWith("Mac")) document.documentElement.classList.add("desktop");
/** Lo que depende de la carpeta abierta: el servidor solo devuelve lo de ese cliente. */
const SCOPED = /^\/(state|perfil|ig|contenido|soporte|jeremy|onboarding|library|gasto|decisiones|skills|swipes|connections|routines|embudos|crm|software|ceo|connect|attachments|media\/link|media\/historias|media\/adjuntos)\b/;
const scoped = p => (carpeta && SCOPED.test(p) ? `${p}${p.includes("?") ? "&" : "?"}cliente=${encodeURIComponent(carpeta)}` : p);
const SEPARA_JUAN = "\n\n[Juan]\n";
const SEPARA_JEREMY = "\n\n[Jeremy]\n";
const api = (path, opts = {}) =>
	fetch(scoped(path), { ...opts, headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...(opts.headers ?? {}) } });

const ic = name => `<svg class="i"><use href="#i-${name}"/></svg>`;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const inline = s =>
	mentions(esc(s))
		.replace(/`([^`]+)`/g, "<code>$1</code>")
		.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
		.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
		// El punto que cierra la frase no es parte del link: con él, Miro y otros sitios dan error.
		.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_todo, antes, link) => {
			const cola = /[.,;:!?]+$/.exec(link)?.[0] ?? "";
			const url = link.slice(0, link.length - cola.length);
			return `${antes}<a href="${url}" target="_blank" rel="noreferrer">${url}</a>${cola}`;
		});

/** Markdown justo: títulos, listas numeradas o con viñeta, y párrafos. */
/** @Nombre de alguien de la empresa se ve como una etiqueta. */
function mentions(html) {
	const owner = state.settings?.owner?.name ?? "";
	const names = [...state.agents.map(a => a.name), owner, owner.split(/\s+/)[0]].filter(Boolean).sort((a, b) => b.length - a.length);
	if (!names.length) return html;
	const known = names.map(n => esc(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
	return html.replace(new RegExp(`(^|[\\s(])@(${known})(?![\\p{L}\\p{N}])`, "giu"), '$1<span class="at">@$2</span>');
}

/** Lo que se abre y se cierra en el chat sigue igual aunque la pantalla se vuelva a pintar. */
const folds = new Set();
const fold = (key, label, body, cls = "") => `<div class="fold ${cls} ${folds.has(key) ? "open" : ""}"><button class="fold-h" data-fold="${esc(key)}" aria-expanded="${folds.has(key)}">${label}${ic("chevron-right")}</button><div class="fold-b">${body}</div></div>`;

const copies = new Map();
const copyButton = (key, text) => {
	copies.set(key, text);
	return `<button class="fig-copy" data-copy="${esc(key)}" data-tip="Copiar" aria-label="Copiar">${ic("copy")}</button>`;
};

function codeFold(lines) {
	const code = lines.join("\n");
	const key = `code:${code.length}:${code.slice(0, 40)}`;
	return fold(key, "Código", `${copyButton(key, code)}<pre class="code">${esc(code)}</pre>`, "boxed");
}

/** Diagramas: se dibujan una sola vez y quedan guardados, así repintar el chat no los hace parpadear. */
const diagrams = new Map();
const figureAsCode = new Set();
let diagramQueue = Promise.resolve();

function loadMermaid() {
	if (window.mermaid) return Promise.resolve();
	return new Promise((done, fail) => {
		const tag = document.createElement("script");
		tag.src = "/ui/vendor/mermaid-11.12.2.min.js";
		tag.onload = () => {
			window.mermaid.initialize({
				startOnLoad: false,
				securityLevel: "strict",
				theme: "base",
				fontFamily: getComputedStyle(document.body).fontFamily,
				flowchart: { curve: "basis", useMaxWidth: true, nodeSpacing: 28, rankSpacing: 36, padding: 12 },
				themeVariables: { fontSize: "13px", primaryColor: "#FFFFFF", primaryBorderColor: "#E2DFDC", primaryTextColor: "#242321", secondaryColor: "#F3F0E9", tertiaryColor: "#FFFFFF", lineColor: "#929190", edgeLabelBackground: "#FFFFFF" },
			});
			done();
		};
		tag.onerror = fail;
		document.head.append(tag);
	});
}

function drawDiagram(code) {
	diagrams.set(code, "");
	diagramQueue = diagramQueue
		.then(loadMermaid)
		.then(() => window.mermaid.render(`dg${diagrams.size}-${code.length}`, code))
		.then(({ svg }) => diagrams.set(code, svg))
		.catch(() => diagrams.set(code, null))
		.finally(() => {
			renderBody();
			if (typeof repintarDoc === "function") repintarDoc();
		});
}

function figure(lines) {
	const code = lines.join("\n");
	if (!diagrams.has(code)) drawDiagram(code);
	const svg = diagrams.get(code);
	if (svg === null) return codeFold(lines);
	const key = `fig:${code.length}:${code.slice(0, 40)}`;
	const asCode = figureAsCode.has(key);
	const tab = (label, code) => `<button class="${code === asCode ? "on" : ""}" data-fig="${esc(key)}" data-fig-code="${code}">${label}</button>`;
	const ver = !asCode && svg;
	return `<div class="fig"><div class="fig-h"><div class="seg">${tab("Diagrama", false)}${tab("Código", true)}</div><div class="fig-acc">${ver ? `<button class="fig-copy" data-fig-ver aria-label="Ver en grande" title="Ver en grande">${ic("maximize-2")}</button>` : ""}${copyButton(key, code)}</div></div><div class="fig-b${ver ? " zoomable" : ""}"${ver ? " data-fig-ver" : ""}>${asCode ? `<pre class="code">${esc(code)}</pre>` : svg || '<div class="fig-wait"></div>'}</div></div>`;
}

/** El diagrama en grande, encima de todo: pellizco del pad para el zoom, dos dedos o arrastrar para moverlo,
 * doble clic para ajustarlo, Esc para cerrar. Se mueve solo con transform, sin tocar el layout en cada cuadro. */
let visorDiagrama = null;
function abrirDiagrama(svgOriginal) {
	cerrarDiagrama();
	const capa = document.createElement("div");
	capa.className = "dgv";
	capa.innerHTML = `<div class="dgv-hoja"></div><div class="dgv-barra"><button data-dgv="-" aria-label="Alejar">−</button><button class="dgv-pct" data-dgv="0" title="Ajustar">100%</button><button data-dgv="+" aria-label="Acercar">+</button><span></span><button data-dgv="x" aria-label="Cerrar">${ic("x")}</button></div>`;
	const hoja = capa.querySelector(".dgv-hoja");
	const svg = svgOriginal.cloneNode(true);
	const vb = svg.viewBox?.baseVal;
	const ancho = vb?.width || svgOriginal.getBoundingClientRect().width;
	const alto = vb?.height || svgOriginal.getBoundingClientRect().height;
	svg.removeAttribute("width");
	svg.removeAttribute("height");
	svg.style.cssText = `width:${ancho}px;height:${alto}px;max-width:none;display:block`;
	hoja.append(svg);
	document.body.append(capa);
	const pct = capa.querySelector(".dgv-pct");
	const v = { x: 0, y: 0, s: 1, cuadro: 0 };
	const pintar = () => {
		if (v.cuadro) return;
		v.cuadro = requestAnimationFrame(() => {
			v.cuadro = 0;
			hoja.style.transform = `translate3d(${v.x}px,${v.y}px,0) scale(${v.s})`;
			pct.textContent = `${Math.round(v.s * 100)}%`;
		});
	};
	const ajustar = () => {
		const W = capa.clientWidth;
		const H = capa.clientHeight - 72;
		v.s = Math.min((W - 64) / (ancho + 48), (H - 32) / (alto + 48), 3);
		v.x = (W - (ancho + 48) * v.s) / 2;
		v.y = (H - (alto + 48) * v.s) / 2 + 8;
		pintar();
	};
	const zoomEn = (factor, px, py) => {
		const s = Math.min(8, Math.max(0.15, v.s * factor));
		v.x = px - ((px - v.x) * s) / v.s;
		v.y = py - ((py - v.y) * s) / v.s;
		v.s = s;
		pintar();
	};
	capa.addEventListener(
		"wheel",
		e => {
			e.preventDefault();
			// En el pad de la Mac, pellizcar llega como rueda con ctrl; dos dedos, como rueda común.
			if (e.ctrlKey || e.metaKey) zoomEn(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
			else {
				v.x -= e.deltaX;
				v.y -= e.deltaY;
				pintar();
			}
		},
		{ passive: false },
	);
	let arrastre = null;
	capa.addEventListener("pointerdown", e => {
		if (e.button !== 0 || e.target.closest(".dgv-barra")) return;
		arrastre = { id: e.pointerId, x: e.clientX - v.x, y: e.clientY - v.y };
		capa.setPointerCapture(e.pointerId);
		capa.classList.add("arrastrando");
	});
	capa.addEventListener("pointermove", e => {
		if (!arrastre || e.pointerId !== arrastre.id) return;
		v.x = e.clientX - arrastre.x;
		v.y = e.clientY - arrastre.y;
		pintar();
	});
	const soltar = () => {
		arrastre = null;
		capa.classList.remove("arrastrando");
	};
	capa.addEventListener("pointerup", soltar);
	capa.addEventListener("pointercancel", soltar);
	capa.addEventListener("dblclick", e => {
		if (!e.target.closest(".dgv-barra")) ajustar();
	});
	capa.addEventListener("click", e => {
		const b = e.target.closest("[data-dgv]");
		if (!b) return;
		const cx = capa.clientWidth / 2;
		const cy = capa.clientHeight / 2;
		if (b.dataset.dgv === "x") cerrarDiagrama();
		else if (b.dataset.dgv === "0") ajustar();
		else zoomEn(b.dataset.dgv === "+" ? 1.25 : 0.8, cx, cy);
	});
	visorDiagrama = { capa, ajustar };
	ajustar();
}
function cerrarDiagrama() {
	visorDiagrama?.capa.remove();
	visorDiagrama = null;
}
document.addEventListener("keydown", e => {
	if (visorDiagrama && e.key === "Escape") {
		e.stopImmediatePropagation();
		cerrarDiagrama();
	}
}, true);
window.addEventListener("resize", () => visorDiagrama?.ajustar());
document.addEventListener("click", e => {
	const t = e.target.closest("[data-fig-ver], .jmer");
	if (!t) return;
	const svg = (t.closest(".fig") ?? t).querySelector(".fig-b svg, .jmer svg") ?? t.querySelector("svg");
	if (svg) abrirDiagrama(svg);
});

// Un video del chat. Si el archivo ya no está (el agente lo reemplazó o lo borró), se dice en vez de dejar un reproductor muerto.
const videosCaidos = new Set();
function videoChat(src) {
	if (videosCaidos.has(src)) return `<div class="vcaido">${ic("file-text")}Este video ya no está en la carpeta: el agente lo reemplazó o lo borró.</div>`;
	// La pantalla completa la pide un botón propio: si la app no la deja, se agranda dentro de la ventana.
	return `<div class="vchat"><video class="chatimg" src="${src}" controls controlslist="nofullscreen" disablepictureinpicture preload="metadata" playsinline></video><button class="vchat-amp" data-video-ampliar aria-label="Ver en grande" title="Ver en grande">${ic("maximize-2")}</button></div>`;
}
document.addEventListener(
	"error",
	e => {
		const v = e.target;
		if (!(v instanceof HTMLVideoElement) || !v.classList.contains("chatimg")) return;
		const src = v.getAttribute("src");
		// Solo si de verdad no está: un formato raro no es lo mismo que un archivo borrado.
		void fetch(src, { headers: { range: "bytes=0-0" } }).then(r => {
			if (r.status !== 404) return;
			videosCaidos.add(src);
			lastBody = "";
			renderBody();
		});
	},
	true,
);
function videoEnGrande(v) {
	const capa = document.createElement("div");
	capa.className = "vgrande";
	capa.innerHTML = `<button class="vgrande-x" aria-label="Cerrar">${ic("x")}</button>`;
	const sonaba = !v.paused;
	// En el chat queda un hueco del mismo tamaño, para que nada salte y el video sepa adónde volver.
	const hueco = document.createElement("div");
	hueco.className = "vhueco";
	hueco.style.cssText = `width:${v.offsetWidth}px;height:${v.offsetHeight}px`;
	v.before(hueco);
	capa.prepend(v);
	document.body.append(capa);
	if (sonaba) void v.play();
	const cerrar = () => {
		document.removeEventListener("keydown", tecla, true);
		// Si mientras tanto el chat se redibujó, el hueco ya no está y el video vuelve en lugar de su copia.
		const lugar = hueco.isConnected ? hueco : document.querySelector(`#body video[src="${CSS.escape(v.getAttribute("src"))}"]`);
		const seguia = !v.paused;
		if (lugar) {
			lugar.replaceWith(v);
			if (seguia) void v.play();
		}
		hueco.remove();
		capa.remove();
	};
	const tecla = e => {
		if (e.key !== "Escape") return;
		e.stopPropagation();
		cerrar();
	};
	document.addEventListener("keydown", tecla, true);
	capa.addEventListener("click", e => {
		if (e.target === capa || e.target.closest(".vgrande-x")) cerrar();
	});
}
document.addEventListener("click", e => {
	const b = e.target.closest("[data-video-ampliar]");
	if (!b) return;
	const v = b.parentElement.querySelector("video");
	// Se amplía dentro de la ventana: la app de escritorio niega la pantalla completa y ese pedido puede quedar colgado sin avisar.
	if (v) videoEnGrande(v);
});

const LINEA_LINK = /^(?:[-*]\s+|\d+[.)]\s+)?(?:\*\*)?\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)(?:\*\*)?\s*(?:[:·—-]\s*(.*))?$/;

/** Un link en su propia línea se ve como en WhatsApp: tocás y abre la página de verdad. */
function linkCard(titulo, url, nota) {
	const dominio = new URL(url).hostname.replace(/^www\./, "");
	const foto = `<img alt="" src="${scoped(`/media/link?url=${encodeURIComponent(url)}`)}" onerror="this.remove()">`;
	return `<a class="filecard linkcard" href="${esc(url)}" target="_blank" rel="noreferrer"><span class="fthumb">${ic("globe")}${foto}</span><span class="ftext"><b>${esc(titulo)}</b><small>${esc(dominio)}</small>${nota ? `<span class="lnota">${inline(nota)}</span>` : ""}</span></a>`;
}

/** Los agentes le hablan al dueño con "@dueño": se muestra su nombre, y si arranca el mensaje queda solo en la primera línea. */
function conNombreDelDueno(text) {
	const nombre = (state?.persona || state?.settings?.owner?.name || "").trim().split(/\s+/)[0];
	if (!nombre || !text) return text;
	return String(text)
		.replace(/^(\s*)@due[ñn]o\b[,:]?[ \t]*/i, `$1@${nombre}\n\n`)
		.replace(/@due[ñn]o\b/gi, `@${nombre}`);
}

const NOTA_DE_VOZ = /^\[Nota de voz: ([^|\]]+) \| (\d+) \| ([a-z]+)\]$/;
/** En una vista previa no va la ruta del archivo. */
const sinMarcas = t => String(t ?? "").replace(/\[Nota de voz: [^\]]*\]\n?/g, "").replace(/\[(Archivo|Imagen) adjunt[oa]: [^\]]*\]/g, "").trim();

function md(text, opciones = {}) {
	text = conNombreDelDueno(text);
	const out = [];
	let list = null;
	let table = null;
	let fence = null;
	let quote = null;
	const flush = () => {
		// Una cita es el mensaje para mandarle a alguien: va en su bloque, con botón para copiarlo entero.
		const citado = quote?.join("\n").trim();
		quote = null;
		if (citado) out.push(`<blockquote class="mdq">${copyButton(`q${[...citado].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)}`, citado.replace(/\*\*(.+?)\*\*/g, "$1"))}${md(citado, opciones)}</blockquote>`);
		if (list) out.push(`<${list.tag}${list.start > 1 ? ` start="${list.start}"` : ""}>${list.items.map(i => `<li>${inline(i.text)}${i.subs.length ? `<${i.subTag}>${i.subs.map(x => `<li>${inline(x)}</li>`).join("")}</${i.subTag}>` : ""}</li>`).join("")}</${list.tag}>`);
		if (table) {
			const [head, ...rows] = table;
			out.push(`<div class="mdt"><table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
		}
		list = null;
		table = null;
	};
	let nota = null;
	for (const raw of String(text ?? "").split("\n")) {
		const line = raw.trim();
		// Una nota de voz se escucha: el renglón que le sigue es lo que dice, y no se muestra salvo que se lo pidan.
		if (nota) {
			out.push(notaHtml(nota[1], Number(nota[2]), nota[3], line));
			nota = null;
			continue;
		}
		nota = !fence && NOTA_DE_VOZ.exec(line);
		if (nota) {
			flush();
			continue;
		}
		const cita = !fence && /^>\s?(.*)$/.exec(line);
		if (cita) {
			if (list || table) flush();
			(quote ??= []).push(cita[1]);
			continue;
		}
		if (quote) flush();
		const enlace = opciones.enlaces && !fence && LINEA_LINK.exec(line);
		if (enlace) {
			flush();
			out.push(linkCard(enlace[1], enlace[2], enlace[3]));
			continue;
		}
		const medio = !fence && /^!\[([^\]]*)\]\((\/[^)]+\.(jpe?g|png|webp|gif|mp4|mov|mp3|m4a))\)$/i.exec(line);
		if (medio) {
			flush();
			const src = `/media/archivo?path=${encodeURIComponent(medio[2])}`;
			const tipo = medio[3].toLowerCase();
			out.push(/mp4|mov/.test(tipo) ? videoChat(src) : /mp3|m4a/.test(tipo) ? `<audio src="${src}" controls></audio>` : `<img class="chatimg" data-file="${esc(medio[2])}" src="${src}" alt="${esc(medio[1])}" loading="lazy">`);
			continue;
		}
		const adjunto = !fence && /^\[Archivo adjunto: (\/[^|\]]+) \| ([^\]]+)\]$/.exec(line);
		if (adjunto) {
			flush();
			out.push(fileCard(adjunto[1], adjunto[2]));
			continue;
		}
		const image = !fence && /^\[Imagen adjunta: .*[\\/]([a-z0-9-]+\.[a-z]+)\]$/.exec(line);
		if (image) {
			flush();
			out.push(`<img class="chatimg" src="${scoped(`/media/adjuntos/${esc(image[1])}`)}" alt="Imagen adjunta">`);
			continue;
		}
		if (fence) {
			if (line.startsWith("```")) {
				out.push(fence.lang === "mermaid" ? figure(fence.lines) : codeFold(fence.lines));
				fence = null;
			} else fence.lines.push(raw);
			continue;
		}
		if (line.startsWith("```")) {
			flush();
			fence = { lang: line.slice(3).trim(), lines: [] };
			continue;
		}
		if (/^\|.*\|$/.test(line)) {
			if (list) flush();
			if (!/^\|[\s:|-]+\|$/.test(line)) (table ??= []).push(line.slice(1, -1).split("|").map(c => c.trim()));
			continue;
		}
		const item = /^([-*]|\d+\.)\s+(.*)/.exec(line);
		if (item) {
			const tag = /\d/.test(item[1]) ? "ol" : "ul";
			// Un ítem con sangría cuelga del anterior: "Detalles chicos:" y abajo sus detalles.
			const padre = /^(\s{2,}|\t)/.test(raw) ? list?.items.at(-1) : null;
			if (padre) {
				padre.subTag ??= tag;
				padre.subs.push(item[2]);
				continue;
			}
			if (list?.tag !== tag) {
				flush();
				list = { tag, items: [], start: Number.parseInt(item[1], 10) };
			}
			list.items.push({ text: item[2], subs: [] });
			continue;
		}
		if (!line && list) continue;
		flush();
		if (!line) continue;
		const head = /^(#{1,4})\s+(.*)/.exec(line);
		out.push(head ? `<h3 class="h${head[1].length}">${inline(head[2])}</h3>` : `<p>${inline(line)}</p>`);
	}
	flush();
	if (nota) out.push(notaHtml(nota[1], Number(nota[2]), nota[3], ""));
	if (fence) out.push(codeFold(fence.lines));
	return out.join("");
}

/** Un mensaje largo se lee en varias burbujas: una por idea, con su lista pegada. */
function blocksOf(text) {
	const out = [];
	let inCode = false;
	for (const block of String(text ?? "").trim().split(/\n\s*\n/)) {
		const isList = /^\s*([-*]|\d+\.)\s/.test(block);
		if (inCode) out[out.length - 1] += `\n\n${block}`;
		else if (isList && out.length) out[out.length - 1] += `\n${block}`;
		else out.push(block);
		if ((block.match(/^\s*```/gm) ?? []).length % 2) inCode = !inCode;
	}
	return out;
}

function ago(iso) {
	const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
	if (min < 1) return "Recién";
	if (min < 60) return `Hace ${min} min`;
	if (min < 1440) return `Hace ${Math.round(min / 60)} h`;
	return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

/** Solo toca el DOM si algo cambió: sin parpadeos y sin perder el foco. */
const painted = {};
function setHtml(id, html) {
	const el = document.getElementById(id);
	if (el && (painted[id] !== html || !el.innerHTML)) {
		el.innerHTML = html;
		painted[id] = html;
	}
}

const avatar = (a, size = "sm") => `<img class="av ${size}" src="/avatar/${a.id}.svg?v=2" alt="">`;
const hora = iso => new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
const nombre = d => (d === "sistemas" ? "Ops y Sistemas" : d ? d[0].toUpperCase() + d.slice(1) : "");

let state = { agents: [], requests: [], kpis: [], readings: [], ceo: [], login: true };
let view = { type: "tablero" };
const ENTREGA_RECIENTE = 60_000;
let messages = [];
let sending = [];
let openFile = null;
const changing = new Map();

function stored(key, fallback) {
	try {
		return JSON.parse(localStorage.getItem(key)) ?? fallback;
	} catch {
		return fallback;
	}
}

function store(key, value) {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// Sin almacenamiento, vale hasta recargar.
	}
}

// Lo que estabas escribiendo en cada chat queda guardado en esta compu: irte a otro chat no lo borra.
const BORRADOR_DIAS = 14;
const claveEscrito = cual => (cual === "juan-input" ? `juan:${state.carpeta?.id ?? ""}:${juanAbierto ?? "nuevo"}` : `${state.carpeta?.id ?? ""}:${tabKey(view)}`);
function leerEscrito(cual) {
	const b = stored("borradores", {})[claveEscrito(cual)];
	return b && Date.now() - b.at < BORRADOR_DIAS * 86_400_000 ? b.texto : "";
}
function guardarEscrito(cual, texto) {
	const todos = stored("borradores", {});
	const clave = claveEscrito(cual);
	if (texto.trim()) todos[clave] = { texto, at: Date.now() };
	else delete todos[clave];
	for (const [k, b] of Object.entries(todos)) if (Date.now() - b.at > BORRADOR_DIAS * 86_400_000) delete todos[k];
	store("borradores", todos);
}
/** Si la caja está vacía y hay algo guardado para este chat, vuelve a aparecer. */
function devolverEscrito(cual) {
	const caja = document.getElementById(cual);
	if (!caja || caja.value) return;
	const texto = leerEscrito(cual);
	if (!texto) return;
	caja.value = texto;
	grow(caja);
	if (cual === "input") pintarEspejo(caja);
}

let ceoReadAt = stored("ceoReadAt", "");
let inboxFilter = "todo";
const elegidos = new Set();
let aprobando = "";
let openItem = null;
let autoOpen = null;
const closedItems = new Set();
const isOpen = id => openItem === id || (autoOpen === id && !closedItems.has(id));
let carpeta = stored("carpeta", "");
let carpetasOpen = false;
let tabs = stored("tabs", []);

// Lo que escribís vos en #ceo no es nuevo para vos.
const unreadCeo = () => state.ceo.filter(p => p.at > ceoReadAt && p.agentId !== "dueno");
/** Leído no es decidido: lo que espera tu OK sigue en la Bandeja, pero deja de contar como nuevo. */
let inboxReadAt = stored("inboxReadAt", "");
const newInbox = () => [...pending(), ...proposed()].filter(x => (x.at ?? "") > inboxReadAt);
const pending = () => state.requests.filter(r => r.state === "pendiente");
const proposed = () => state.kpis.filter(k => k.state === "propuesta");
const activeAgent = () => state.agents.find(a => a.id === view.id);

const MENU = [
	["equipo", "users", "Equipo"],
	["biblioteca", "book-open", "Biblioteca"],
	["tickets", "ticket", "Tickets"],
	["rutinas", "clock", "Rutinas"],
	["uso", "gauge", "Uso"],
	["decisiones", "scale", "Decisiones"],
	["actividad", "activity", "Actividad"],
];

const menuHtml = () =>
	`<div class="menu" role="menu">${MENU.map(([id, icon, label]) => `<button class="mi" role="menuitem" data-view="${id}">${ic(icon)}${label}</button>`).join("")}<div class="msep"></div><button class="mi" role="menuitem" data-view="ajustes">${ic("settings")}Configuración</button></div>`;

/** Las carpetas de la barra quedan como las dejó cada persona. */
const shutGroups = new Set(stored("shutGroups", []));
const groupHtml = (key, name, rows) => {
	const shut = shutGroups.has(key);
	return `<div class="grp ${shut ? "shut" : ""}"><button class="row" data-group="${esc(key)}" aria-expanded="${!shut}">${ic("folder")}${esc(name)}${ic("chevron-up")}</button>${rows}</div>`;
};

/** Las pestañas de arriba. Ventas, Equipo, Roadmap y Juan IA abren las vistas de siempre. */
function pestana(id, texto, extraHtml = "", activas = [id]) {
	const on = activas.includes(view.type);
	return `<button class="tbt ${on ? "on" : ""}" data-view="${id}" ${on ? 'aria-current="page"' : ""}>${texto}${extraHtml}</button>`;
}

const esVistaDeChat = () => view.type === "agent" || view.type === "ceo";


// Un error de la pantalla va al registro central (el panel web de licencias), como los del servidor. Tope por sesión:
// un error en loop no manda mil avisos.
let erroresMandados = 0;
function avisarErrorPantalla(mensaje, donde) {
	if (erroresMandados >= 20 || !mensaje) return;
	erroresMandados += 1;
	fetch("/errores", { method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ mensaje: String(mensaje).slice(0, 500), donde: String(donde ?? "").slice(0, 120) }) }).catch(() => {});
}
addEventListener("error", e => avisarErrorPantalla(e.message, `${(e.filename ?? "").split("/").pop()}:${e.lineno ?? ""} · ${view?.type ?? ""}`));
addEventListener("unhandledrejection", e => avisarErrorPantalla(e.reason?.message ?? e.reason, `promesa · ${view?.type ?? ""}`));
