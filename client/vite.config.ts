import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Allow external access
    port: 3008, // Use port 3008 since other ports are taken
    proxy: {
      '/api': {
        target: 'http://192.168.42.42:5001',
        changeOrigin: true,
        secure: false,
      },
      '/launch': {
        target: 'http://192.168.42.42:5001',
        changeOrigin: true,
        secure: false,
      },
      '/test': {
        target: 'http://192.168.42.42:5001',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://192.168.42.42:5001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
