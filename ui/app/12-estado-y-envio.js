async function loadState() {
	const res = await api("/state");
	// La carpeta guardada ya no existe: se vuelve a la principal.
	if (res.status === 404 && carpeta) {
		carpeta = "";
		store("carpeta", "");
		return loadState();
	}
	if (!res.ok) return;
	const before = state.claudeLogin?.state;
	const old = state;
	state = await res.json();
	avisoVersion();
	licenciaLocal();
	if (booted) soundFor(old, state);
	// Lo que entrega el agente del chat abierto se abre solo, sin ir a buscarlo. Si ya estás mirando otra cosa, no se te pisa.
	if (booted && view.type === "agent" && !document.getElementById("file").innerHTML) {
		const nueva = state.requests?.find(r => r.kind === "entrega" && r.file && r.agentId === view.id && Date.now() - new Date(r.at) < ENTREGA_RECIENTE && !old.requests?.some(o => o.id === r.id));
		if (nueva) void showFile(nueva.file);
	}
	if (!booted) {
		booted = true;
		if (!state.settings.onboarding.done) {
			onb = state.settings.onboarding;
			document.querySelector(".app").classList.add("onboarding");
			view = { type: "onboarding" };
			renderShell();
			void loadOnbData();
		} else if (carpeta && state.carpeta?.onboarding && !state.carpeta.onboarding.done) {
			entrarOnbCliente(state.carpeta.onboarding);
		}
	}
	if (before === "waiting" && state.claudeLogin?.state === "done") void loadExtra();
	if (view.type === "agent" && !activeAgent() && state.settings.onboarding.done) {
		const first = state.agents.find(a => a.role === "asistente");
		if (first || carpeta) {
			go({ type: "tablero" });
			return;
		}
	}
	renderSide();
	renderHead();
	renderBody();
}

async function loadMessages() {
	if (view.type === "bandeja") return cargarHiloBandeja();
	if (view.type !== "agent" || !view.id) return;
	const res = await api(`/agents/${view.id}/messages`);
	if (!res.ok) return;
	messages = await res.json();
	sending = sending.filter(s => !messages.some(m => m.role === "user" && (m.text === s.text || m.text.startsWith(`${s.text}${SEPARA_JUAN}`) || m.text.startsWith(`${s.text}${SEPARA_JEREMY}`))));
	renderBody();
}

/** Imágenes por adjuntar: con el botón, pegando o arrastrando. */
const attached = [];

const esImagen = ruta => /\.(png|jpe?g|gif|webp)$/i.test(ruta);
/** Los audios se pasan a texto al adjuntarlos: así los entiende cualquier agente. */
const AUDIO = /\.(mp3|m4a|wav|ogg|oga|opus|aac|amr|webm)$/i;
const lineasAdjuntos = lista => lista.flatMap(i => (esImagen(i.path) ? [`[Imagen adjunta: ${i.path}]`] : [`[Archivo adjunto: ${i.path} | ${i.nombre}]`, ...(i.texto && i.texto !== "haciendo" ? [`[Archivo adjunto: ${i.texto} | Transcripción de ${i.nombre}]`] : [])]));
/** Mientras un audio se está pasando a texto no se manda: llegaría sin lo que dice. */
function audiosEnCamino() {
	if (!attached.some(a => a.texto === "haciendo")) return false;
	avisoDeVoz("Esperá a que el audio termine de pasarse a texto.");
	return true;
}
async function pasarATexto(a) {
	a.texto = "haciendo";
	paintThumbs();
	const res = await api("/attachments/texto", { method: "POST", body: JSON.stringify({ path: a.path }) }).catch(() => null);
	const r = await res?.json().catch(() => null);
	a.texto = res?.ok ? r.path : null;
	if (!res?.ok) a.falla = r?.error ?? "No se pudo pasar a texto.";
	paintThumbs();
}

/** Lo que el dueño citó desde el roadmap para pedir un cambio: viaja con el próximo mensaje al Asistente. */
let citaChat = null;

function adjuntosHtml() {
	const quitar = i => `<button type="button" data-thumb-x="${i}" aria-label="Sacar archivo">${ic("x")}</button>`;
	return attached
		.map((a, i) => {
			if (esImagen(a.path)) return `<span class="thumb"><img src="${esc(a.url)}" alt="">${quitar(i)}</span>`;
			const estado = a.texto === "haciendo" ? "Pasando a texto…" : a.falla ? esc(a.falla) : a.texto ? "Pasado a texto" : "";
			return `<span class="adjunto ${a.falla ? "mal" : ""}"><span class="doc">${ic(AUDIO.test(a.path) ? "mic" : "file-text")}</span><span class="ftext"><b>${esc(a.nombre)}</b>${estado ? `<small>${estado}</small>` : ""}</span>${quitar(i)}</span>`;
		})
		.join("");
}

