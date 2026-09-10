import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: Number(process.env.DEV_PORT ?? 5180),
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${process.env.API_PORT ?? 5181}` },
  },
})
