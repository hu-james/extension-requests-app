import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
const backendUrl = process.env.VITE_API_URL || 'http://localhost:5001'

export default defineConfig({
  base: '/client/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3008,
    proxy: {
      '/api':     { target: backendUrl, changeOrigin: true, secure: false },
      '/launch':  { target: backendUrl, changeOrigin: true, secure: false },
      '/test':    { target: backendUrl, changeOrigin: true, secure: false },
      '/uploads': { target: backendUrl, changeOrigin: true, secure: false },
    },
  },
})
