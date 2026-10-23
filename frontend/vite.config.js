import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Cada compilación tiene su versión: la app la compara con /version.json y se actualiza sola.
const VERSION = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
const version = () => ({
  name: 'atv-version',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: VERSION }) })
  },
})

// En local el backend corre en :8000; API_PORT permite otro puerto si ese está ocupado.
const api = `http://localhost:${process.env.API_PORT || 8000}`

export default defineConfig(({ command }) => ({
  plugins: [react(), version()],
  // En local no hay versiones: el servidor de desarrollo ya recarga solo.
  define: { __VERSION__: JSON.stringify(command === 'build' ? VERSION : 'dev') },
  server: {
    proxy: {
      // ws: true para que el WebSocket de mensajes (/api/ws) también pase por el proxy.
      '/api': { target: api, ws: true },
      '/health': api,
      '/uploads': api,
    },
  },
}))
