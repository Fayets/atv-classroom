import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En local el backend corre en :8000; API_PORT permite otro puerto si ese está ocupado.
const api = `http://localhost:${process.env.API_PORT || 8000}`

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // ws: true para que el WebSocket de mensajes (/api/ws) también pase por el proxy.
      '/api': { target: api, ws: true },
      '/health': api,
      '/uploads': api,
    },
  },
})
