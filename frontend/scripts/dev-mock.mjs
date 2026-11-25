// Arranca el servidor de desarrollo en modo mock: datos de prueba, sin backend ni base.
// Uso: npm run dev:mock (desde frontend/). `npm run dev` sigue pegándole al backend real.
// Con `npm run dev:mock -- --host` también se abre en la red local, para probarlo desde el celular (mismo Wi-Fi).
import { createServer } from 'vite'

process.env.VITE_MOCK_API = '1'

const enRed = process.argv.includes('--host')
const server = await createServer({ server: { port: Number(process.env.PORT) || 5173, host: enRed ? true : undefined } })
await server.listen()
server.printUrls()
server.bindCLIShortcuts({ print: true })
