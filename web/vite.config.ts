import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The whole reason there is no CORS config anywhere: in dev Vite proxies /api to
    // FastAPI, and in the demo build FastAPI serves dist/ itself. One origin either way.
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
