import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-only convenience: `vite dev` serves this app on its own origin (e.g.
// localhost:5173), while the local Platform Application backend
// (docker-compose.dev.yml) only allows CORS from its own origin
// (CORS_ALLOWED_ORIGINS=http://localhost:8080) and sets its DEV-auth cookie
// SameSite=Lax -- a cross-origin fetch would neither get a CORS header nor
// reliably carry the cookie back. Proxying /api makes the browser see one
// origin, so DEV Mock Auth's cookie round-trips correctly. Does not affect
// `vite build` (production bundle never talks to this proxy). Target is
// configurable, never hardcoded into the built app.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_PROXY_TARGET ?? 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