function paintThumbs() {
	if (view.type === "bandeja") return renderBody();
	const box = document.getElementById("thumbs");
	if (!box) return;
	const cita = citaChat && view.type === "agent" ? `<span class="cita">${ic("pencil")}<span class="ftext"><small>Cambio en</small><b>${esc(citaChat.titulo)}</b></span><button type="button" data-cita-x aria-label="Sacar la cita">${ic("x")}</button></span>` : "";
	box.innerHTML = cita + adjuntosHtml();
}

async function attachFiles(files) {
	for (const file of files) {
		const name = file.name || `imagen.${file.type.split("/")[1]}`;
		const res = await api(`/attachments?name=${encodeURIComponent(name)}`, { method: "POST", body: file });
		if (res.ok) {
			const a = await res.json();
			attached.push(a);
			if (AUDIO.test(a.path)) void pasarATexto(a);
		}
		else avisar(`No se pudo adjuntar ${name}`, (await res.json().catch(() => ({}))).error ?? "Probá de nuevo.");
	}
	paintThumbs();
}

document.addEventListener("click", e => {
	if (e.target.closest("#attach")) document.getElementById("attach-input").click();
	if (e.target.closest("[data-bw-adjuntar]")) document.getElementById("bw-archivo")?.click();
	const x = e.target.closest("[data-thumb-x]");
	if (x) {
		attached.splice(Number(x.dataset.thumbX), 1);
		paintThumbs();
	}
});
document.addEventListener("change", e => {
	if (e.target.id !== "attach-input" && e.target.id !== "bw-archivo") return;
	void attachFiles([...e.target.files]);
	e.target.value = "";
});
document.addEventListener("paste", e => {
	const files = [...(e.clipboardData?.files ?? [])];
	if ((e.target.id === "input" || e.target.id === "juan-input" || e.target.id === "bw-input") && files.length) {
		e.preventDefault();
		void attachFiles(files);
	}
});
for (const type of ["dragover", "drop"]) {
	document.addEventListener(type, e => {
		if (!e.target.closest?.(".composer,#body") || !(document.getElementById("input") || document.getElementById("juan-input")) || !e.dataTransfer?.types.includes("Files")) return;
		e.preventDefault();
		if (type === "drop") void attachFiles([...e.dataTransfer.files]);
	});
}

/** Panel a la derecha, el mismo de los archivos. */
function sidePanel(title, html) {
	document.getElementById("file").innerHTML = `<aside class="filepanel"><div class="p-head"><span class="doc">${ic("file-text")}</span><span>${esc(title)}</span><button class="ic" data-close-file aria-label="Cerrar">${ic("x")}</button></div><div class="p-list">${html}</div></aside>`;
}

document.addEventListener("click", async e => {
	const a = activeAgent();
	if (!a) return;
	if (e.target.closest("[data-agent-files]")) {
		const res = await api(`/agents/${a.id}/files`);
		const files = res.ok ? await res.json() : [];
		sidePanel(`Archivos de ${a.name}`, files.length ? files.map(f => `<button class="prow" data-file="${esc(f.path)}">${esc(f.name)}</button>`).join("") : `<p class="muted">Todavía no guardó archivos.</p>`);
	}
	if (e.target.closest("[data-agent-log]")) {
		const said = (state.comms ?? []).filter(c => c.from === a.id || c.to === a.id).slice(-30).reverse();
		const mine = (state.tickets ?? []).filter(t => t.owner === a.id);
		const waits = state.beats?.[a.id]?.checks ?? [];
		const list = [...waits.map(w => `<div class="prow"><b>Espera</b> ${esc(w)}</div>`), ...mine.map(t => `<div class="prow"><b>${t.id}</b> ${esc(t.title)} · ${t.state}</div>`), ...said.map(c => `<div class="prow"><b>${esc(who(c.from))} → ${esc(who(c.to))}</b> ${esc(c.text.slice(0, 120))}<small>${ago(c.at)}</small></div>`)];
		sidePanel(`Actividad de ${a.name}`, list.join("") || `<p class="muted">Sin actividad todavía.</p>`);
	}
	if (e.target.closest("[data-agent-card]")) {
		const id = a.id;
		document.querySelector('.side [data-view="equipo"]').click();
		agentEdit = id;
		renderBody();
	}
});

