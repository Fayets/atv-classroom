// Hablarle al equipo: se graba en la app y va como una nota de voz que se puede volver a escuchar. Al agente le llega lo que dice.
// La barra vive afuera de la caja: las pantallas se vuelven a pintar solas y no pueden cortar una grabación.
let voz = null;
const VOZ_MAX_MS = 15 * 60_000;
const NOTA_BARRAS = 34;
/** La onda se corre sola (la mueve la placa, no el código): aunque la app esté ocupada, no se traba. */
const ONDA = { px: 62, cada: 62, ancho: 3 };
const vozReloj = s => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, "0")}`;
const puedeGrabar = () => Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
// Es una función de las pantallas: se usa recién cuando pintan, con todo cargado.
function botonVoz(caja) {
	return puedeGrabar() ? `<button type="button" class="ic vozb" data-voz="${caja}" data-tip="Grabar un audio" aria-label="Grabar un audio">${ic("mic")}</button>` : "";
}

function avisoDeVoz(texto) {
	document.querySelector(".vozaviso")?.remove();
	document.body.insertAdjacentHTML("beforeend", `<div class="vozaviso" role="alert">${esc(texto)}</div>`);
	setTimeout(() => document.querySelector(".vozaviso")?.remove(), 6000);
}

/** A quién le habla. Se decide al empezar: si después mira otro chat, el audio va igual a donde lo grabó. */
function destinoDeVoz(caja) {
	if (caja === "juan-input") return { tipo: "juan", chat: juanAbierto, proyecto: proyectoElegido() };
	if (caja === "tb-input") return { tipo: "tablero", id: state.agents.find(a => a.role === "asistente")?.id };
	if (caja === "bw-input") return bandejaChat === "ceo" ? { tipo: "ceo", carpeta } : { tipo: "bandeja", id: bandejaChat };
	return view.type === "ceo" ? { tipo: "ceo", carpeta } : { tipo: "agente", id: view.id };
}

async function grabarVoz(caja) {
	if (voz) return;
	const v = (voz = { caja, destino: destinoDeVoz(caja), paso: "pidiendo", pedazos: [], pico: 0, niveles: [] });
	// La barra aparece ya, sin esperar al micrófono.
	abrirBarraDeVoz();
	let flujo;
	try {
		flujo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
	} catch (e) {
		soltarVoz();
		return avisoDeVoz(e.name === "NotFoundError" ? "No se encontró ningún micrófono en esta compu." : navigator.platform.startsWith("Mac") ? "Falta el permiso del micrófono. Se da en Ajustes del Sistema, Privacidad y seguridad, Micrófono." : "Falta el permiso del micrófono. Se da en Configuración, Privacidad, Micrófono.");
	}
	// La descartó mientras pedía permiso.
	if (voz !== v) return flujo.getTracks().forEach(t => t.stop());
	const tipo = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(t => MediaRecorder.isTypeSupported(t));
	const mr = new MediaRecorder(flujo, tipo ? { mimeType: tipo, audioBitsPerSecond: 32_000 } : undefined);
	const contexto = new AudioContext();
	const oido = contexto.createAnalyser();
	oido.fftSize = 2048;
	contexto.createMediaStreamSource(flujo).connect(oido);
	void contexto.resume().catch(() => {});
	mr.ondataavailable = e => e.data.size && v.pedazos.push(e.data);
	mr.start(1000);
	Object.assign(v, { paso: "grabando", flujo, mr, contexto, oido, desde: performance.now(), muestras: new Uint8Array(oido.fftSize) });
	document.getElementById("vozbar")?.classList.add("va");
	const tira = document.querySelector("#vozbar .vozt2");
	v.tira = tira;
	if (tira && !matchMedia("(prefers-reduced-motion:reduce)").matches) tira.animate([{ transform: "translate3d(0,0,0)" }, { transform: `translate3d(${(-ONDA.px * VOZ_MAX_MS) / 1000}px,0,0)` }], { duration: VOZ_MAX_MS, fill: "forwards" });
	v.reloj = setInterval(seguirVoz, 250);
	v.medidor = setInterval(medirVoz, 31);
}

function abrirBarraDeVoz() {
	document.body.insertAdjacentHTML("beforeend", `<div class="vozbar" id="vozbar" role="dialog" aria-label="Grabando un audio"><button type="button" class="vozx" data-voz-x aria-label="Descartar">${ic("x")}</button><i class="vozp" aria-hidden="true"></i><b id="vozt" role="timer">0:00</b><span class="vozo" aria-hidden="true"><span class="vozt2"></span></span><span class="vozm" id="vozm" hidden></span><button type="button" class="vozr" data-voz-fin="revisar">Revisar</button><button type="button" class="vozs" data-voz-fin="mandar" aria-label="Mandar el audio">${ic("arrow-up")}</button></div>`);
	ubicarVoz();
}
/** La barra va arriba de la caja donde se escribe. Se mide de vez en cuando, no en cada cuadro. */
function ubicarVoz() {
	const barra = document.getElementById("vozbar");
	const forma = voz && document.getElementById(voz.caja)?.closest("form");
	if (!barra) return;
	const r = forma?.getBoundingClientRect() ?? { left: innerWidth / 2 - 300, width: 600, bottom: innerHeight - 12, height: 60 };
	// En la caja chica la tapa; en la grande queda adentro, abajo.
	const ancho = Math.min(Math.max(r.width - (r.height > 90 ? 16 : 0), 300), innerWidth - 16);
	const lugar = [Math.max(8, Math.min(r.left + (r.width - ancho) / 2, innerWidth - ancho - 8)), ancho, Math.max(8, innerHeight - r.bottom + Math.min(8, (r.height - 60) / 2))].map(Math.round);
	if (String(lugar) === voz?.lugar) return;
	if (voz) voz.lugar = String(lugar);
	Object.assign(barra.style, { left: `${lugar[0]}px`, width: `${lugar[1]}px`, bottom: `${lugar[2]}px` });
}
function seguirVoz() {
	if (voz?.paso !== "grabando") return;
	ubicarVoz();
	const ms = performance.now() - voz.desde;
	const t = document.getElementById("vozt");
	const reloj = vozReloj(ms / 1000);
	if (t && t.textContent !== reloj) t.textContent = reloj;
	// Las barras que ya pasaron se sacan de a tandas.
	const viejas = voz.tira ? [...voz.tira.children].slice(0, -110) : [];
	if (viejas.length > 40) for (const b of viejas) b.remove();
	if (ms > VOZ_MAX_MS) void terminarVoz("revisar");
}
/** Cada tanto entra una barra por la derecha, crecida hasta lo fuerte que habló. */
function medirVoz() {
	if (voz?.paso !== "grabando") return;
	voz.oido.getByteTimeDomainData(voz.muestras);
	let pico = 0;
	for (const x of voz.muestras) pico = Math.max(pico, Math.abs(x - 128) / 128);
	voz.pico = Math.max(voz.pico, pico);
	voz.nivel = Math.max(voz.nivel ?? 0, pico);
	const ms = performance.now() - voz.desde;
	if (ms - (voz.ultima ?? 0) >= ONDA.cada) {
		const nivel = voz.nivel;
		voz.niveles.push(nivel);
		voz.nivel = 0;
		voz.ultima = ms;
		if (voz.tira) {
			const b = document.createElement("i");
			b.style.left = `calc(100% + ${((ms * ONDA.px) / 1000).toFixed(1)}px)`;
			b.style.height = `${Math.round(Math.max(3, Math.min(1, nivel * 1.9) * 30))}px`;
			voz.tira.append(b);
		}
	}
}

function soltarVoz() {
	clearInterval(voz?.reloj);
	clearInterval(voz?.medidor);
	voz?.flujo?.getTracks().forEach(t => t.stop());
	void voz?.contexto?.close().catch(() => {});
	const barra = document.getElementById("vozbar");
	if (barra) {
		barra.removeAttribute("id");
		barra.classList.add("sale");
		setTimeout(() => barra.remove(), 160);
	}
	voz = null;
}

/** Los niveles de toda la grabación, en pocas letras: con eso se dibuja la onda del mensaje. */
function ondaDe(niveles) {
	const max = Math.max(0.05, ...niveles);
	return Array.from({ length: NOTA_BARRAS }, (_x, i) => {
		const a = Math.floor((i * niveles.length) / NOTA_BARRAS);
		const tramo = niveles.slice(a, Math.max(a + 1, Math.floor(((i + 1) * niveles.length) / NOTA_BARRAS)));
		return String.fromCharCode(97 + Math.round((Math.max(0, ...tramo) / max) * 25));
	}).join("");
}

async function terminarVoz(como) {
	if (voz?.paso !== "grabando") return;
	const v = voz;
	v.paso = "pasando";
	const duro = performance.now() - v.desde;
	await new Promise(ok => {
		v.mr.onstop = ok;
		v.mr.stop();
	});
	v.flujo.getTracks().forEach(t => t.stop());
	if (voz !== v) return;
	// Un pico en cero es que el medidor no anduvo: ahí no se puede decir que no hubo voz.
	if (duro < 700 || (v.pico > 0 && v.pico < 0.02)) {
		soltarVoz();
		return avisoDeVoz(duro < 700 ? "El audio quedó muy corto. Tocá el micrófono, hablá y mandalo." : "No se escuchó nada. Fijate que el micrófono sea el correcto.");
	}
	const audio = new Blob(v.pedazos, { type: v.mr.mimeType });
	const crudo = { method: "POST", body: audio, headers: { "content-type": "application/octet-stream" } };
	const pedir = async (ruta, opciones) => {
		const res = await api(ruta, opciones).catch(() => null);
		const r = await res?.json().catch(() => null);
		return res?.ok && r ? r : { error: r?.error ?? "No se pudo pasar el audio a texto. Probá de nuevo." };
	};
	if (como === "revisar") {
		const barra = document.getElementById("vozbar");
		barra?.classList.add("pasando");
		for (const b of barra?.querySelectorAll("[data-voz-fin]") ?? []) b.disabled = true;
		const aviso = document.getElementById("vozm");
		if (aviso) Object.assign(aviso, { hidden: false, textContent: "Pasando a texto…" });
		const r = await pedir("/attachments/voz", crudo);
		// La descartó mientras se pasaba a texto.
		if (voz !== v) return;
		soltarVoz();
		if (r.error || !r.texto) return avisoDeVoz(r.error ?? "No se entendió lo que dice el audio. Probá de nuevo.");
		const caja = document.getElementById(v.caja);
		if (!caja) return avisoDeVoz(`Cambiaste de pantalla. El audio decía: ${r.texto.slice(0, 300)}`);
		caja.value = [caja.value.trim(), r.texto].filter(Boolean).join("\n");
		caja.dispatchEvent(new Event("input", { bubbles: true }));
		return caja.focus();
	}
	soltarVoz();
	const nota = await pedir("/attachments/nota", crudo);
	if (nota.error) return avisoDeVoz(nota.error);
	await mandarNota(v.destino, nota.path, `[Nota de voz: ${nota.path} | ${Math.max(1, Math.round(duro / 1000))} | ${ondaDe(v.niveles)}]`, pedir);
}

/** El mensaje aparece enseguida, como audio. Lo que dice se agrega cuando termina de pasarse a texto y ahí le llega al agente. */
async function mandarNota(d, archivo, marca, pedir) {
	const cita = d.tipo === "agente" && citaChat ? citaChat : null;
	if (cita) {
		citaChat = null;
		paintThumbs();
	}
	const arriba = cita ? `Cambio en «${cita.titulo}» (${cita.ref}):\n\n` : "";
	const enviando = { role: "user", text: `${arriba}${marca}` };
	const enBandeja = { chat: d.tipo === "ceo" ? "ceo" : d.id, text: enviando.text, at: new Date().toISOString() };
	const enJuan = { id: d.chat, marca };
	const sacar = () => {
		sending = sending.filter(s => s !== enviando);
		if (bwEnviando.includes(enBandeja)) bwEnviando.splice(bwEnviando.indexOf(enBandeja), 1);
		if (juanEnviando === enJuan) juanEnviando = null;
		lastBody = "";
		renderBody();
	};
	if (d.tipo === "agente" && view.id === d.id) {
		sending.push(enviando);
		estadoScroll.body.pegado = true;
	}
	if (d.tipo === "bandeja" || d.tipo === "ceo") {
		bwEnviando.push(enBandeja);
		bwBajarHasta = Date.now() + 15_000;
	}
	if (d.tipo === "juan") {
		juanEnviando = enJuan;
		estadoScroll.juan.pegado = true;
	}
	if (d.tipo === "tablero" && d.id) {
		go({ type: "agent", id: d.id });
		sending.push(enviando);
	}
	lastBody = "";
	renderBody();
	const r = await pedir("/attachments/nota/texto", { method: "POST", body: JSON.stringify({ path: archivo }) });
	if (r.error) {
		sacar();
		return avisoDeVoz(r.error);
	}
	const texto = `${arriba}${marca}\n${r.texto}`;
	enviando.text = enBandeja.text = texto;
	if (d.tipo === "ceo") {
		// Si abrió otra carpeta, no se publica en el canal equivocado.
		if (d.carpeta !== carpeta) {
			sacar();
			return avisoDeVoz(`Cambiaste de carpeta y el audio no se mandó. Decía: ${r.texto.slice(0, 300)}`);
		}
		await api("/ceo", { method: "POST", body: JSON.stringify({ text: texto }) });
		await loadState();
		return sacar();
	}
	const res = d.tipo === "juan" ? await api("/juan/chats", { method: "POST", body: JSON.stringify({ texto, chat: d.chat ?? undefined, proyecto: d.proyecto || undefined }) }).catch(() => null) : await api(`/agents/${d.id}/order`, { method: "POST", body: JSON.stringify({ text: texto }) }).catch(() => null);
	const cuerpo = await res?.json().catch(() => ({}));
	if (!res?.ok) {
		sacar();
		return avisoDeVoz(cuerpo?.error ?? "El audio no se pudo mandar. Probá de nuevo.");
	}
	if (d.tipo === "juan") {
		if (view.type === "juan" && (juanAbierto ?? null) === (d.chat ?? null)) juanAbierto = cuerpo.id;
		await loadState();
		return sacar();
	}
	if (d.tipo === "bandeja") void cargarHiloBandeja();
	lastBody = "";
	renderBody();
}

// ---------- Escuchar una nota de voz ----------
const sonidoNota = new Audio();
let notaSuena = null;
const notasAbiertas = new Set();
const barrasDe = onda => [...onda].map(c => `<i style="height:${Math.round(3 + ((c.charCodeAt(0) - 97) / 25) * 23)}px"></i>`).join("");
function notaHtml(archivo, segundos, onda, dice) {
	const suena = notaSuena === archivo && !sonidoNota.paused;
	const abierta = notasAbiertas.has(archivo);
	return `<span class="nvoz ${suena ? "suena" : ""}" data-nota="${esc(archivo)}" data-s="${segundos}"><button type="button" class="notap" data-nota-tocar aria-label="${suena ? "Pausar" : "Escuchar"}"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="pl" d="M8 5.5v13l11-6.5z"/><path class="pa" d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg></button><span class="notao" data-nota-ir aria-hidden="true"><span>${barrasDe(onda)}</span><span class="notaa">${barrasDe(onda)}</span></span><small class="notat">${vozReloj(segundos)}</small>${dice ? `<button type="button" class="notav" data-nota-ver aria-expanded="${abierta}">Texto</button>` : ""}</span>${dice ? `<span class="notad" ${abierta ? "" : "hidden"}>${inline(dice)}</span>` : ""}`;
}
function pintarNota() {
	for (const n of document.querySelectorAll(".nvoz")) {
		const es = n.dataset.nota === notaSuena;
		const s = Number(n.dataset.s);
		const va = es ? Math.min(1, sonidoNota.currentTime / s) : 0;
		n.classList.toggle("suena", es && !sonidoNota.paused);
		n.querySelector(".notaa").style.clipPath = `inset(0 ${((1 - va) * 100).toFixed(2)}% 0 0)`;
		n.querySelector(".notat").textContent = vozReloj(es && va ? sonidoNota.currentTime : s);
		n.querySelector(".notap").setAttribute("aria-label", es && !sonidoNota.paused ? "Pausar" : "Escuchar");
	}
	if (!sonidoNota.paused) requestAnimationFrame(pintarNota);
}
for (const ev of ["play", "pause", "seeked"]) sonidoNota.addEventListener(ev, pintarNota);
sonidoNota.addEventListener("ended", () => {
	notaSuena = null;
	pintarNota();
});
async function tocarNota(archivo, desde) {
	if (notaSuena === archivo && desde === undefined && !sonidoNota.paused) return sonidoNota.pause();
	if (notaSuena !== archivo) {
		notaSuena = archivo;
		sonidoNota.src = `/media/archivo?path=${encodeURIComponent(archivo)}`;
	}
	if (desde !== undefined) sonidoNota.currentTime = desde;
	await sonidoNota.play().catch(() => avisoDeVoz("Ese audio no se pudo reproducir."));
}

document.addEventListener("click", e => {
	const b = e.target.closest?.("[data-voz]");
	if (b) void grabarVoz(b.dataset.voz);
	if (e.target.closest?.("[data-voz-x]")) soltarVoz();
	const fin = e.target.closest?.("[data-voz-fin]");
	if (fin) void terminarVoz(fin.dataset.vozFin);
	const n = e.target.closest?.(".nvoz");
	if (!n) return;
	if (e.target.closest("[data-nota-tocar]")) void tocarNota(n.dataset.nota);
	const onda = e.target.closest("[data-nota-ir]");
	if (onda) {
		const r = onda.getBoundingClientRect();
		void tocarNota(n.dataset.nota, Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * Number(n.dataset.s));
	}
	const ver = e.target.closest("[data-nota-ver]");
	if (ver) {
		const abrir = !notasAbiertas.delete(n.dataset.nota);
		if (abrir) notasAbiertas.add(n.dataset.nota);
		ver.setAttribute("aria-expanded", String(abrir));
		const d = n.nextElementSibling;
		if (d?.classList.contains("notad")) d.hidden = !abrir;
	}
});
document.addEventListener("keydown", e => {
	if (!voz || e.key !== "Escape") return;
	e.preventDefault();
	e.stopPropagation();
	soltarVoz();
}, true);
