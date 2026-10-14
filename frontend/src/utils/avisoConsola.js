// Aviso en la consola del navegador (Inspeccionar → Consola), como el de Instagram: frena a quien le
// pidieron pegar código ahí. Es contra el engaño ("self-XSS"), no reemplaza la seguridad del servidor.
// Para los curiosos: Juan es una persona pública y al link entran a husmear.
const RATA = `
      _   _
     (q\\-/p)
      /. .\\          ___
     =\\_t_/=    .-~~   ~~-.
       /   \\   /           \\
      ((   ))-'     ATV     )
      /\\) (/\\______________/~~~~~~~~~~
`

export function avisoConsola() {
  if (!import.meta.env.PROD) return
  const grande = 'color:#e63946;font-size:56px;font-weight:800;font-family:system-ui,sans-serif;-webkit-text-stroke:1px #000'
  const texto = 'font-size:18px;line-height:1.5;font-family:system-ui,sans-serif'
  console.log('%c' + RATA, 'font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.2;color:#8e8e93')
  console.log('%cHola, ratita 🐀 Si viniste a buscar puertos abiertos o endpoints sin clave: acá no hay queso 🧀', 'font-size:16px;font-weight:600;font-family:system-ui,sans-serif')
  console.log('%c¡Detente!', grande)
  console.log(
    '%cEsta función del navegador está pensada para desarrolladores. Si alguien te pidió que copies y pegues algo acá para "habilitar" una función o para "entrar" a la cuenta de otra persona, es una estafa: le estarías dando acceso a tu cuenta de ATV.',
    texto,
  )
  console.log('%cSi tenés dudas, escribile a tu coach.', texto)
}