async function send() {
	const input = document.getElementById("input");
	if (!input) return;
	const typed = input.value.trim();
	if (audiosEnCamino()) return;
	const images = attached.splice(0);
	paintThumbs();
	const cita = view.type === "agent" && citaChat && (typed || images.length) ? citaChat : null;
	if (cita) {
		citaChat = null;
		paintThumbs();
	}
	const text = [cita ? `Cambio en «${cita.titulo}» (${cita.ref}):` : "", typed || (images.length ? "Mirá esto." : ""), ...lineasAdjuntos(images)].filter(Boolean).join("\n\n");
	if (text && view.type === "ceo") {
		guardarEscrito("input", "");
		input.value = "";
		input.style.height = "auto";
		pintarEspejo(input);
		await api("/ceo", { method: "POST", body: JSON.stringify({ text }) });
		return loadState();
	}
	if (!text || !view.id) return;
	guardarEscrito("input", "");
	input.value = "";
	input.style.height = "auto";
	pintarEspejo(input);
	sending.push({ role: "user", text });
	estadoScroll.body.pegado = true;
	renderBody();
	const res = await api(`/agents/${view.id}/order`, { method: "POST", body: JSON.stringify({ text }) });
	// Etiquetaron a Jeremy sin tenerlo conectado: el mensaje vuelve a la caja y se dice qué falta.
	if (res.status === 409) {
		sending = sending.filter(s => s.text !== text);
		input.value = typed;
		attached.push(...images);
		paintThumbs();
		grow(input);
		pintarEspejo(input);
		renderBody();
		const error = (await res.json().catch(() => ({}))).error ?? "No se pudo mandar";
		document.querySelector("[data-auto-quita]")?.remove();
		document.querySelector(".composer")?.insertAdjacentHTML("afterbegin", `<div class="mpop merr" role="alert" data-auto-quita>${esc(error)}</div>`);
		setTimeout(() => document.querySelector("[data-auto-quita]")?.remove(), 6000);
	}
}

// El marco aislado no manda la sesión: la app baja la página y se la pasa ya escrita.
async function showPage(path) {
	const res = await api(`/media/pagina?path=${encodeURIComponent(path)}`);
	const html = res.ok ? await res.text() : "<p>No se pudo abrir esta página.</p>";
	const bajar = URL.createObjectURL(new Blob([html], { type: "text/html" }));
	openFile = path;
	document.getElementById("file").innerHTML = `<aside class="filepanel page"><div class="p-head"><span class="doc">${ic("file-text")}</span><span><b>${esc(path.split("/").at(-2) ?? "Página")}</b></span><span class="sp"></span><button class="b ghost" data-page-width="390">Celular</button><button class="b ghost" data-page-width="">Compu</button><button class="b ghost" data-ver-afuera="${esc(path)}">Abrir en el navegador</button><a class="b" href="${bajar}" download="index.html">Descargar</a><button class="b ghost" data-close-file>Cerrar</button></div><div class="pagebox"><iframe title="Vista de la página" sandbox="allow-scripts allow-forms"></iframe></div></aside>`;
	document.querySelector(".pagebox iframe").srcdoc = html;
}

// Un Word o un Excel no se pueden leer como texto: se muestra su vista y se baja el archivo.
async function showDocument(path) {
	const vista = vistaDe(path);
	const res = await api(`/media/documento?path=${encodeURIComponent(path)}`);
	const bajar = res.ok ? URL.createObjectURL(await res.blob()) : "";
	openFile = path;
	const nombre = path.split("/").at(-1);
	document.getElementById("file").innerHTML = `<aside class="filepanel page"><div class="p-head"><span class="doc">${ic("file-text")}</span><span><b>${esc(nombre)}</b></span><span class="sp"></span>${bajar ? `<a class="b" href="${bajar}" download="${esc(nombre)}">Descargar</a>` : ""}<button class="b ghost" data-close-file>Cerrar</button></div><div class="docbox">${bajar ? `<img alt="Vista de ${esc(nombre)}" src="/media/archivo?path=${encodeURIComponent(vista)}">` : `<p class="muted">No se pudo abrir este archivo.</p>`}</div></aside>`;
}

