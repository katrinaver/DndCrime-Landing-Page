import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Лендинг отдаётся с корня домена, но его ассеты живут под /l/,
  // чтобы не пересекаться с /assets/ основной SPA на том же домене
  base: '/l/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
})
