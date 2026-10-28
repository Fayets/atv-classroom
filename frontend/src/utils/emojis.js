import github from 'emojibase-data/en/shortcodes/github.json'

// Los :atajos: de Discord/GitHub (":warning:", ":hourglass_flowing_sand:") pasados a emoji.
const desdeHex = (hex) => {
  const puntos = hex.split('-').map((h) => parseInt(h, 16))
  // Un solo símbolo viejo (⚠, ✔, ❤) sin el selector se ve como texto en algunos sistemas.
  return String.fromCodePoint(...puntos) + (puntos.length === 1 && puntos[0] < 0x1f000 ? '️' : '')
}

export const ATAJOS = new Map()
for (const [hex, codigos] of Object.entries(github)) {
  for (const c of [].concat(codigos)) if (!ATAJOS.has(c)) ATAJOS.set(c, desdeHex(hex))
}

const ATAJO = /:([a-z0-9_+-]{2,40}):/gi

export function conEmojis(texto) {
  if (!texto || !texto.includes(':')) return texto
  // Dos pasadas: en ":warning::hourglass:" la primera se come los dos puntos que comparten.
  let salida = texto
  for (let i = 0; i < 2; i++) salida = salida.replace(ATAJO, (todo, c) => ATAJOS.get(c.toLowerCase()) || todo)
  return salida
}

// Los que más se usan van primero cuando empiezan igual (":fi" → 🔥 antes que 👊).
const FRECUENTES = ['fire', 'thumbsup', 'heart', 'joy', 'pray', 'rocket', 'white_check_mark', 'eyes', 'clap', 'muscle', 'tada', 'warning', 'hourglass_flowing_sand', 'raised_hands', 'smile', 'sweat_smile', '100', 'x', 'point_right', 'star']

// Lo que va sugiriendo al escribir ":fu" — primero los que empiezan así, después los que lo contienen.
export function buscarAtajos(q, max = 8) {
  const b = q.toLowerCase()
  const empiezan = FRECUENTES.filter((c) => c.startsWith(b)).map((codigo) => ({ codigo, emoji: ATAJOS.get(codigo) }))
  const contienen = []
  for (const [codigo, emoji] of ATAJOS) {
    if (codigo.startsWith(b)) empiezan.push({ codigo, emoji })
    else if (codigo.includes(b)) contienen.push({ codigo, emoji })
    if (empiezan.length >= max * 2) break
  }
  const vistos = new Set()
  return [...empiezan, ...contienen].filter((x) => !vistos.has(x.emoji) && vistos.add(x.emoji)).slice(0, max)
}