function showMedia(path) {
	const src = `/media/archivo?path=${encodeURIComponent(path)}`;
	const nombre = path.split("/").at(-1);
	const tipo = path.split(".").at(-1).toLowerCase();
	const pieza = /mp4|mov/.test(tipo) ? `<video src="${src}" controls></video>` : /mp3|m4a/.test(tipo) ? `<audio src="${src}" controls></audio>` : `<img alt="${esc(nombre)}" src="${src}">`;
	openFile = path;
	document.getElementById("file").innerHTML = `<aside class="filepanel page"><div class="p-head"><span class="doc">${ic("file-text")}</span><span><b>${esc(nombre)}</b></span><span class="sp"></span><a class="b" href="${src}" download="${esc(nombre)}">Descargar</a><button class="b ghost" data-close-file>Cerrar</button></div><div class="docbox">${pieza}</div></aside>`;
	// Si el archivo no está, se dice en vez de mostrar un reproductor vacío en 0:00.
	document.querySelector("#file .docbox > *")?.addEventListener("error", () => {
		const caja = document.querySelector("#file .docbox");
		if (caja) caja.innerHTML = `<p class="muted">Este archivo no está en la carpeta: todavía no se creó o se borró.</p>`;
		document.querySelector("#file a[download]")?.remove();
		existeArchivo.set(path, { ok: false, at: Date.now() });
		lastBody = "";
		renderBody();
	});
}

async function showFile(path) {
	if (/\.(png|jpe?g|webp|gif|mp4|mov|mp3|m4a)$/i.test(path)) return showMedia(path);
	if (/\.html$/i.test(path)) return showPage(path);
	if (/\.(docx|xlsx|pptx|pdf)$/i.test(path)) return showDocument(path);
	const res = await api(`/file?path=${encodeURIComponent(path)}`);
	const text = res.ok ? await res.text() : "No se pudo abrir este archivo.";
	openFile = path;
	docAbierto = /\.(md|markdown)$/i.test(path) ? { path, text } : null;
	document.getElementById("file").innerHTML = `<aside class="filepanel"><div class="p-head"><span class="doc">${ic("file-text")}</span><span><b>${esc(path.split("/").at(-1))}</b></span><span class="sp"></span><button class="b ghost" data-close-file>Cerrar</button></div>${docAbierto ? `<div class="docview">${md(text)}</div>` : `<pre>${esc(text)}</pre>`}</aside>`;
}

/** Un documento abierto se vuelve a pintar cuando termina de dibujarse un diagrama suyo: si no, queda la caja vacía. */
let docAbierto = null;
function repintarDoc() {
	const caja = document.querySelector("#file .docview");
	if (!caja || !docAbierto || openFile !== docAbierto.path) return;
	const html = md(docAbierto.text);
	if (caja.innerHTML !== html) caja.innerHTML = html;
}

document.addEventListener("change", e => {
	const uno = e.target.dataset?.elegir;
	if (uno) e.target.checked ? elegidos.add(uno) : elegidos.delete(uno);
	else if ("elegirTodo" in (e.target.dataset ?? {})) {
		elegidos.clear();
		if (e.target.checked) for (const r of pending()) elegidos.add(r.id);
	} else return;
	lastBody = "";
	renderBody();
});

/** En orden y de a uno: lo que pide un agente puede depender de lo anterior. Antes se ve qué se está aprobando. */
document.addEventListener("click", async e => {
	if (!e.target.closest("[data-aprobar-elegidos]") || aprobando) return;
	const lista = pending().filter(r => elegidos.has(r.id));
	const veces = new Map();
	for (const r of lista) veces.set(r.title, (veces.get(r.title) ?? 0) + 1);
	if (!confirm(`Vas a aprobar ${lista.length}. Se hacen de verdad:\n\n${[...veces].map(([t, n]) => `${n} × ${t}`).join("\n")}`)) return;
	let fallaron = 0;
	for (const [i, r] of lista.entries()) {
		aprobando = `Aprobando ${i + 1} de ${lista.length}…`;
		lastBody = "";
		renderBody();
		const res = await api(`/requests/${r.id}/aprobar`, { method: "POST", body: "{}" });
		if (res.ok) elegidos.delete(r.id);
		else fallaron += 1;
	}
	aprobando = "";
	await loadState();
	lastBody = "";
	renderBody();
	if (fallaron) alert(`${fallaron} no se pudieron aprobar. Quedaron seleccionados.`);
});

/** Limpiar la Bandeja: lo elegido sale sin ejecutarse y sin avisarle a nadie. */
document.addEventListener("click", async e => {
	if (!e.target.closest("[data-descartar-elegidos]") || aprobando) return;
	const lista = pending().filter(r => elegidos.has(r.id));
	if (!lista.length || !confirm(`Vas a descartar ${lista.length}. No se hacen y salen de la Bandeja, sin avisarle al equipo.`)) return;
	aprobando = `Descartando ${lista.length}…`;
	lastBody = "";
	renderBody();
	await Promise.all(lista.map(r => api(`/requests/${r.id}/descartar`, { method: "POST", body: "{}" }).then(res => res.ok && elegidos.delete(r.id))));
	aprobando = "";
	await loadState();
	lastBody = "";
	renderBody();
});

