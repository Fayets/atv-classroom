// Arranca el servidor de desarrollo en modo mock: datos de prueba, sin backend ni base.
// Uso: npm run dev:mock (desde frontend/). `npm run dev` sigue pegándole al backend real.
import { createServer } from 'vite'

process.env.VITE_MOCK_API = '1'

const server = await createServer({ server: { port: Number(process.env.PORT) || 5173 } })
await server.listen()
server.printUrls()
server.bindCLIShortcuts({ print: true })
